import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0079_arena_league_rankings.sql";

export const ARENA_LEAGUE_RANKINGS_SQL = `
CREATE TABLE IF NOT EXISTS academy_arena_league_snapshots (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  window_type TEXT NOT NULL CHECK (window_type IN ('monthly', 'yearly', 'lifetime')),
  window_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('provisional', 'finalized')),
  version INTEGER NOT NULL CHECK (version >= 1),
  source_cutoff_at TIMESTAMPTZ NOT NULL,
  participant_count INTEGER NOT NULL CHECK (participant_count >= 0),
  source_digest CHAR(64) NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  CONSTRAINT academy_arena_snapshot_window_key_check CHECK (
    (window_type = 'monthly' AND window_key ~ '^[0-9]{4}-[0-9]{2}$') OR
    (window_type = 'yearly' AND window_key ~ '^[0-9]{4}$') OR
    (window_type = 'lifetime' AND window_key = 'all-time')
  ),
  CONSTRAINT academy_arena_snapshot_finalized_check CHECK (
    (status = 'finalized') = (finalized_at IS NOT NULL)
  ),
  CONSTRAINT academy_arena_snapshot_workspace_fk
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, window_type, window_key, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS academy_arena_snapshot_one_provisional_idx
  ON academy_arena_league_snapshots(tenant_id, workspace_id, window_type, window_key)
  WHERE status = 'provisional';
CREATE UNIQUE INDEX IF NOT EXISTS academy_arena_snapshot_one_finalized_idx
  ON academy_arena_league_snapshots(tenant_id, workspace_id, window_type, window_key)
  WHERE status = 'finalized';

CREATE TABLE IF NOT EXISTS academy_arena_league_rankings (
  snapshot_id UUID NOT NULL REFERENCES academy_arena_league_snapshots(id) ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  principal_type TEXT NOT NULL DEFAULT 'student',
  principal_id TEXT NOT NULL,
  student_id UUID NOT NULL,
  rank INTEGER NOT NULL CHECK (rank >= 1),
  points INTEGER NOT NULL,
  trade_count INTEGER NOT NULL CHECK (trade_count >= 1),
  rule_compliance_bps INTEGER NOT NULL CHECK (rule_compliance_bps BETWEEN 0 AND 10000),
  tier TEXT NOT NULL CHECK (tier IN ('rookie','explorer','analyst','strategist','elite','master','legend')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (snapshot_id, student_id),
  UNIQUE (snapshot_id, rank),
  CONSTRAINT academy_arena_ranking_identity_check
    CHECK (principal_type = 'student' AND principal_id = student_id::text),
  CONSTRAINT academy_arena_ranking_binding_fk
    FOREIGN KEY (tenant_id, workspace_id, principal_type, principal_id)
    REFERENCES platform_principal_bindings(tenant_id, workspace_id, principal_type, principal_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS academy_arena_ranking_student_idx
  ON academy_arena_league_rankings(tenant_id, workspace_id, student_id, created_at DESC);

CREATE OR REPLACE FUNCTION tecpey_require_open_arena_snapshot_for_ranking()
RETURNS TRIGGER AS $$
DECLARE
  snapshot_status TEXT;
  snapshot_tenant TEXT;
  snapshot_workspace TEXT;
BEGIN
  SELECT status, tenant_id, workspace_id
    INTO snapshot_status, snapshot_tenant, snapshot_workspace
    FROM academy_arena_league_snapshots
   WHERE id = NEW.snapshot_id
   FOR KEY SHARE;
  IF NOT FOUND OR snapshot_status <> 'provisional' THEN
    RAISE EXCEPTION 'arena ranking requires a provisional snapshot' USING ERRCODE = '55000';
  END IF;
  IF NEW.tenant_id <> snapshot_tenant OR NEW.workspace_id <> snapshot_workspace THEN
    RAISE EXCEPTION 'arena ranking scope differs from snapshot scope' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_arena_ranking_open_snapshot_guard ON academy_arena_league_rankings;
CREATE TRIGGER academy_arena_ranking_open_snapshot_guard
BEFORE INSERT ON academy_arena_league_rankings
FOR EACH ROW EXECUTE FUNCTION tecpey_require_open_arena_snapshot_for_ranking();

CREATE OR REPLACE FUNCTION tecpey_reject_finalized_arena_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'finalized' THEN
    RAISE EXCEPTION 'finalized arena league snapshot is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_arena_snapshot_finalized_immutable ON academy_arena_league_snapshots;
CREATE TRIGGER academy_arena_snapshot_finalized_immutable
BEFORE UPDATE OR DELETE ON academy_arena_league_snapshots
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_finalized_arena_snapshot_mutation();

CREATE OR REPLACE FUNCTION tecpey_reject_arena_ranking_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'arena league ranking rows are immutable' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_arena_ranking_immutable ON academy_arena_league_rankings;
CREATE TRIGGER academy_arena_ranking_immutable
BEFORE UPDATE OR DELETE ON academy_arena_league_rankings
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_arena_ranking_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runArenaLeagueRankingMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ARENA_LEAGUE_RANKINGS_SQL);
  const applied = await client.query<{ checksum: string }>(
    `SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1`, [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) throw new Error(`[db-migrate-arena-league-rankings] checksum mismatch for ${FILENAME}`);
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(ARENA_LEAGUE_RANKINGS_SQL);
    await client.query(`INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)`, [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
