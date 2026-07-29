import { withDb } from "./db";
import { PLATFORM } from "./platform-config";
import type { Tenant, Workspace, Membership, Role, PlatformContext, TenantId, UserId } from "./platform-types";
import type { CanonicalSession } from "./auth-session";

type TenantRow = {
  id: string;
  slug: string;
  display_name: string;
  plan: string;
  owner_id: string | null;
  products: string[];
  created_at: string;
};

type WorkspaceRow = {
  id: string;
  tenant_id: string;
  slug: string;
  display_name: string;
  products: string[];
  settings: Record<string, unknown>;
};

type MembershipRow = {
  id: string;
  user_id: string;
  tenant_id: string;
  workspace_id: string | null;
  roles: string[];
  joined_at: string;
  expires_at: string | null;
};

function rowToTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    plan: row.plan as Tenant["plan"],
    ownerId: row.owner_id,
    products: (row.products ?? []) as Tenant["products"],
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date(row.created_at).toISOString(),
  };
}

function rowToMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    roles: (row.roles ?? []) as Role[],
    joinedAt: typeof row.joined_at === "string" ? row.joined_at : new Date(row.joined_at).toISOString(),
    expiresAt: row.expires_at ?? null,
  };
}

export async function getTenant(tenantId: TenantId): Promise<Tenant | null> {
  const result = await withDb(async (client) => {
    const { rows } = await client.query<TenantRow>(
      `SELECT id, slug, display_name, plan, owner_id, products, created_at
       FROM platform_tenants WHERE id = $1 LIMIT 1`,
      [tenantId],
    );
    return rows[0] ?? null;
  });
  if (!result.enabled || !result.value) return null;
  return rowToTenant(result.value);
}

export async function getDefaultTenant(): Promise<Tenant | null> {
  return getTenant(PLATFORM.DEFAULT_TENANT_ID);
}

export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  const result = await withDb(async (client) => {
    const { rows } = await client.query<WorkspaceRow>(
      `SELECT id, tenant_id, slug, display_name, products, settings
       FROM platform_workspaces WHERE id = $1 LIMIT 1`,
      [workspaceId],
    );
    return rows[0] ?? null;
  });
  if (!result.enabled || !result.value) return null;
  const row = result.value;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    slug: row.slug,
    displayName: row.display_name,
    products: (row.products ?? []) as Workspace["products"],
    settings: row.settings ?? {},
  };
}

export async function getMembership(userId: UserId, tenantId: TenantId): Promise<Membership | null> {
  const result = await withDb(async (client) => {
    const { rows } = await client.query<MembershipRow>(
      `SELECT id, user_id, tenant_id, workspace_id, roles, joined_at, expires_at
       FROM platform_memberships
       WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [userId, tenantId],
    );
    return rows[0] ?? null;
  });
  if (!result.enabled || !result.value) return null;
  return rowToMembership(result.value);
}

export async function upsertMembership(
  userId: UserId,
  tenantId: TenantId,
  roles: Role[],
  workspaceId?: string,
): Promise<Membership | null> {
  const result = await withDb(async (client) => {
    const { rows } = await client.query<MembershipRow>(
      `INSERT INTO platform_memberships (user_id, tenant_id, workspace_id, roles)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, tenant_id) DO UPDATE
         SET roles = EXCLUDED.roles,
             workspace_id = COALESCE(EXCLUDED.workspace_id, platform_memberships.workspace_id)
       RETURNING id, user_id, tenant_id, workspace_id, roles, joined_at, expires_at`,
      [userId, tenantId, workspaceId ?? PLATFORM.DEFAULT_WORKSPACE_ID, roles],
    );
    return rows[0] ?? null;
  });
  if (!result.enabled || !result.value) return null;
  return rowToMembership(result.value);
}

/**
 * Derive a PlatformContext from a canonical session.
 * In single-tenant mode (current) this resolves the default tenant and fetches
 * the user's membership record if a userId is available.
 * Returns a guest context when DB is unavailable or the user has no membership.
 */
export async function resolvePlatformContext(session: CanonicalSession): Promise<PlatformContext> {
  const tenantId = PLATFORM.DEFAULT_TENANT_ID;
  const workspaceId = PLATFORM.DEFAULT_WORKSPACE_ID;

  const userId = session.academyAccountId ?? session.studentId ?? session.userId ?? null;
  if (!userId) {
    return { tenantId, workspaceId, roles: ["guest"], membership: null };
  }

  const membership = await getMembership(userId, tenantId);
  const roles: Role[] = membership?.roles?.length
    ? membership.roles
    : session.isAdmin
      ? ["admin"]
      : ["student"];

  return { tenantId, workspaceId, roles, membership };
}
