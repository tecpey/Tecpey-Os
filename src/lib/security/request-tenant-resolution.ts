// Request-level tenant resolution (multi-tenant P0, issue #20).
//
// Turns an untrusted request-edge hint (a host/subdomain or X-Tecpey-Tenant
// header that src/proxy.ts will later provide) plus the authenticated session's
// tenant into the single tenant a request acts in. This is the security core of
// multi-tenancy, so it is a PURE function with explicit inputs — no DB, no
// proxy, no session plumbing — and can be exhaustively unit-tested before any
// host routing is trusted.
//
// Two invariants carry the security weight:
//  1. The edge hint is ADVICE, not authority. A hint is honored only when it
//     names a tenant the session is actually allowed to act in. The platform
//     default tenant is NOT implicitly allowed for hints — otherwise a session
//     scoped to one non-default tenant could force a default-tenant hint to win
//     over its own tenant. A hint can therefore never move a request into a
//     tenant the caller has no claim to (including the default).
//  2. A resolved tenant is only ever paired with a workspace that provably
//     belongs to it: an explicit workspace that travels with the hint, the
//     session's workspace for the session's own tenant, or the platform default
//     workspace for the default tenant. The global default workspace is never
//     grafted onto a non-default tenant.

export type RequestTenantSource = "host" | "header" | "session" | "default";

export type ResolvedRequestTenant = {
  tenantId: string;
  workspaceId: string;
  source: RequestTenantSource;
};

export type RequestTenantInput = {
  /** Tenant named by the request edge (host→tenant map or X-Tecpey-Tenant). Untrusted. */
  hintTenantId?: string | null;
  /** Workspace named by the edge hint, if any. */
  hintWorkspaceId?: string | null;
  /** Where the hint came from; only "host"/"header" are edge hints. */
  hintSource?: "host" | "header" | null;
  /** The tenant the authenticated session already resolves to (may be absent for guests). */
  sessionTenantId?: string | null;
  sessionWorkspaceId?: string | null;
  /**
   * Tenants the session is allowed to act in (its active memberships/bindings).
   * The session's own tenant is always treated as allowed. Empty for guests.
   */
  allowedTenantIds?: readonly string[];
  /** Platform fallbacks (PLATFORM.DEFAULT_TENANT_ID / DEFAULT_WORKSPACE_ID). */
  defaultTenantId: string;
  defaultWorkspaceId: string;
};

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The workspace to pair with `tenantId`, or null when no workspace can be
 * *safely* bound to it in this pure layer. Trusted pairings only: an explicit
 * workspace that travels with the tenant's own source, the session's workspace
 * for the session's own tenant, or the default workspace for the default
 * tenant. Never the global default workspace grafted onto a non-default tenant.
 */
function workspaceForTenant(
  tenantId: string,
  ctx: {
    explicitWorkspaceId?: string | null;
    sessionTenantId: string;
    sessionWorkspaceId: string;
    defaultTenantId: string;
    defaultWorkspaceId: string;
  },
): string | null {
  const explicit = clean(ctx.explicitWorkspaceId);
  if (explicit) return explicit;
  if (tenantId === ctx.sessionTenantId && ctx.sessionWorkspaceId) return ctx.sessionWorkspaceId;
  if (tenantId === ctx.defaultTenantId) return ctx.defaultWorkspaceId;
  return null;
}

/**
 * Resolve the acting tenant + workspace for a request. Precedence: a
 * session-allowed edge hint (host/header) → the session's own tenant → the
 * platform default. A hint that is not session-allowed, or that cannot be paired
 * with a workspace provably belonging to it, is discarded (never escalates).
 */
export function resolveRequestTenant(input: RequestTenantInput): ResolvedRequestTenant {
  const defaultTenantId = clean(input.defaultTenantId) || "tecpey";
  const defaultWorkspaceId = clean(input.defaultWorkspaceId) || "main";
  const sessionTenantId = clean(input.sessionTenantId);
  const sessionWorkspaceId = clean(input.sessionWorkspaceId);

  // Tenants this request may resolve to via a hint: the explicit allow-list plus
  // the session's own tenant. The default is NOT auto-added (see invariant 1).
  const allowed = new Set<string>();
  for (const id of input.allowedTenantIds ?? []) {
    const t = clean(id);
    if (t) allowed.add(t);
  }
  if (sessionTenantId) allowed.add(sessionTenantId);

  const hintTenantId = clean(input.hintTenantId);
  const hintSource = input.hintSource === "host" || input.hintSource === "header"
    ? input.hintSource
    : null;

  const wsCtx = { sessionTenantId, sessionWorkspaceId, defaultTenantId, defaultWorkspaceId };

  // 1. Honor an edge hint only if it names an allowed tenant AND yields a
  //    workspace that provably belongs to that tenant.
  if (hintTenantId && hintSource && allowed.has(hintTenantId)) {
    const workspaceId = workspaceForTenant(hintTenantId, {
      explicitWorkspaceId: input.hintWorkspaceId,
      ...wsCtx,
    });
    if (workspaceId !== null) {
      return { tenantId: hintTenantId, workspaceId, source: hintSource };
    }
  }

  // 2. Fall back to the authenticated session's own tenant.
  if (sessionTenantId) {
    const workspaceId = workspaceForTenant(sessionTenantId, {
      explicitWorkspaceId: sessionWorkspaceId,
      ...wsCtx,
    });
    if (workspaceId !== null) {
      return { tenantId: sessionTenantId, workspaceId, source: "session" };
    }
  }

  // 3. Fail closed to the platform default pair.
  return {
    tenantId: defaultTenantId,
    workspaceId: defaultWorkspaceId,
    source: "default",
  };
}
