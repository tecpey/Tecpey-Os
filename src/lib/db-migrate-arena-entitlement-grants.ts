import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0082_arena_entitlement_grants.sql";

export const ARENA_ENTITLEMENT_GRANTS_SQL = `
CREATE TABLE IF NOT EXISTS academy_arena_entitlement_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  principal_type TEXT NOT NULL DEFAULT 'student',
  principal_id TEXT NOT NULL,
  student_id UUID NOT NULL,
  entitlement_type TEXT NOT NULL CHECK (entitlement_type = 'arena_pro'),
  source_type TEXT NOT NULL CHECK (source_type = 'arena_league_snapshot'),
  source_snapshot_id UUID NOT NULL REFERENCES academy_arena_league_snapshots(id) ON DELETE RESTRICT,
  source_window_type TEXT NOT NULL CHECK (source_window_type IN ('monthly', 'yearly')),
  source_window_key TEXT NOT NULL,
  source_rank INTEGER NOT NULL CHECK (source_rank >= 1),
  grant_days INTEGER NOT NULL CHECK (grant_days BETWEEN 1 AND 365),
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  policy_version TEXT NOT NULL CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$'),
  evidence_sha256 CHAR(64) NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  cash_pool_share_bps INTEGER NOT NULL CHECK (cash_pool_share_bps BETWEEN 0 AND 10000),
  cash_disposition TEXT NOT NULL CHECK (
    cash_disposition IN ('not_eligible', 'c_level_compliance_approval_required')
  ),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key TEXT NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$'),
  CONSTRAINT academy_arena_entitlement_time_check CHECK (expires_at > starts_at),
  CONSTRAINT academy_arena_entitlement_principal_check
    CHECK (principal_type = 'student' AND principal_id = student_id::text),
  CONSTRAINT academy_arena_entitlement_binding_fk
    FOREIGN KEY (tenant_id, workspace_id, principal_type, principal_id)
    REFERENCES platform_principal_bindings(tenant_id, workspace_id, principal_type, principal_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT academy_arena_entitlement_workspace_fk
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT academy_arena_entitlement_unique_source
    UNIQUE (tenant_id, workspace_id, student_id, entitlement_type, source_snapshot_id),
  CONSTRAINT academy_arena_entitlement_idempotency
    UNIQUE (tenant_id, workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS academy_arena_entitlement_active_idx
  ON academy_arena_entitlement_grants
    (tenant_id, workspace_id, student_id, entitlement_type, expires_at DESC);

CREATE OR REPLACE FUNCTION tecpey_reject_arena_entitlement_grant_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'arena entitlement grants are append-only' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_arena_entitlement_grants_no_update
  ON academy_arena_entitlement_grants;
CREATE TRIGGER academy_arena_entitlement_grants_no_update
BEFORE UPDATE OR DELETE ON academy_arena_entitlement_grants
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_arena_entitlement_grant_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runArenaEntitlementGrantMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ARENA_ENTITLEMENT_GRANTS_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) throw new Error(`[db-migrate-arena-entitlement-grants] checksum mismatch for ${FILENAME}`);
    return;
  }
  logger.info("[db-migrate-arena-entitlement-grants] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(ARENA_ENTITLEMENT_GRANTS_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
