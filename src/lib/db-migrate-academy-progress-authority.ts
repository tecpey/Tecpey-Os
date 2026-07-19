import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0032_academy_lesson_progress_authority.sql";

export const ACADEMY_LESSON_PROGRESS_AUTHORITY_SQL = `
ALTER TABLE academy_lesson_progress
  ADD COLUMN IF NOT EXISTS content_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS question_id TEXT,
  ADD COLUMN IF NOT EXISTS question_version INTEGER,
  ADD COLUMN IF NOT EXISTS selected_option_id TEXT,
  ADD COLUMN IF NOT EXISTS question_passed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS correct_answer_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS authority_version TEXT NOT NULL DEFAULT 'legacy_ungraded';

UPDATE academy_lesson_progress
   SET content_completed = completed,
       question_passed = FALSE,
       completed = FALSE,
       correct_answer_at = NULL,
       authority_version = 'legacy_ungraded'
 WHERE authority_version = 'legacy_ungraded';

ALTER TABLE academy_lesson_progress
  DROP CONSTRAINT IF EXISTS academy_lesson_progress_question_version_check;
ALTER TABLE academy_lesson_progress
  ADD CONSTRAINT academy_lesson_progress_question_version_check
  CHECK (question_version IS NULL OR question_version > 0);

ALTER TABLE academy_lesson_progress
  DROP CONSTRAINT IF EXISTS academy_lesson_progress_pass_evidence_check;
ALTER TABLE academy_lesson_progress
  ADD CONSTRAINT academy_lesson_progress_pass_evidence_check
  CHECK (
    NOT question_passed OR (
      question_id IS NOT NULL
      AND question_version IS NOT NULL
      AND selected_option_id IS NOT NULL
      AND correct_answer_at IS NOT NULL
    )
  );

ALTER TABLE academy_lesson_progress
  DROP CONSTRAINT IF EXISTS academy_lesson_progress_completed_authority_check;
ALTER TABLE academy_lesson_progress
  ADD CONSTRAINT academy_lesson_progress_completed_authority_check
  CHECK (completed = (content_completed AND question_passed));

ALTER TABLE academy_lesson_progress
  DROP CONSTRAINT IF EXISTS academy_lesson_progress_authority_version_check;
ALTER TABLE academy_lesson_progress
  ADD CONSTRAINT academy_lesson_progress_authority_version_check
  CHECK (authority_version IN ('legacy_ungraded', 'server_graded_v1'));

ALTER TABLE academy_term_learning_progress
  ADD COLUMN IF NOT EXISTS passed_sections SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS authority_version TEXT NOT NULL DEFAULT 'legacy_ungraded';

UPDATE academy_term_learning_progress
   SET passed_sections = 0,
       percent = 0,
       xp = 0,
       authority_version = 'legacy_ungraded'
 WHERE authority_version = 'legacy_ungraded';

ALTER TABLE academy_term_learning_progress
  DROP CONSTRAINT IF EXISTS academy_term_learning_progress_passed_sections_check;
ALTER TABLE academy_term_learning_progress
  ADD CONSTRAINT academy_term_learning_progress_passed_sections_check
  CHECK (passed_sections BETWEEN 0 AND total_sections);

ALTER TABLE academy_term_learning_progress
  DROP CONSTRAINT IF EXISTS academy_term_learning_progress_authority_version_check;
ALTER TABLE academy_term_learning_progress
  ADD CONSTRAINT academy_term_learning_progress_authority_version_check
  CHECK (authority_version IN ('legacy_ungraded', 'server_graded_v1'));

CREATE TABLE IF NOT EXISTS academy_lesson_attempt_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  term_number SMALLINT NOT NULL CHECK (term_number BETWEEN 1 AND 7),
  term_slug TEXT NOT NULL,
  section_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('content_complete', 'quick_check_answer', 'legacy_import')),
  question_id TEXT,
  question_version INTEGER,
  selected_option_id TEXT,
  is_correct BOOLEAN,
  request_hash CHAR(64) NOT NULL,
  idempotency_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, idempotency_key),
  CHECK (term_slug = ('term-' || term_number::text)),
  CHECK (char_length(section_key) BETWEEN 1 AND 220),
  CHECK (char_length(idempotency_key) BETWEEN 16 AND 128),
  CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CHECK (question_version IS NULL OR question_version > 0),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (
    action <> 'quick_check_answer' OR (
      question_id IS NOT NULL
      AND question_version IS NOT NULL
      AND selected_option_id IS NOT NULL
      AND is_correct IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS academy_lesson_attempt_evidence_student_idx
  ON academy_lesson_attempt_evidence
    (student_id, locale, term_number, section_key, created_at DESC);
CREATE INDEX IF NOT EXISTS academy_lesson_attempt_evidence_question_idx
  ON academy_lesson_attempt_evidence
    (question_id, question_version, created_at DESC)
  WHERE question_id IS NOT NULL;

CREATE OR REPLACE FUNCTION tecpey_enforce_academy_lesson_progress_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.authority_version = 'server_graded_v1' THEN
    NEW.completed := NEW.content_completed AND NEW.question_passed;
    IF NEW.question_passed AND NEW.correct_answer_at IS NULL THEN
      NEW.correct_answer_at := NOW();
    END IF;
  ELSE
    NEW.completed := FALSE;
    NEW.question_passed := FALSE;
    NEW.correct_answer_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS academy_lesson_progress_authority_trigger
  ON academy_lesson_progress;
CREATE TRIGGER academy_lesson_progress_authority_trigger
  BEFORE INSERT OR UPDATE ON academy_lesson_progress
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_enforce_academy_lesson_progress_authority();

CREATE OR REPLACE FUNCTION tecpey_protect_academy_lesson_attempt_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'academy lesson attempt evidence is append-only';
END;
$$;

DROP TRIGGER IF EXISTS academy_lesson_attempt_evidence_no_update
  ON academy_lesson_attempt_evidence;
CREATE TRIGGER academy_lesson_attempt_evidence_no_update
  BEFORE UPDATE ON academy_lesson_attempt_evidence
  FOR EACH ROW EXECUTE FUNCTION tecpey_protect_academy_lesson_attempt_evidence();

DROP TRIGGER IF EXISTS academy_lesson_attempt_evidence_no_delete
  ON academy_lesson_attempt_evidence;
CREATE TRIGGER academy_lesson_attempt_evidence_no_delete
  BEFORE DELETE ON academy_lesson_attempt_evidence
  FOR EACH ROW EXECUTE FUNCTION tecpey_protect_academy_lesson_attempt_evidence();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runAcademyProgressAuthorityMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(ACADEMY_LESSON_PROGRESS_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-academy-progress-authority] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-academy-progress-authority] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_LESSON_PROGRESS_AUTHORITY_SQL);
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
