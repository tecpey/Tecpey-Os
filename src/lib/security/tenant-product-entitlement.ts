// The tenant's product entitlement, enforced at the request boundary
// (multi-tenant #20, section 3.3 of MULTI_TENANT_WHITE_LABEL_ARCHITECTURE.md).
//
// `platform_tenants.products[]` has existed since migration 0001. It is selected
// by `getTenant`, carried on the `Tenant` type, and — until this module — read
// by nothing at all. `src/lib/route-guards.ts`, which holds the `requireTenant`
// and `requireFeature` guards this was meant to grow into, has no importer
// anywhere in `src`. So the product half of "multi-tenant and white-label by
// architecture, code and product contract" was a column and a type and no
// enforcement: a tenant provisioned without Academy was served every Academy
// route exactly like one that bought it.
//
// This is the enforcement, and only that. The decision itself lives in
// `isProductEnabledForTenant`, which is pure and ANDs the platform flag with the
// tenant's entitlement; this module is what reads the tenant and gives routes a
// verdict they can return.

import type { NextResponse } from "next/server";
import { apiError } from "@/lib/api-validation";
import { withDb } from "@/lib/db";
import {
  isProductEnabledForTenant,
  PRODUCTS,
  type ProductId,
} from "@/lib/product-registry";

export type TenantProductVerdict =
  | { entitled: true }
  | {
      entitled: false;
      /**
       * `product_disabled` — the platform is not running this product.
       * `product_not_entitled` — the tenant was not provisioned with it.
       * `entitlement_unavailable` — the entitlement could not be read, which is
       * refused rather than assumed. A gate that opens when its evidence is
       * missing is not a gate.
       */
      reason:
        | "product_disabled"
        | "product_not_entitled"
        | "entitlement_unavailable";
    };

/**
 * Entitlements are read per request but change on human timescales, so they are
 * cached per process for a short window rather than queried every time — the
 * same trade the tenant domain directory makes, and for the same reason. A
 * changed entitlement takes up to one TTL to take effect.
 */
const ENTITLEMENT_TTL_MS = 60_000;

type CachedEntitlement = { products: string[]; loadedAt: number };
const cache = new Map<string, CachedEntitlement>();

/** Test seam — a suite that provisions a tenant must not wait out the TTL. */
export function resetTenantProductEntitlementCache(): void {
  cache.clear();
}

async function tenantProducts(tenantId: string): Promise<string[] | null> {
  const now = Date.now();
  const cached = cache.get(tenantId);
  if (cached && now - cached.loadedAt < ENTITLEMENT_TTL_MS) return cached.products;

  const result = await withDb(async (client) => {
    const { rows } = await client.query<{ products: string[] | null }>(
      "SELECT products FROM platform_tenants WHERE id = $1 LIMIT 1",
      [tenantId],
    );
    return rows[0] ?? null;
  });
  if (!result.enabled) {
    // No database means no evidence of an entitlement. A stale entry is not
    // served in its place: an unreachable authority must not keep a tenant
    // entitled to something it may no longer hold.
    cache.delete(tenantId);
    return null;
  }
  // A tenant id that resolves to no row is cached as entitled to nothing, so a
  // request naming an unknown tenant does not re-query on every attempt.
  const products = result.value?.products ?? [];
  cache.set(tenantId, { products, loadedAt: now });
  return products;
}

/**
 * The verdict for serving `productId` to `tenantId`.
 *
 * Routes call this after they have resolved the acting tenant, so the
 * entitlement is checked against the tenant the request actually acts in rather
 * than the platform default.
 */
export async function tenantProductVerdict(
  tenantId: string,
  productId: ProductId,
): Promise<TenantProductVerdict> {
  // Checked before any read: a product the platform is not running is refused
  // for every tenant, and there is nothing to look up.
  if (!PRODUCTS[productId]?.isEnabled()) {
    return { entitled: false, reason: "product_disabled" };
  }

  const products = await tenantProducts(tenantId);
  if (products === null) {
    return { entitled: false, reason: "entitlement_unavailable" };
  }
  if (!isProductEnabledForTenant({ products }, productId)) {
    return { entitled: false, reason: "product_not_entitled" };
  }
  return { entitled: true };
}

/** The HTTP status each refusal answers with. */
export function tenantProductStatus(
  reason: Exclude<TenantProductVerdict, { entitled: true }>["reason"],
): number {
  return reason === "entitlement_unavailable" ? 503 : 403;
}

/**
 * The guard-return form, matching the shape route handlers already use:
 * returns null when the tenant may be served the product, or the response to
 * return when it may not.
 *
 *   const gate = await requireTenantProduct(tenantContext.tenantId, "academy");
 *   if (gate) return gate;
 */
export async function requireTenantProduct(
  tenantId: string,
  productId: ProductId,
): Promise<NextResponse | null> {
  const verdict = await tenantProductVerdict(tenantId, productId);
  if (verdict.entitled) return null;
  return apiError(verdict.reason, tenantProductStatus(verdict.reason));
}
