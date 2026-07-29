/**
 * Core type definitions for the multi-tenant platform model.
 * These are pure types — no runtime logic lives here.
 */

// ── Identity ──────────────────────────────────────────────────────────────────

export type TenantId = string;
export type WorkspaceId = string;
export type UserId = string;

// ── Roles ─────────────────────────────────────────────────────────────────────

/** All roles supported by the platform permission system. */
export type Role =
  | "admin"
  | "moderator"
  | "teacher"
  | "student"
  | "trader"
  | "support"
  | "guest";

// ── Products ──────────────────────────────────────────────────────────────────

export type ProductId =
  | "exchange"
  | "academy"
  | "social"
  | "mentor"
  | "knowledge"
  | "marketplace";

// ── Tenant model ──────────────────────────────────────────────────────────────

export type TenantPlan = "free" | "pro" | "enterprise";

/**
 * A tenant is a top-level organizational unit.
 * In single-tenant mode TecPey runs as a single default tenant.
 * Multi-tenant: each organization / school is its own tenant.
 */
export type Tenant = {
  id: TenantId;
  slug: string;
  displayName: string;
  plan: TenantPlan;
  ownerId: UserId | null;
  /** Products enabled for this tenant. */
  products: ProductId[];
  createdAt: string;
};

/**
 * A workspace is a sub-unit inside a tenant.
 * Example: tenant "FinanceCorp" might have workspaces "Trading Team" and "Education Desk".
 */
export type Workspace = {
  id: WorkspaceId;
  tenantId: TenantId;
  slug: string;
  displayName: string;
  products: ProductId[];
  settings: Record<string, unknown>;
};

/**
 * A membership record links a user to a tenant (and optionally a workspace)
 * and defines which roles they hold in that context.
 */
export type Membership = {
  id: string;
  userId: UserId;
  tenantId: TenantId;
  workspaceId: WorkspaceId | null;
  roles: Role[];
  joinedAt: string;
  expiresAt: string | null;
};

/**
 * Platform context enriches a canonical session with tenant, workspace, and role
 * information. Derived at request time; not stored in any cookie or DB row.
 */
export type PlatformContext = {
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  roles: Role[];
  membership: Membership | null;
};
