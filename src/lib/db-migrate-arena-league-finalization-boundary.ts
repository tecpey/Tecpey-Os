import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0121_arena_league_finalization_boundary.sql";

export const ARENA_LEAGUE_FINALIZATION_BOUNDARY_SQL = `
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- The application takes this same season lock before reading ranking candidates.
-- A direct SQL enrollment transition must participate in that ordering too.
CREATE OR REPLACE FUNCTION tecpey_guard_arena_league_enrollment_snapshot_boundary()
RETURNS TRIGGER AS $$
DECLARE
  season_status TEXT;
BEGIN
  IF OLD.status <> 'enrolled' OR NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- A transaction-wide older snapshot could miss a finalization that committed
  -- while the advisory lock was being acquired.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'arena league enrollment transition requires read committed'
      USING ERRCODE = '55000';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('arena-season:' || OLD.tenant_id || ':' || OLD.workspace_id),
    hashtext(OLD.season_id::text)
  );

  SELECT status INTO season_status
    FROM academy_arena_league_seasons
   WHERE id = OLD.season_id
     AND tenant_id = OLD.tenant_id
     AND workspace_id = OLD.workspace_id
   FOR SHARE;
  IF NOT FOUND OR season_status = 'finalized' THEN
    RAISE EXCEPTION 'arena league enrollment season is finalized'
      USING ERRCODE = '55000';
  END IF;

  PERFORM 1 FROM academy_arena_league_snapshots
   WHERE season_id = OLD.season_id
     AND tenant_id = OLD.tenant_id
     AND workspace_id = OLD.workspace_id
     AND status = 'finalized'
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'arena league enrollment snapshot is finalized'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION tecpey_guard_arena_league_enrollment_snapshot_boundary()
  FROM PUBLIC;

DROP TRIGGER IF EXISTS academy_arena_league_enrollment_snapshot_boundary
  ON academy_arena_league_enrollments;
CREATE TRIGGER academy_arena_league_enrollment_snapshot_boundary
BEFORE UPDATE OF status ON academy_arena_league_enrollments
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_arena_league_enrollment_snapshot_boundary();

-- The same lock is mandatory when a caller finalizes a snapshot with raw SQL.
-- This replaces the function installed by 0120 without changing its checksum.
CREATE OR REPLACE FUNCTION tecpey_guard_arena_season_snapshot_finalization()
RETURNS TRIGGER AS $$
DECLARE
  season_status TEXT;
  season_end TIMESTAMPTZ;
BEGIN
  IF NEW.season_id IS NULL OR NEW.status <> 'finalized' OR OLD.status = 'finalized' THEN
    RETURN NEW;
  END IF;

  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'arena league snapshot finalization requires read committed'
      USING ERRCODE = '55000';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtext('arena-season:' || NEW.tenant_id || ':' || NEW.workspace_id),
    hashtext(NEW.season_id::text)
  );

  SELECT status, ends_at INTO season_status, season_end
    FROM academy_arena_league_seasons
   WHERE id = NEW.season_id
     AND tenant_id = NEW.tenant_id
     AND workspace_id = NEW.workspace_id
   FOR KEY SHARE;

  IF NOT FOUND OR season_status NOT IN ('closing','finalized') THEN
    RAISE EXCEPTION 'arena league season snapshot cannot finalize before season closing'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.source_cutoff_at < season_end THEN
    RAISE EXCEPTION 'arena league season snapshot cutoff precedes season end'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runArenaLeagueFinalizationBoundaryMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ARENA_LEAGUE_FINALIZATION_BOUNDARY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1", [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-arena-league-finalization-boundary] checksum mismatch for ${FILENAME}`);
    }
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(ARENA_LEAGUE_FINALIZATION_BOUNDARY_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
