import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0069_admin_tenant_binding.sql";

// The admin control plane had no tenant identity at all: admin_control-plane.ts
// contained zero references to a tenant, authorizeAdminRequest checked only a
// permission, and every /api/admin/* and /api/command-center/* query therefore
// read across the whole platform (audit finding F-1).
//
// This migration gives the operator itself a tenant, which is the part that has
// to exist before anything downstream can be scoped: without it there is no
// answer to "which tenant is this admin acting for". Existing operators belong
// to the default tenant, which is what the column defaults encode.
//
// It is deliberately only the first slice. Scoping the Command Center's
// aggregates fully needs tenant columns on academy_students,
// notification_center, academy_certificates and mentor_challenge_attempts too —
// and academy_students is the academy root with 43 tables pointing at it, so
// that is its own program. Until then the summary route labels each metric with
// the scope it actually has, rather than implying a tenant boundary it does not
// yet enforce.

export const ADMIN_TENANT_BINDING_SQL = `
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tecpey';

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'main';

ALTER TABLE admin_users
  DROP CONSTRAINT IF EXISTS admin_users_tenant_id_check;
ALTER TABLE admin_users
  ADD CONSTRAINT admin_users_tenant_id_check
  CHECK (tenant_id ~ '^[a-z][a-z0-9-]{2,63}$');

ALTER TABLE admin_users
  DROP CONSTRAINT IF EXISTS admin_users_workspace_id_check;
ALTER TABLE admin_users
  ADD CONSTRAINT admin_users_workspace_id_check
  CHECK (workspace_id ~ '^[a-z][a-z0-9-]{2,63}$');

ALTER TABLE admin_users
  DROP CONSTRAINT IF EXISTS admin_users_tenant_fk;
ALTER TABLE admin_users
  ADD CONSTRAINT admin_users_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE RESTRICT;

-- The regexes above only prove the identifiers are well formed. Without a
-- composite key an operator could be provisioned with tenant A and a workspace
-- that does not exist, or one owned by tenant B, and loadAdminPrincipal would
-- hand that incoherent pair out as an authenticated scope. platform_memberships,
-- platform_principal_bindings and platform_tenant_domains all bind the pair;
-- admin_users binds it the same way.
ALTER TABLE admin_users
  DROP CONSTRAINT IF EXISTS admin_users_tenant_workspace_fk;
ALTER TABLE admin_users
  ADD CONSTRAINT admin_users_tenant_workspace_fk
  FOREIGN KEY (tenant_id, workspace_id)
  REFERENCES platform_workspaces (tenant_id, id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS admin_users_tenant_idx
  ON admin_users (tenant_id, workspace_id, status);
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runAdminTenantBindingMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ADMIN_TENANT_BINDING_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-admin-tenant-binding] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-admin-tenant-binding] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(ADMIN_TENANT_BINDING_SQL);
    await client.query(
      "INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)",
      [FILENAME, cs],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
