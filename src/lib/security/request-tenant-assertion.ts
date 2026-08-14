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
 * What the request's Host header says about the acting tenant.
 *
 *  - `asserted`     — the host names a configured tenant domain this principal
 *                     is bound to; that tenant acts.
 *  - `none`         — the host names no configured domain (the default domain),
 *                     or the directory/binding store could not be read, so the
 *                     host asserts nothing and the caller resolves as it would
 *                     with no custom domains at all.
 *  - `foreign_host` — the host names a configured tenant domain this principal
 *                     is NOT bound to. This is not "no assertion": the request
 *                     is on someone else's branded site, and the caller must
 *                     refuse rather than fall back to the principal's own
 *                     tenant. For a table with no tenant column that fallback
 *                     would otherwise serve the principal's global data under a
 *                     tenant it has no relationship with.
 */
export type RequestTenantAssertion =
  | { status: "asserted"; tenantId: string; workspaceId: string }
  | { status: "none" }
  | { status: "foreign_host" };

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

/**
 * The cached host->tenant lookup, or null when no directory can be loaded.
 *
 * Exposed because CSRF origin verification needs the same single source of
 * truth: a tenant's own domain has to be recognizable as same-site, and it must
 * be recognized from `platform_tenant_domains` rather than from the
 * attacker-controlled Host header.
 */
export async function lookupTenantHost(): Promise<TenantHostLookup | null> {
  return hostDirectory();
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
  try {
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
  } catch (error) {
    // withDb reports a missing pool as unavailable but rethrows when a live pool
    // fails to connect or the query errors. Either way the bindings are
    // unreadable, which the caller treats as no assertion — advisory, not a
    // hardened refusal — rather than letting the rejection escape.
    logger.warn("[request-tenant-assertion] binding read failed", {
      principalType,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Resolve what the request's Host header asserts about the acting tenant.
 *
 * `none` is returned — deliberately, not as a failure — when the header names no
 * configured domain, or when the directory or binding store could not be read.
 * In each case there is no trustworthy evidence about a custom domain, and the
 * caller resolves as it would with none configured.
 *
 * `foreign_host` is the case that used to be folded into that same null: the
 * host DOES name a configured tenant domain, but this principal is not bound to
 * it. Reporting it distinctly is what lets the caller refuse rather than fall
 * back to the principal's own tenant — the fallback that, for a table with no
 * tenant column, would serve the principal's global rows under a stranger's
 * brand.
 */
export async function resolveRequestTenantAssertion(input: {
  request: HeaderCarrier | null | undefined;
  principalType: string;
  principalId: string;
}): Promise<RequestTenantAssertion> {
  if (!input.request) return { status: "none" };

  const directory = await hostDirectory();
  if (!directory) return { status: "none" };

  const hint = resolveTenantHostHint(
    input.request.headers.get("host"),
    directory,
  );
  // No configured domain named this host: nothing was asserted. Skipping the
  // binding query here is what keeps a default-domain request at its present
  // cost.
  if (!hint) return { status: "none" };

  const bindings = await activeBindings(input.principalType, input.principalId);
  // The binding store could not be read. The host is configured, but whether the
  // principal is bound to it is unknowable right now, so this stays advisory
  // rather than hardening a transient outage into a refusal.
  if (bindings === null) return { status: "none" };

  // From here the host names a configured tenant domain, so it IS asserting a
  // tenant. The only question is whether this principal may act in it.
  const own = bindings[0];
  const resolved = resolveRequestTenant({
    hintTenantId: hint.hintTenantId,
    hintWorkspaceId: hint.hintWorkspaceId,
    hintSource: hint.hintSource,
    sessionTenantId: own?.tenant_id ?? "",
    sessionWorkspaceId: own?.workspace_id ?? "",
    allowedTenantIds: bindings.map((binding) => binding.tenant_id),
    defaultTenantId: PLATFORM.DEFAULT_TENANT_ID,
    defaultWorkspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
  });

  // "session"/"default" means the hint was discarded — the principal is not
  // bound to the tenant this configured host names. That is a foreign host, not
  // an absence of assertion, so the caller must refuse rather than fall back.
  if (resolved.source !== "host" || resolved.tenantId !== hint.hintTenantId) {
    if (resolved.source === "host") {
      // resolveRequestTenant must never report "host" for a tenant the hint did
      // not name; treat a disagreement as foreign rather than trust it.
      logger.warn("[request-tenant-assertion] host source disagreed with hint", {
        hinted: hint.hintTenantId,
        resolved: resolved.tenantId,
      });
    }
    return { status: "foreign_host" };
  }

  return {
    status: "asserted",
    tenantId: resolved.tenantId,
    workspaceId: resolved.workspaceId,
  };
}
