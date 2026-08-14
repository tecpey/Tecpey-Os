/**
 * Central product registry.
 * Every product TecPey hosts is declared here with its ID, slug,
 * required permission, feature flag, and runtime enabled state.
 * Add new products here — do not scatter product metadata across the codebase.
 */

import type { ProductId } from "./platform-types";
import { isFeatureEnabled, type FeatureFlag } from "./feature-flags";

export type { ProductId };

export type Product = {
  id: ProductId;
  slug: string;
  displayName: string;
  description: string;
  /** Minimum permission a session must hold to access this product. */
  requiredPermission: string;
  featureFlag: FeatureFlag | null;
  /** Returns true if this product is currently enabled by its feature flag. */
  isEnabled: () => boolean;
};

export const PRODUCTS: Record<ProductId, Product> = {
  exchange: {
    id: "exchange",
    slug: "exchange",
    displayName: "TecPey Exchange",
    description: "Cryptocurrency trading and portfolio management.",
    requiredPermission: "exchange.view",
    featureFlag: "exchange.enabled",
    isEnabled: () => isFeatureEnabled("exchange.enabled"),
  },
  academy: {
    id: "academy",
    slug: "academy",
    displayName: "TecPey Academy",
    description: "Structured crypto education from beginner to advanced.",
    requiredPermission: "academy.view",
    featureFlag: "academy.enabled",
    isEnabled: () => isFeatureEnabled("academy.enabled"),
  },
  social: {
    id: "social",
    slug: "social",
    displayName: "TecPey Social",
    description: "Community, groups, journals, and leaderboards.",
    requiredPermission: "social.view",
    featureFlag: "social.enabled",
    isEnabled: () => isFeatureEnabled("social.enabled"),
  },
  mentor: {
    id: "mentor",
    slug: "mentor",
    displayName: "TecPey AI Mentor",
    description: "AI-powered learning coach and personalized progress tracker.",
    requiredPermission: "mentor.chat",
    featureFlag: "mentor.enabled",
    isEnabled: () => isFeatureEnabled("mentor.enabled"),
  },
  knowledge: {
    id: "knowledge",
    slug: "knowledge-center",
    displayName: "Knowledge Center",
    description: "Reference library, glossary, and educational resources.",
    requiredPermission: "academy.view",
    featureFlag: null,
    isEnabled: () => true,
  },
  marketplace: {
    id: "marketplace",
    slug: "marketplace",
    displayName: "TecPey Marketplace",
    description: "Course marketplace and digital content storefront.",
    requiredPermission: "marketplace.access",
    featureFlag: "future.marketplace.enabled",
    isEnabled: () => isFeatureEnabled("future.marketplace.enabled"),
  },
};

/** Returns all products that are currently enabled via their feature flag. */
export function getEnabledProducts(): Product[] {
  return Object.values(PRODUCTS).filter((p) => p.isEnabled());
}

/** Looks up a product by its URL slug. Returns null if not found. */
export function getProductBySlug(slug: string): Product | null {
  return Object.values(PRODUCTS).find((p) => p.slug === slug) ?? null;
}

/**
 * Whether a tenant may be served a product (multi-tenant #20, section 3.3).
 *
 * Two gates, and a product needs both. `isEnabled()` is the platform flag — is
 * this product running on this deployment at all. `products[]` is the tenant's
 * entitlement — was this tenant provisioned with it. Neither implies the other:
 * a platform can run Academy while a white-label tenant bought only Exchange,
 * and a tenant entitled to Social must still not be served it on a deployment
 * where Social is switched off.
 *
 * `platform_tenants.products[]` has been carried on the row, loaded into the
 * `Tenant` type, and read by nothing since it was introduced. Until this
 * function had a caller, a tenant provisioned without Academy was served every
 * Academy route exactly like one that bought it.
 *
 * Fail-closed on both sides. An absent tenant is not entitled — the caller
 * resolved a tenant that does not exist, which is not a reason to serve it — and
 * an empty `products[]` means entitled to nothing, not "unspecified, so allow".
 * The only tenant any deployment seeds is `tecpey`, and migrations 0001 and 0046
 * both give it the full product list, so this changes nothing for it.
 */
export function isProductEnabledForTenant(
  tenant: { products: readonly string[] } | null | undefined,
  productId: ProductId,
): boolean {
  const product = PRODUCTS[productId];
  if (!product || !product.isEnabled()) return false;
  if (!tenant || !Array.isArray(tenant.products)) return false;
  return tenant.products.includes(productId);
}
