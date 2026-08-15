import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0078_arena_league_score_ledger.sql";

export const ARENA_LEAGUE_SCORE_LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS academy_arena_trade_score_ledger (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  principal_type TEXT NOT NULL DEFAULT 'student',
  principal_id TEXT NOT NULL,
  student_id UUID NOT NULL,
  attempt_id UUID NOT NULL,
  closed_trade_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  instrument_kind TEXT NOT NULL,
  scored_at TIMESTAMPTZ NOT NULL,
  score_day DATE GENERATED ALWAYS AS ((scored_at AT TIME ZONE 'UTC')::date) STORED,
  score_month DATE GENERATED ALWAYS AS (date_trunc('month', scored_at AT TIME ZONE 'UTC')::date) STORED,
  score_year SMALLINT GENERATED ALWAYS AS (extract(year from scored_at AT TIME ZONE 'UTC')::smallint) STORED,
  trade_number_for_day INTEGER NOT NULL,
  total_points SMALLINT NOT NULL,
  participation_points SMALLINT NOT NULL,
  process_points SMALLINT NOT NULL,
  outcome_points SMALLINT NOT NULL,
  penalty_points SMALLINT NOT NULL,
  positive_multiplier_bps INTEGER NOT NULL,
  penalty_multiplier_bps INTEGER NOT NULL,
  scoring_input JSONB NOT NULL,
  scoring_reasons JSONB NOT NULL,
  source_digest CHAR(64) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT academy_arena_score_principal_check
    CHECK (principal_type = 'student' AND principal_id = student_id::text),
  CONSTRAINT academy_arena_score_policy_check
    CHECK (policy_version = 'arena-league-scoring-v1'),
  CONSTRAINT academy_arena_score_instrument_check
    CHECK (instrument_kind IN ('spot', 'perpetual', 'options')),
  CONSTRAINT academy_arena_score_points_check
    CHECK (total_points BETWEEN -100 AND 100 AND trade_number_for_day BETWEEN 1 AND 10000),
  CONSTRAINT academy_arena_score_json_check
    CHECK (jsonb_typeof(scoring_input) = 'object' AND jsonb_typeof(scoring_reasons) = 'array'),
  CONSTRAINT academy_arena_score_digest_check CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT academy_arena_score_attempt_owner_fk
    FOREIGN KEY (attempt_id, student_id)
    REFERENCES academy_trading_arena_attempts(id, student_id)
    ON DELETE RESTRICT,
  CONSTRAINT academy_arena_score_binding_fk
    FOREIGN KEY (tenant_id, workspace_id, principal_type, principal_id)
    REFERENCES platform_principal_bindings(tenant_id, workspace_id, principal_type, principal_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT academy_arena_score_source_unique
    UNIQUE (tenant_id, workspace_id, attempt_id, closed_trade_id, policy_version)
);

CREATE INDEX IF NOT EXISTS academy_arena_score_monthly_rank_idx
  ON academy_arena_trade_score_ledger
    (tenant_id, workspace_id, score_month, student_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS academy_arena_score_yearly_rank_idx
  ON academy_arena_trade_score_ledger
    (tenant_id, workspace_id, score_year, student_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS academy_arena_score_student_timeline_idx
  ON academy_arena_trade_score_ledger
    (tenant_id, workspace_id, student_id, scored_at DESC, id DESC);

CREATE OR REPLACE FUNCTION tecpey_reject_arena_trade_score_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'arena trade score ledger is append-only' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_arena_trade_score_no_update
  ON academy_arena_trade_score_ledger;
CREATE TRIGGER academy_arena_trade_score_no_update
BEFORE UPDATE OR DELETE ON academy_arena_trade_score_ledger
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_arena_trade_score_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runArenaLeagueScoreLedgerMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ARENA_LEAGUE_SCORE_LEDGER_SQL);
  const applied = await client.query<{ checksum: string }>(
    `SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1`,
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) throw new Error(`[db-migrate-arena-league-score-ledger] checksum mismatch for ${FILENAME}`);
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(ARENA_LEAGUE_SCORE_LEDGER_SQL);
    await client.query(`INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)`, [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
