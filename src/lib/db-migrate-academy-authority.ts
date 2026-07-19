import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { logger } from "@/lib/logger";

const FILENAME = "0021_academy_reward_authority.sql";

export const ACADEMY_REWARD_AUTHORITY_SQL = `
CREATE TABLE IF NOT EXISTS academy_progress_legacy_snapshots (
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  legacy_revision BIGINT NOT NULL CHECK (legacy_revision >= 0),
  legacy_progress JSONB NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, locale),
  CHECK (jsonb_typeof(legacy_progress) = 'object')
);

CREATE TABLE IF NOT EXISTS academy_lesson_assessments (
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  lesson_id TEXT NOT NULL,
  term_number SMALLINT NOT NULL CHECK (term_number BETWEEN 1 AND 7),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  latest_score SMALLINT NOT NULL CHECK (latest_score BETWEEN 0 AND 100),
  best_score SMALLINT NOT NULL CHECK (best_score BETWEEN 0 AND 100),
  passed_at TIMESTAMPTZ,
  latest_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  latest_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, locale, lesson_id),
  CHECK (char_length(lesson_id) BETWEEN 3 AND 160),
  CHECK (jsonb_typeof(latest_answers) = 'object'),
  CHECK (jsonb_typeof(latest_results) = 'array')
);

CREATE INDEX IF NOT EXISTS academy_lesson_assessments_student_idx
  ON academy_lesson_assessments(student_id, locale, term_number, updated_at DESC);

CREATE TABLE IF NOT EXISTS academy_reward_events (
  id BIGSERIAL PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  reward_code TEXT NOT NULL CHECK (reward_code IN ('lesson_complete', 'lesson_perfect_bonus')),
  source_type TEXT NOT NULL CHECK (source_type = 'lesson_assessment'),
  source_ref TEXT NOT NULL,
  xp INTEGER NOT NULL CHECK (xp > 0 AND xp <= 5000),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, locale, reward_code, source_type, source_ref),
  CHECK (char_length(source_ref) BETWEEN 1 AND 180),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS academy_reward_events_student_idx
  ON academy_reward_events(student_id, locale, created_at DESC);

CREATE TABLE IF NOT EXISTS student_achievements (
  student_id UUID NOT NULL,
  code TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(student_id, code)
);
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);
}

export async function runAcademyAuthorityMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ACADEMY_REWARD_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    `SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1`,
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-academy-authority] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-academy-authority] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_REWARD_AUTHORITY_SQL);
    await client.query(`INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)`, [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
