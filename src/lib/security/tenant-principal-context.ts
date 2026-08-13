import { withDb } from "@/lib/db";
import { PLATFORM } from "@/lib/platform-config";
import type { CanonicalSession } from "@/lib/auth-session";
import { resolvePlatformContextInTenant } from "@/lib/tenant-service";

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
  | "principal_type_mismatch";

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

  const result = await withDb(async (client) => {
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
 * A caller that *has* an asserted tenant (a host or header hint run through
 * `resolveRequestTenant`) passes it here, and the filter applies as before.
 */
export async function resolveTenantPrincipalContext(input: {
  session: CanonicalSession;
  requiredPrincipalType: Exclude<TenantPrincipalType, "service">;
  scopes: string[];
  requestId: string;
  /** A tenant the request asserted and is entitled to. Never a default. */
  assertedTenantId?: string | null;
  assertedWorkspaceId?: string | null;
}): Promise<TenantPrincipalContext> {
  const principalId = sessionPrincipal(
    input.session,
    input.requiredPrincipalType,
  );
  if (!principalId) return { available: false, reason: "principal_missing" };

  const bound = await resolveBoundTenantPrincipal({
    principalType: input.requiredPrincipalType,
    principalId,
    preferredTenantId: input.assertedTenantId ?? null,
    preferredWorkspaceId: input.assertedWorkspaceId ?? null,
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
