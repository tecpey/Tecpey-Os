// The request edge's tenant assertion (multi-tenant #20, roadmap 7.1.3).
//
// Four pieces of this chain already existed and none of them were connected to a
// request:
//
//   platform_tenant_domains  ->  loadTenantHostDirectory   (host -> binding)
//   Host header              ->  resolveTenantHostHint     (untrusted -> hint)
//   hint + session           ->  resolveRequestTenant      (hint -> acting tenant)
//   acting tenant            ->  resolveTenantPrincipalContext
//
// `resolveRequestTenant` and `resolveTenantHostHint` had zero production callers.
// Everything was proven in isolation and then never wired, so a white-label host
// resolved to nothing and every request fell through to the platform default.
// This module is that wiring, and only that.
//
// Two properties are deliberate.
//
// **Inert without a configured domain.** When the Host header names no row in
// platform_tenant_domains there is no hint, and this returns null — the caller
// then resolves exactly as it does today. On a deployment with no custom domains
// the directory is empty, every request returns null, and nothing changes. The
// assertion path only comes alive for a host someone deliberately bound.
//
// **A hint is advice, never authority.** `resolveRequestTenant` honors a hint
// only when it names a tenant the principal is actually bound to, which is why
// the principal's own active bindings are loaded and passed as the allow-list. A
// host naming a tenant the caller has no claim to is discarded rather than
// honored, and the caller falls back to its own tenant — a spoofed or foreign
// Host can never move a request into someone else's tenant.

import { logger } from "@/lib/logger";
import { withDb } from "@/lib/db";
import { PLATFORM } from "@/lib/platform-config";
import { loadTenantHostDirectory } from "./tenant-domain-directory";
import { resolveRequestTenant } from "./request-tenant-resolution";
import {
  resolveTenantHostHint,
  type TenantHostLookup,
} from "./tenant-host-resolution";

/** Anything carrying request headers — NextRequest satisfies this, as do fakes. */
export interface HeaderCarrier {
  headers: { get(name: string): string | null };
}

export type AssertedRequestTenant = {
  tenantId: string;
  workspaceId: string;
  /** Always "host": nothing else in this module constitutes an assertion. */
  source: "host";
};

/**
 * The domain directory is a full read of platform_tenant_domains, so it is
 * cached per process rather than queried per request. A newly bound domain
 * therefore takes up to one TTL to become routable, which is the intended
 * trade: custom domains change on human timescales, requests do not.
 */
const DIRECTORY_TTL_MS = 60_000;
let cachedDirectory: { lookup: TenantHostLookup; loadedAt: number } | null = null;

/** Test seam — a suite that seeds a domain must not wait out the TTL. */
export function resetTenantHostDirectoryCache(): void {
  cachedDirectory = null;
}

async function hostDirectory(): Promise<TenantHostLookup | null> {
  const now = Date.now();
  if (cachedDirectory && now - cachedDirectory.loadedAt < DIRECTORY_TTL_MS) {
    return cachedDirectory.lookup;
  }

  const result = await withDb((client) => loadTenantHostDirectory(client));
  if (!result.enabled) {
    // No database means no directory. Returning null yields no hint, so the
    // caller resolves from the session exactly as it would with no custom
    // domains configured. A stale cache is not served in its place: an
    // unreachable directory must not keep routing hosts on old bindings.
    cachedDirectory = null;
    return null;
  }

  cachedDirectory = { lookup: result.value, loadedAt: now };
  return result.value;
}

type ActiveBinding = { tenant_id: string; workspace_id: string };

/**
 * The tenants this principal may act in — its own active bindings. This is the
 * allow-list `resolveRequestTenant` checks a hint against, and it is what stops
 * a host from naming a tenant the caller has no claim to.
 */
async function activeBindings(
  principalType: string,
  principalId: string,
): Promise<ActiveBinding[] | null> {
  const result = await withDb(async (client) => {
    const { rows } = await client.query<ActiveBinding>(
      `SELECT binding.tenant_id, binding.workspace_id
         FROM platform_principal_bindings binding
         JOIN platform_workspaces workspace
           ON workspace.id = binding.workspace_id
          AND workspace.tenant_id = binding.tenant_id
        WHERE binding.principal_type = $1
          AND binding.principal_id = $2
          AND binding.status = 'active'
        ORDER BY
          CASE WHEN binding.tenant_id = $3 THEN 0 ELSE 1 END,
          binding.created_at ASC`,
      [principalType, principalId, PLATFORM.DEFAULT_TENANT_ID],
    );
    return rows;
  });
  return result.enabled ? result.value : null;
}

/**
 * Resolve the tenant the request's Host header asserts for this principal, or
 * null when nothing is asserted and the caller should resolve as it does today.
 *
 * Null is returned — deliberately, not as a failure — when the header names no
 * bound domain, when the directory is unavailable, or when the principal has no
 * bindings to check a hint against. In each case there is no evidence of an
 * acting tenant, and inventing one is exactly what this whole programme is
 * about not doing.
 */
export async function resolveRequestTenantAssertion(input: {
  request: HeaderCarrier | null | undefined;
  principalType: string;
  principalId: string;
}): Promise<AssertedRequestTenant | null> {
  if (!input.request) return null;

  const directory = await hostDirectory();
  if (!directory) return null;

  const hint = resolveTenantHostHint(
    input.request.headers.get("host"),
    directory,
  );
  // No bound domain named this host: nothing was asserted. Skipping the binding
  // query here is what keeps a default-domain request at its present cost.
  if (!hint) return null;

  const bindings = await activeBindings(input.principalType, input.principalId);
  if (!bindings || bindings.length === 0) return null;

  const own = bindings[0];
  const resolved = resolveRequestTenant({
    hintTenantId: hint.hintTenantId,
    hintWorkspaceId: hint.hintWorkspaceId,
    hintSource: hint.hintSource,
    sessionTenantId: own.tenant_id,
    sessionWorkspaceId: own.workspace_id,
    allowedTenantIds: bindings.map((binding) => binding.tenant_id),
    defaultTenantId: PLATFORM.DEFAULT_TENANT_ID,
    defaultWorkspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
  });

  // Only "host" is an assertion. A "session" or "default" result means the hint
  // was discarded — the host named a tenant this principal has no claim to — and
  // the answer it would give is the one the caller reaches on its own anyway, so
  // returning null keeps a discarded hint from hardening into a filter.
  if (resolved.source !== "host") return null;

  if (resolved.tenantId !== hint.hintTenantId) {
    // resolveRequestTenant must never report "host" for a tenant the hint did
    // not name. Refusing costs one request and stops a resolver bug from
    // becoming a cross-tenant one.
    logger.warn("[request-tenant-assertion] host source disagreed with hint", {
      hinted: hint.hintTenantId,
      resolved: resolved.tenantId,
    });
    return null;
  }

  return {
    tenantId: resolved.tenantId,
    workspaceId: resolved.workspaceId,
    source: "host",
  };
}
