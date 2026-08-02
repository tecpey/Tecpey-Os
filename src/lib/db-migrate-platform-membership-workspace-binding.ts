import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0053_platform_membership_workspace_binding.sql";

// Additive hardening for the platform_memberships tenant boundary (#109).
//
// Before this migration platform_memberships.workspace_id carried only a
// single-column FK (workspace_id -> platform_workspaces.id). Because that FK
// ignored tenant_id, a membership row could bind tenant A to a workspace that
// actually belongs to tenant B — the row's own tenant_id said one thing while
// its workspace pointed into another tenant. This migration closes that gap:
//
//   1. platform_workspaces gains UNIQUE (tenant_id, id). id is already the
//      primary key, so this constraint is always satisfiable and additive; it
//      exists solely to be the target of the composite FK below.
//   2. platform_memberships replaces the single-column workspace FK with a
//      composite FK (tenant_id, workspace_id) -> platform_workspaces (tenant_id,
//      id). The database now refuses any membership whose workspace does not
//      live in the same tenant. ON DELETE SET NULL (workspace_id) preserves the
//      prior delete behaviour: dropping a workspace nulls only the membership's
//      workspace_id and leaves its tenant binding intact (PostgreSQL 15+).
//
// MATCH SIMPLE (the default) means a membership with a NULL workspace_id is
// still permitted — a member without a workspace — exactly as before.
export const PLATFORM_MEMBERSHIP_WORKSPACE_BINDING_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'platform_workspaces'::regclass
      AND conname = 'platform_workspaces_tenant_id_id_key'
  ) THEN
    ALTER TABLE platform_workspaces
      ADD CONSTRAINT platform_workspaces_tenant_id_id_key UNIQUE (tenant_id, id);
  END IF;
END $$;

ALTER TABLE platform_memberships
  DROP CONSTRAINT IF EXISTS platform_memberships_workspace_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'platform_memberships'::regclass
      AND conname = 'platform_memberships_tenant_workspace_fkey'
  ) THEN
    ALTER TABLE platform_memberships
      ADD CONSTRAINT platform_memberships_tenant_workspace_fkey
      FOREIGN KEY (tenant_id, workspace_id)
      REFERENCES platform_workspaces (tenant_id, id)
      ON DELETE SET NULL (workspace_id);
  END IF;
END $$;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runPlatformMembershipWorkspaceBindingMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(PLATFORM_MEMBERSHIP_WORKSPACE_BINDING_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-platform-membership-workspace-binding] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-platform-membership-workspace-binding] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(PLATFORM_MEMBERSHIP_WORKSPACE_BINDING_SQL);
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
