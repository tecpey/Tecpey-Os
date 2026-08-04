// Request-level tenant resolution (multi-tenant P0, issue #20).
//
// Turns an untrusted request-edge hint (a host/subdomain or X-Tecpey-Tenant
// header that src/proxy.ts will later provide) plus the authenticated session's
// tenant into the single tenant a request acts in. This is the security core of
// multi-tenancy, so it is a PURE function with explicit inputs — no DB, no
// proxy, no session plumbing — and can be exhaustively unit-tested before any
// host routing is trusted.
//
// The one non-negotiable invariant: the request-edge hint is ADVICE, not
// authority. A hint is honored only when it names a tenant the session is
// actually allowed to act in; a hint for any other tenant is ignored and
// resolution falls back to the session (then the default). A hint can therefore
// never ESCALATE a request into a tenant the caller has no claim to.

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
 * Resolve the acting tenant for a request. Precedence: a session-allowed edge
 * hint (host/header) → the session's own tenant → the platform default. An edge
 * hint that is not in the session's allowed set is discarded (never escalates).
 */
export function resolveRequestTenant(input: RequestTenantInput): ResolvedRequestTenant {
  const defaultTenantId = clean(input.defaultTenantId) || "tecpey";
  const defaultWorkspaceId = clean(input.defaultWorkspaceId) || "main";

  const sessionTenantId = clean(input.sessionTenantId);
  const sessionWorkspaceId = clean(input.sessionWorkspaceId);

  // The set of tenants this request may resolve to: the explicit allow-list plus
  // the session's own tenant (always allowed) plus the default (always allowed).
  const allowed = new Set<string>([defaultTenantId]);
  for (const id of input.allowedTenantIds ?? []) {
    const t = clean(id);
    if (t) allowed.add(t);
  }
  if (sessionTenantId) allowed.add(sessionTenantId);

  const hintTenantId = clean(input.hintTenantId);
  const hintSource = input.hintSource === "host" || input.hintSource === "header"
    ? input.hintSource
    : null;

  // 1. Honor an edge hint ONLY if it names an allowed tenant.
  if (hintTenantId && hintSource && allowed.has(hintTenantId)) {
    return {
      tenantId: hintTenantId,
      workspaceId: clean(input.hintWorkspaceId) || defaultWorkspaceId,
      source: hintSource,
    };
  }

  // 2. Fall back to the authenticated session's own tenant.
  if (sessionTenantId) {
    return {
      tenantId: sessionTenantId,
      workspaceId: sessionWorkspaceId || defaultWorkspaceId,
      source: "session",
    };
  }

  // 3. Fail closed to the platform default.
  return {
    tenantId: defaultTenantId,
    workspaceId: defaultWorkspaceId,
    source: "default",
  };
}
