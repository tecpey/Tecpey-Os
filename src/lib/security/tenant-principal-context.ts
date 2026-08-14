import { withDb } from "@/lib/db";
import { PLATFORM } from "@/lib/platform-config";
import type { CanonicalSession } from "@/lib/auth-session";
import { resolvePlatformContextInTenant } from "@/lib/tenant-service";
import {
  resolveRequestTenantAssertion,
  type HeaderCarrier,
} from "./request-tenant-assertion";

export type TenantPrincipalType =
  | "student"
  | "account"
  | "user"
  | "admin"
  | "service";

export type TenantPrincipalUnavailableReason =
  | "principal_missing"
  | "binding_storage_unavailable"
  | "binding_missing"
  | "binding_revoked"
  | "workspace_mismatch"
  | "principal_type_mismatch"
  // The request is on a configured tenant domain the principal is not bound to.
  // Distinct from binding_missing: the principal may well be bound to another
  // tenant, but not to the one whose branded host this request arrived on, so it
  // may not act — or be read — under it.
  | "host_tenant_mismatch";

export type AvailableTenantPrincipalContext = {
  available: true;
  tenantId: string;
  workspaceId: string;
  principalType: TenantPrincipalType;
  principalId: string;
  roles: string[];
  scopes: string[];
  bindingSource: string;
  bindingStatus: "active";
  membershipId: string | null;
  requestId: string;
  authEvidence: {
    strictRevocation: true;
    sessionPrincipal: true;
  };
};

export type TenantPrincipalContext =
  | AvailableTenantPrincipalContext
  | {
      available: false;
      reason: TenantPrincipalUnavailableReason;
    };

type BindingRow = {
  tenant_id: string;
  workspace_id: string;
  principal_type: TenantPrincipalType;
  principal_id: string;
  status: "active" | "revoked";
  source: string;
};

function sessionPrincipal(
  session: CanonicalSession,
  requiredType: TenantPrincipalType,
): string | null {
  if (requiredType === "student") return session.studentId ?? null;
  if (requiredType === "account") return session.academyAccountId ?? null;
  if (requiredType === "admin") {
    return session.isAdmin ? session.userId ?? session.academyAccountId ?? null : null;
  }
  if (requiredType === "user") {
    return session.userId ?? session.academyAccountId ?? session.studentId ?? null;
  }
  return null;
}

export async function resolveBoundTenantPrincipal(input: {
  principalType: TenantPrincipalType;
  principalId: string;
  preferredTenantId?: string | null;
  preferredWorkspaceId?: string | null;
  roles?: string[];
  scopes: string[];
  membershipId?: string | null;
  requestId: string;
}): Promise<TenantPrincipalContext> {
  const principalId = input.principalId.trim();
  if (!principalId || input.principalType === "service") {
    return {
      available: false,
      reason:
        input.principalType === "service"
          ? "principal_type_mismatch"
          : "principal_missing",
    };
  }

  let result;
  try {
    result = await withDb(async (client) => {
      const selected = await client.query<BindingRow>(
        `SELECT binding.tenant_id,
                binding.workspace_id,
                binding.principal_type,
                binding.principal_id,
                binding.status,
                binding.source
           FROM platform_principal_bindings binding
           JOIN platform_workspaces workspace
             ON workspace.id = binding.workspace_id
            AND workspace.tenant_id = binding.tenant_id
          WHERE binding.principal_type = $1
            AND binding.principal_id = $2
            AND ($3::text IS NULL OR binding.tenant_id = $3)
          ORDER BY
            CASE WHEN binding.tenant_id = COALESCE($3, $5) THEN 0 ELSE 1 END,
            CASE WHEN binding.workspace_id = COALESCE($4, $6) THEN 0 ELSE 1 END,
            binding.created_at ASC
          LIMIT 1`,
        [
          input.principalType,
          principalId,
          input.preferredTenantId ?? null,
          input.preferredWorkspaceId ?? null,
          PLATFORM.DEFAULT_TENANT_ID,
          PLATFORM.DEFAULT_WORKSPACE_ID,
        ],
      );
      return selected.rows[0] ?? null;
    });
  } catch {
    // withDb reports a missing pool as unavailable but rethrows when a live pool
    // fails to connect or the query errors. A binding read that throws is an
    // outage, not a decision — reported as such rather than escaping as a 500,
    // so callers reach their degraded-read path instead of an unhandled error.
    return { available: false, reason: "binding_storage_unavailable" };
  }
  if (!result.enabled) {
    return { available: false, reason: "binding_storage_unavailable" };
  }
  const binding = result.value;
  if (!binding) return { available: false, reason: "binding_missing" };
  if (binding.status !== "active") {
    return { available: false, reason: "binding_revoked" };
  }
  if (binding.principal_type !== input.principalType) {
    return { available: false, reason: "principal_type_mismatch" };
  }
  if (
    input.preferredWorkspaceId &&
    binding.workspace_id !== input.preferredWorkspaceId
  ) {
    return { available: false, reason: "workspace_mismatch" };
  }

  return {
    available: true,
    tenantId: binding.tenant_id,
    workspaceId: binding.workspace_id,
    principalType: binding.principal_type,
    principalId: binding.principal_id,
    roles: [...new Set(input.roles ?? [])].sort(),
    scopes: [...new Set(input.scopes)].sort(),
    bindingSource: binding.source,
    bindingStatus: "active",
    membershipId: input.membershipId ?? null,
    requestId: input.requestId,
    authEvidence: {
      strictRevocation: true,
      sessionPrincipal: true,
    },
  };
}

