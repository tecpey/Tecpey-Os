import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0080_arena_league_ranking_refresh.sql";

export const ARENA_LEAGUE_RANKING_REFRESH_SQL = `
DROP INDEX IF EXISTS academy_arena_snapshot_one_finalized_idx;

CREATE INDEX IF NOT EXISTS academy_arena_snapshot_latest_finalized_idx
  ON academy_arena_league_snapshots
    (tenant_id, workspace_id, window_type, window_key, version DESC, finalized_at DESC)
  WHERE status = 'finalized';

CREATE INDEX IF NOT EXISTS academy_arena_ranking_snapshot_rank_idx
  ON academy_arena_league_rankings (snapshot_id, rank, student_id);
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runArenaLeagueRankingRefreshMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ARENA_LEAGUE_RANKING_REFRESH_SQL);
  const applied = await client.query<{ checksum: string }>(
    `SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1`, [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) throw new Error(`[db-migrate-arena-league-ranking-refresh] checksum mismatch for ${FILENAME}`);
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(ARENA_LEAGUE_RANKING_REFRESH_SQL);
    await client.query(`INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)`, [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
