import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0122_arena_league_enrollment_lifecycle_lock.sql";

export const ARENA_LEAGUE_ENROLLMENT_LIFECYCLE_LOCK_SQL = `
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- A KEY SHARE lock does not conflict with an ordinary UPDATE of season.status.
-- Hold a SHARE lock until commit so an enrollment INSERT and lifecycle UPDATE
-- cannot each commit based on the other's prior state.
CREATE OR REPLACE FUNCTION tecpey_lock_arena_league_season_for_enrollment()
RETURNS TRIGGER AS $$
DECLARE
  season_status TEXT;
BEGIN
  SELECT status INTO season_status
    FROM academy_arena_league_seasons
   WHERE id = NEW.season_id
     AND tenant_id = NEW.tenant_id
     AND workspace_id = NEW.workspace_id
   FOR SHARE;

  IF NOT FOUND OR season_status <> 'enrollment' THEN
    RAISE EXCEPTION 'arena league season is not accepting enrollment'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION tecpey_lock_arena_league_season_for_enrollment() FROM PUBLIC;

DROP TRIGGER IF EXISTS academy_arena_league_enrollment_lifecycle_lock
  ON academy_arena_league_enrollments;
CREATE TRIGGER academy_arena_league_enrollment_lifecycle_lock
BEFORE INSERT ON academy_arena_league_enrollments
FOR EACH ROW EXECUTE FUNCTION tecpey_lock_arena_league_season_for_enrollment();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runArenaLeagueEnrollmentLifecycleMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ARENA_LEAGUE_ENROLLMENT_LIFECYCLE_LOCK_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1", [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-arena-league-enrollment-lifecycle] checksum mismatch for ${FILENAME}`);
    }
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(ARENA_LEAGUE_ENROLLMENT_LIFECYCLE_LOCK_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
