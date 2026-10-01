import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0125_arena_league_generic_ranking_versions.sql";

export const ARENA_LEAGUE_GENERIC_RANKING_VERSIONS_SQL = `
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Keep every finalized version while allowing a later cutoff to advance the
-- generic leaderboard. The season-specific one-finalized index is unchanged.
DROP INDEX IF EXISTS academy_arena_snapshot_generic_one_finalized_idx;

CREATE OR REPLACE FUNCTION tecpey_lock_arena_league_generic_snapshot_finalization()
RETURNS TRIGGER AS $$
DECLARE
  previous_version INTEGER;
  previous_cutoff TIMESTAMPTZ;
BEGIN
  IF NEW.season_id IS NOT NULL OR NEW.status <> 'finalized' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'finalized' THEN RETURN NEW; END IF;
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'arena league generic snapshot requires read committed'
      USING ERRCODE = '55000';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtext('arena-ranking:' || NEW.tenant_id || ':' || NEW.workspace_id),
    hashtext(NEW.window_type || ':' || NEW.window_key)
  );

  SELECT version, source_cutoff_at INTO previous_version, previous_cutoff
    FROM academy_arena_league_snapshots
   WHERE tenant_id = NEW.tenant_id AND workspace_id = NEW.workspace_id
     AND window_type = NEW.window_type AND window_key = NEW.window_key
     AND season_id IS NULL AND status = 'finalized' AND id <> NEW.id
   ORDER BY version DESC LIMIT 1;
  IF FOUND AND (NEW.version <= previous_version OR NEW.source_cutoff_at <= previous_cutoff) THEN
    RAISE EXCEPTION 'arena league generic snapshot cutoff must advance'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION tecpey_lock_arena_league_generic_snapshot_finalization() FROM PUBLIC;

DROP TRIGGER IF EXISTS academy_arena_league_generic_snapshot_finalization_lock
  ON academy_arena_league_snapshots;
CREATE TRIGGER academy_arena_league_generic_snapshot_finalization_lock
BEFORE INSERT OR UPDATE OF status ON academy_arena_league_snapshots
FOR EACH ROW EXECUTE FUNCTION tecpey_lock_arena_league_generic_snapshot_finalization();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runArenaLeagueGenericRankingVersionsMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ARENA_LEAGUE_GENERIC_RANKING_VERSIONS_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1", [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-arena-league-generic-ranking-versions] checksum mismatch for ${FILENAME}`);
    }
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(ARENA_LEAGUE_GENERIC_RANKING_VERSIONS_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
