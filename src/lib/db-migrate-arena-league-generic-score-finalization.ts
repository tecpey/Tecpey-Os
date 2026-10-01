import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0124_arena_league_generic_score_finalization.sql";

export const ARENA_LEAGUE_GENERIC_SCORE_FINALIZATION_SQL = `
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Lock all generic windows that a trade can affect. Keep the order fixed for
-- concurrent score inserts; the materializer holds the matching window lock.
CREATE OR REPLACE FUNCTION tecpey_guard_arena_league_generic_score_insert()
RETURNS TRIGGER AS $$
DECLARE
  lock_namespace TEXT;
  score_month TEXT;
  score_year TEXT;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'arena league generic score requires read committed'
      USING ERRCODE = '55000';
  END IF;

  lock_namespace := 'arena-ranking:' || NEW.tenant_id || ':' || NEW.workspace_id;
  score_month := to_char(NEW.scored_at AT TIME ZONE 'UTC', 'YYYY-MM');
  score_year := to_char(NEW.scored_at AT TIME ZONE 'UTC', 'YYYY');
  PERFORM pg_advisory_xact_lock(hashtext(lock_namespace), hashtext('monthly:' || score_month));
  PERFORM pg_advisory_xact_lock(hashtext(lock_namespace), hashtext('yearly:' || score_year));
  PERFORM pg_advisory_xact_lock(hashtext(lock_namespace), hashtext('lifetime:all-time'));

  PERFORM 1 FROM academy_arena_league_snapshots snapshot
   WHERE snapshot.tenant_id = NEW.tenant_id
     AND snapshot.workspace_id = NEW.workspace_id
     AND snapshot.season_id IS NULL
     AND snapshot.status = 'finalized'
     AND NEW.scored_at < snapshot.source_cutoff_at
     AND (
       (snapshot.window_type = 'monthly' AND snapshot.window_key = score_month) OR
       (snapshot.window_type = 'yearly' AND snapshot.window_key = score_year) OR
       (snapshot.window_type = 'lifetime' AND snapshot.window_key = 'all-time')
     )
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'arena league generic score snapshot finalized'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION tecpey_guard_arena_league_generic_score_insert() FROM PUBLIC;

DROP TRIGGER IF EXISTS academy_arena_league_generic_score_insert_guard
  ON academy_arena_trade_score_ledger;
CREATE TRIGGER academy_arena_league_generic_score_insert_guard
BEFORE INSERT ON academy_arena_trade_score_ledger
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_arena_league_generic_score_insert();

-- Raw SQL finalization must acquire the same lock as the application path.
CREATE OR REPLACE FUNCTION tecpey_lock_arena_league_generic_snapshot_finalization()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.season_id IS NOT NULL OR NEW.status <> 'finalized' OR OLD.status = 'finalized' THEN
    RETURN NEW;
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'arena league generic snapshot requires read committed'
      USING ERRCODE = '55000';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtext('arena-ranking:' || NEW.tenant_id || ':' || NEW.workspace_id),
    hashtext(NEW.window_type || ':' || NEW.window_key)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION tecpey_lock_arena_league_generic_snapshot_finalization() FROM PUBLIC;

DROP TRIGGER IF EXISTS academy_arena_league_generic_snapshot_finalization_lock
  ON academy_arena_league_snapshots;
CREATE TRIGGER academy_arena_league_generic_snapshot_finalization_lock
BEFORE UPDATE OF status ON academy_arena_league_snapshots
FOR EACH ROW EXECUTE FUNCTION tecpey_lock_arena_league_generic_snapshot_finalization();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runArenaLeagueGenericScoreFinalizationMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ARENA_LEAGUE_GENERIC_SCORE_FINALIZATION_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1", [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-arena-league-generic-score-finalization] checksum mismatch for ${FILENAME}`);
    }
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(ARENA_LEAGUE_GENERIC_SCORE_FINALIZATION_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
