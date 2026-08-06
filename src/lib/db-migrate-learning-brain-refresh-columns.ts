import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0055_learning_brain_refresh_columns.sql";

// Repair the learning-brain refresh path, whose two backing tables were never
// fully migrated to the shape the application has always written.
//
// refreshLearningBrain (src/lib/learning-os.ts) runs inside recordLearningEvent
// on EVERY learning-event write. It reads AVG(response_time_ms) from
// mentor_challenge_attempts and UPSERTs a rich profile into
// learning_brain_profiles. The mentor-challenge answer endpoint
// (src/app/api/mentor-challenge/route.ts) likewise INSERTs term_number,
// lesson_slug, locale, attempt_number, first_answer, response_time_ms, and
// confidence. Yet the canonical migrations only ever created:
//   * mentor_challenge_attempts: question_id, selected_option, is_correct
//   * learning_brain_profiles:  decision_score, confidence_score, weak_topics
// Every other column these code paths write was missing. On any
// freshly-provisioned database that means the mentor-challenge INSERT and — via
// refreshLearningBrain — every learning-event write fail with
// `column "…" does not exist`.
//
// This migration adds the missing columns. All are nullable ADD COLUMN IF NOT
// EXISTS: idempotent (a database that already carries them via any prior path
// is untouched) and non-destructive to existing rows (no backfill — new writes
// always supply values, and the aggregate reads tolerate NULL). strong_topics
// is text[] to match the existing weak_topics column; the INSERT in
// refreshLearningBrain writes both as text[] arrays.
export const LEARNING_BRAIN_REFRESH_COLUMNS_SQL = `
ALTER TABLE mentor_challenge_attempts ADD COLUMN IF NOT EXISTS term_number INTEGER;
ALTER TABLE mentor_challenge_attempts ADD COLUMN IF NOT EXISTS lesson_slug TEXT;
ALTER TABLE mentor_challenge_attempts ADD COLUMN IF NOT EXISTS locale TEXT;
ALTER TABLE mentor_challenge_attempts ADD COLUMN IF NOT EXISTS attempt_number INTEGER;
ALTER TABLE mentor_challenge_attempts ADD COLUMN IF NOT EXISTS first_answer TEXT;
ALTER TABLE mentor_challenge_attempts ADD COLUMN IF NOT EXISTS response_time_ms INTEGER;
ALTER TABLE mentor_challenge_attempts ADD COLUMN IF NOT EXISTS confidence TEXT;

ALTER TABLE learning_brain_profiles ADD COLUMN IF NOT EXISTS learning_velocity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learning_brain_profiles ADD COLUMN IF NOT EXISTS attention_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learning_brain_profiles ADD COLUMN IF NOT EXISTS risk_appetite INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learning_brain_profiles ADD COLUMN IF NOT EXISTS emotional_stability INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learning_brain_profiles ADD COLUMN IF NOT EXISTS discipline_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learning_brain_profiles ADD COLUMN IF NOT EXISTS strong_topics TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE learning_brain_profiles ADD COLUMN IF NOT EXISTS next_best_action TEXT;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runLearningBrainRefreshColumnsMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(LEARNING_BRAIN_REFRESH_COLUMNS_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-learning-brain-refresh-columns] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-learning-brain-refresh-columns] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(LEARNING_BRAIN_REFRESH_COLUMNS_SQL);
    await client.query(
      "INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)",
      [FILENAME, cs],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
