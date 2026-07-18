import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

type Migration = { filename: string; sql: string };

export const AUTHORITATIVE_ACADEMY_STATE_SQL = `
CREATE TABLE IF NOT EXISTS academy_state_documents (
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL DEFAULT 'fa' CHECK (locale IN ('fa', 'en')),
  schema_version INTEGER NOT NULL DEFAULT 1,
  revision BIGINT NOT NULL DEFAULT 1,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, locale)
);

CREATE INDEX IF NOT EXISTS academy_state_documents_updated_idx
  ON academy_state_documents(updated_at DESC);
`;

export const ACADEMY_LEARNING_MEMORY_SQL = `
ALTER TABLE academy_state_documents
  ADD COLUMN IF NOT EXISTS flashcards JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS flashcard_revision BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reflections JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS memory_updated_at TIMESTAMPTZ;
`;

export const ACADEMY_REFLECTION_MEMORY_SQL = `
ALTER TABLE academy_state_documents
  ADD COLUMN IF NOT EXISTS reflection_revision BIGINT NOT NULL DEFAULT 0;
`;

export const ACADEMY_LESSON_PROGRESS_SQL = `
CREATE TABLE IF NOT EXISTS academy_lesson_progress (
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  term_number SMALLINT NOT NULL CHECK (term_number BETWEEN 1 AND 7),
  term_slug TEXT NOT NULL,
  section_key TEXT NOT NULL,
  section_heading TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  answer TEXT,
  first_answer TEXT,
  answer_attempts JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, locale, term_slug, section_key),
  CHECK (term_slug = ('term-' || term_number::text)),
  CHECK (char_length(section_key) BETWEEN 1 AND 220),
  CHECK (char_length(section_heading) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS academy_lesson_progress_student_term_idx
  ON academy_lesson_progress(student_id, locale, term_number, updated_at DESC);

CREATE TABLE IF NOT EXISTS academy_term_learning_progress (
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  term_number SMALLINT NOT NULL CHECK (term_number BETWEEN 1 AND 7),
  term_slug TEXT NOT NULL,
  total_sections SMALLINT NOT NULL CHECK (total_sections BETWEEN 1 AND 100),
  completed_sections SMALLINT NOT NULL DEFAULT 0 CHECK (completed_sections BETWEEN 0 AND 100),
  answered_sections SMALLINT NOT NULL DEFAULT 0 CHECK (answered_sections BETWEEN 0 AND 100),
  percent SMALLINT NOT NULL DEFAULT 0 CHECK (percent BETWEEN 0 AND 100),
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, locale, term_slug),
  CHECK (term_slug = ('term-' || term_number::text)),
  CHECK (completed_sections <= total_sections),
  CHECK (answered_sections <= total_sections)
);

CREATE INDEX IF NOT EXISTS academy_term_learning_progress_student_idx
  ON academy_term_learning_progress(student_id, locale, term_number);
`;

const MIGRATIONS: Migration[] = [
  { filename: "0013_authoritative_academy_state.sql", sql: AUTHORITATIVE_ACADEMY_STATE_SQL },
  { filename: "0014_academy_learning_memory.sql", sql: ACADEMY_LEARNING_MEMORY_SQL },
  { filename: "0015_academy_reflection_memory.sql", sql: ACADEMY_REFLECTION_MEMORY_SQL },
  { filename: "0016_academy_lesson_progress.sql", sql: ACADEMY_LESSON_PROGRESS_SQL },
];

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runUserStateMigrations(client: PoolClient): Promise<void> {
  for (const migration of MIGRATIONS) {
    const cs = checksum(migration.sql);
    const applied = await client.query<{ checksum: string }>(
      `SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1`,
      [migration.filename],
    );

    if (applied.rows[0]) {
      if (applied.rows[0].checksum !== cs) {
        throw new Error(`[db-migrate-user-state] checksum mismatch for ${migration.filename}`);
      }
      continue;
    }

    logger.info("[db-migrate-user-state] applying migration", { filename: migration.filename });
    await client.query("BEGIN");
    try {
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)`,
        [migration.filename, cs],
      );
      await client.query("COMMIT");
      logger.info("[db-migrate-user-state] migration applied", { filename: migration.filename });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}