/**
 * Resolve the tenant a session's principal is acting in.
 *
 * `preferredTenantId` is a *filter*, not a ranking: the resolver's
 * `($3::text IS NULL OR binding.tenant_id = $3)` predicate is the security core
 * that stops a request asserting tenant B from being handed tenant A's binding,
 * and platform-principal-binding-cross-tenant-isolation proves it. So it may
 * only ever carry a tenant the request genuinely asserted.
 *
 * This function used to feed it `resolvePlatformContext(...).tenantId`, which is
 * the hard-coded platform default and not an assertion by anything. The filter
 * then admitted the pair ('tecpey','main') and nothing else: a principal bound
 * only to another tenant resolved to `binding_missing`, and one in a non-default
 * workspace of the default tenant to `workspace_mismatch` — both verified
 * against a migrated database. Every route on this helper was therefore pinned
 * to the default tenant, and a principal outside it could not read or write at
 * all.
 *
 * With no assertion to honor, the preferences are left null and the resolver's
 * ORDER BY does the ranking it was written for: the default tenant/workspace
 * first, then the oldest binding. A principal can still only ever resolve to a
 * binding of its own, so this widens availability without widening reach.
 *
 * A caller that *has* an asserted tenant passes it here — either directly, or by
 * passing `request`, from which the Host header's bound tenant is resolved. The
 * filter then applies as before, so a white-label host reads that tenant and
 * only that tenant.
 */
export async function resolveTenantPrincipalContext(input: {
  session: CanonicalSession;
  requiredPrincipalType: Exclude<TenantPrincipalType, "service">;
  scopes: string[];
  requestId: string;
  /**
   * The incoming request. When given, its Host header is resolved against the
   * tenant domain directory and a bound domain asserts that tenant. A host that
   * names no bound domain — every request on the default domain — asserts
   * nothing and changes nothing.
   */
  request?: HeaderCarrier | null;
  /** A tenant the caller already asserted and is entitled to. Never a default. */
  assertedTenantId?: string | null;
  assertedWorkspaceId?: string | null;
  /**
   * A principal id the caller resolved from the session's own verified evidence,
   * for the case where the acting principal is not carried on the session as a
   * typed field. The profile bootstrap uses it: a returning student's session is
   * signed with studentId:null, so the student is discovered by the session's
   * verified account email, and its student_global data must still be gated on
   * THAT student's binding to the acting tenant. When set, the binding check and
   * foreign-host refusal apply to this principal. The caller must only ever pass
   * a principal the session is entitled to act as.
   */
  resolvedPrincipalId?: string | null;
}): Promise<TenantPrincipalContext> {
  const principalId =
    input.resolvedPrincipalId?.trim() ||
    sessionPrincipal(input.session, input.requiredPrincipalType);
  if (!principalId) return { available: false, reason: "principal_missing" };

  let assertedTenantId = input.assertedTenantId ?? null;
  let assertedWorkspaceId = input.assertedWorkspaceId ?? null;
  if (!assertedTenantId && input.request) {
    const asserted = await resolveRequestTenantAssertion({
      request: input.request,
      principalType: input.requiredPrincipalType,
      principalId,
    });
    if (asserted.status === "asserted") {
      assertedTenantId = asserted.tenantId;
      assertedWorkspaceId = asserted.workspaceId;
    } else if (asserted.status === "foreign_host") {
      // The request is on a configured tenant domain this principal is not bound
      // to. Falling back to the principal's own tenant here is exactly what
      // leaked a tenant-less table's global rows onto a stranger's branded site,
      // so the context is refused instead. A table WITH a tenant column would
      // merely have filtered to the wrong tenant; refusing is correct for both.
      return { available: false, reason: "host_tenant_mismatch" };
    }
    // "none": the host asserts nothing, so resolution proceeds unchanged.
  }

  const bound = await resolveBoundTenantPrincipal({
    principalType: input.requiredPrincipalType,
    principalId,
    preferredTenantId: assertedTenantId,
    preferredWorkspaceId: assertedWorkspaceId,
    scopes: input.scopes,
    requestId: input.requestId,
  });
  if (!bound.available) return bound;

  // Roles and membership are read in the tenant the binding named, so the whole
  // context describes one tenant rather than pairing a binding with the default
  // tenant's membership.
  const platform = await resolvePlatformContextInTenant(
    input.session,
    bound.tenantId,
    bound.workspaceId,
  );
  return {
    ...bound,
    roles: [...new Set(platform.roles)].sort(),
    membershipId: platform.membership?.id ?? null,
  };
}
