import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0123_arena_league_score_finalization_boundary.sql";

export const ARENA_LEAGUE_SCORE_FINALIZATION_BOUNDARY_SQL = `
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Share the season transaction lock with ranking materialization and
-- enrollment transitions. A late close must fail rather than alter the
-- evidence behind an immutable finalized ranking.
CREATE OR REPLACE FUNCTION tecpey_guard_arena_league_season_score_insert()
RETURNS TRIGGER AS $$
DECLARE
  score_season_id UUID;
  season_row academy_arena_league_seasons%ROWTYPE;
BEGIN
  IF NULLIF(NEW.scoring_input->>'seasonId', '') IS NULL THEN
    RETURN NEW;
  END IF;
  score_season_id := (NEW.scoring_input->>'seasonId')::uuid;

  -- An older transaction snapshot can miss a finalization committed while
  -- waiting for the season advisory lock.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'arena league season score requires read committed'
      USING ERRCODE = '55000';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('arena-season:' || NEW.tenant_id || ':' || NEW.workspace_id),
    hashtext(score_season_id::text)
  );
  SELECT * INTO season_row
    FROM academy_arena_league_seasons
   WHERE id = score_season_id
     AND tenant_id = NEW.tenant_id
     AND workspace_id = NEW.workspace_id
   FOR SHARE;

  IF NOT FOUND OR season_row.status NOT IN ('active', 'closing')
    OR NEW.scored_at < season_row.starts_at
    OR NEW.scored_at >= season_row.ends_at
    OR NEW.policy_version <> season_row.scoring_policy_version THEN
    RAISE EXCEPTION 'arena league season score authority invalid'
      USING ERRCODE = '55000';
  END IF;

  PERFORM 1 FROM academy_arena_league_enrollments
   WHERE season_id = score_season_id
     AND tenant_id = NEW.tenant_id
     AND workspace_id = NEW.workspace_id
     AND student_id = NEW.student_id
     AND status = 'enrolled'
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'arena league season score enrollment invalid'
      USING ERRCODE = '55000';
  END IF;

  PERFORM 1 FROM academy_arena_league_snapshots
   WHERE season_id = score_season_id
     AND tenant_id = NEW.tenant_id
     AND workspace_id = NEW.workspace_id
     AND status = 'finalized'
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'arena league season score snapshot finalized'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION tecpey_guard_arena_league_season_score_insert() FROM PUBLIC;

DROP TRIGGER IF EXISTS academy_arena_league_season_score_insert_guard
  ON academy_arena_trade_score_ledger;
CREATE TRIGGER academy_arena_league_season_score_insert_guard
BEFORE INSERT ON academy_arena_trade_score_ledger
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_arena_league_season_score_insert();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runArenaLeagueScoreFinalizationMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ARENA_LEAGUE_SCORE_FINALIZATION_BOUNDARY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1", [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-arena-league-score-finalization] checksum mismatch for ${FILENAME}`);
    }
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(ARENA_LEAGUE_SCORE_FINALIZATION_BOUNDARY_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
