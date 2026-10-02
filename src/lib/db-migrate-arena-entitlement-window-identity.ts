import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0126_arena_entitlement_window_identity.sql";

export const ARENA_ENTITLEMENT_WINDOW_IDENTITY_SQL = `
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- A later leaderboard version has a different snapshot UUID, but it is still
-- the same reward period. Fail the migration on existing duplicate grants;
-- append-only grants must never be silently deleted or rewritten.
CREATE UNIQUE INDEX academy_arena_entitlement_one_grant_per_window_idx
  ON academy_arena_entitlement_grants
    (tenant_id, workspace_id, student_id, entitlement_type,
     source_window_type, source_window_key);
`;

export async function runArenaEntitlementWindowIdentityMigrations(client: PoolClient): Promise<void> {
  const checksum = createHash("sha256")
    .update(ARENA_ENTITLEMENT_WINDOW_IDENTITY_SQL.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1", [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== checksum) {
      throw new Error(`[db-migrate-arena-entitlement-window-identity] checksum mismatch for ${FILENAME}`);
    }
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(ARENA_ENTITLEMENT_WINDOW_IDENTITY_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, checksum]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
