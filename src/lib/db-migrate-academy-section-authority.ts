import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0027_academy_section_checkpoint_authority.sql";

export const ACADEMY_SECTION_CHECKPOINT_AUTHORITY_SQL = `
CREATE TABLE IF NOT EXISTS academy_section_legacy_snapshots (
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  term_slug TEXT NOT NULL,
  section_key TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  snapshot_hash CHAR(64) NOT NULL,
  reconciliation_status TEXT NOT NULL DEFAULT 'quarantined'
    CHECK (reconciliation_status IN ('quarantined', 'reviewed', 'accepted', 'rejected')),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  PRIMARY KEY (student_id, locale, term_slug, section_key),
  CHECK (jsonb_typeof(snapshot) = 'object'),
  CHECK (snapshot_hash ~ '^[0-9a-f]{64}$')
);

ALTER TABLE academy_lesson_progress
  ADD COLUMN IF NOT EXISTS question_id TEXT,
  ADD COLUMN IF NOT EXISTS question_version TEXT,
  ADD COLUMN IF NOT EXISTS selected_option_id TEXT,
  ADD COLUMN IF NOT EXISTS last_answer_correct BOOLEAN,
  ADD COLUMN IF NOT EXISTS best_score SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS passed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS authority_status TEXT NOT NULL DEFAULT 'legacy_unverified';

INSERT INTO academy_section_legacy_snapshots
  (student_id, locale, term_slug, section_key, snapshot, snapshot_hash)
SELECT student_id,
       locale,
       term_slug,
       section_key,
       jsonb_build_object(
         'termNumber', term_number,
         'sectionHeading', section_heading,
         'completed', completed,
         'answer', answer,
         'firstAnswer', first_answer,
         'answerAttempts', answer_attempts,
         'completedAt', completed_at,
         'answeredAt', answered_at,
         'updatedAt', updated_at,
         'reason', 'client_mutable_section_state'
       ),
       encode(digest(
         jsonb_build_object(
           'termNumber', term_number,
           'sectionHeading', section_heading,
           'completed', completed,
           'answer', answer,
           'firstAnswer', first_answer,
           'answerAttempts', answer_attempts,
           'completedAt', completed_at,
           'answeredAt', answered_at,
           'updatedAt', updated_at
         )::text,
         'sha256'
       ), 'hex')
  FROM academy_lesson_progress
 WHERE authority_status <> 'server_checkpoint_v1'
ON CONFLICT (student_id, locale, term_slug, section_key) DO NOTHING;

UPDATE academy_lesson_progress
   SET completed = FALSE,
       answer = NULL,
       first_answer = NULL,
       answer_attempts = '[]'::jsonb,
       completed_at = NULL,
       answered_at = NULL,
       question_id = NULL,
       question_version = NULL,
       selected_option_id = NULL,
       last_answer_correct = NULL,
       best_score = 0,
       attempt_count = 0,
       passed_at = NULL,
       authority_status = 'legacy_quarantined',
       updated_at = NOW()
 WHERE authority_status <> 'server_checkpoint_v1';

UPDATE academy_term_learning_progress summary
   SET completed_sections = authoritative.completed_sections,
       answered_sections = authoritative.answered_sections,
       percent = CASE
         WHEN summary.total_sections > 0
           THEN ROUND((authoritative.completed_sections::numeric / summary.total_sections::numeric) * 100)::int
         ELSE 0
       END,
       xp = authoritative.completed_sections * 15,
       updated_at = NOW()
  FROM (
    SELECT summary_inner.student_id,
           summary_inner.locale,
           summary_inner.term_slug,
           COUNT(progress.section_key) FILTER (
             WHERE progress.authority_status = 'server_checkpoint_v1'
               AND progress.completed = TRUE
           )::int AS completed_sections,
           COUNT(progress.section_key) FILTER (
             WHERE progress.authority_status = 'server_checkpoint_v1'
               AND progress.attempt_count > 0
           )::int AS answered_sections
      FROM academy_term_learning_progress summary_inner
      LEFT JOIN academy_lesson_progress progress
        ON progress.student_id = summary_inner.student_id
       AND progress.locale = summary_inner.locale
       AND progress.term_slug = summary_inner.term_slug
     GROUP BY summary_inner.student_id, summary_inner.locale, summary_inner.term_slug
  ) authoritative
 WHERE summary.student_id = authoritative.student_id
   AND summary.locale = authoritative.locale
   AND summary.term_slug = authoritative.term_slug;

ALTER TABLE academy_lesson_progress
  DROP CONSTRAINT IF EXISTS academy_lesson_progress_authority_status_check;
ALTER TABLE academy_lesson_progress
  ADD CONSTRAINT academy_lesson_progress_authority_status_check
  CHECK (authority_status IN ('legacy_unverified', 'legacy_quarantined', 'server_checkpoint_v1'));
ALTER TABLE academy_lesson_progress
  DROP CONSTRAINT IF EXISTS academy_lesson_progress_checkpoint_completion_check;
ALTER TABLE academy_lesson_progress
  ADD CONSTRAINT academy_lesson_progress_checkpoint_completion_check
  CHECK (
    completed = FALSE
    OR (
      authority_status = 'server_checkpoint_v1'
      AND last_answer_correct = TRUE
      AND question_id IS NOT NULL
      AND question_version IS NOT NULL
      AND selected_option_id IS NOT NULL
      AND passed_at IS NOT NULL
      AND best_score = 100
    )
  );
ALTER TABLE academy_lesson_progress
  DROP CONSTRAINT IF EXISTS academy_lesson_progress_attempt_count_check;
ALTER TABLE academy_lesson_progress
  ADD CONSTRAINT academy_lesson_progress_attempt_count_check
  CHECK (attempt_count >= 0 AND best_score BETWEEN 0 AND 100);

CREATE TABLE IF NOT EXISTS academy_section_attempts (
  id BIGSERIAL PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  term_number SMALLINT NOT NULL CHECK (term_number BETWEEN 1 AND 7),
  term_slug TEXT NOT NULL,
  section_key TEXT NOT NULL,
  question_id TEXT NOT NULL,
  question_version TEXT NOT NULL,
  selected_option_id TEXT NOT NULL,
  correct BOOLEAN NOT NULL,
  score SMALLINT NOT NULL CHECK (score IN (0, 100)),
  request_hash CHAR(64) NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, locale, idempotency_key),
  CHECK (term_slug = ('term-' || term_number::text)),
  CHECK (char_length(section_key) BETWEEN 1 AND 220),
  CHECK (char_length(question_id) BETWEEN 3 AND 300),
  CHECK (char_length(question_version) BETWEEN 8 AND 100),
  CHECK (char_length(selected_option_id) BETWEEN 1 AND 120),
  CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CHECK (char_length(idempotency_key) BETWEEN 16 AND 160)
);

CREATE INDEX IF NOT EXISTS academy_section_attempts_student_term_idx
  ON academy_section_attempts(student_id, locale, term_number, created_at DESC);
CREATE INDEX IF NOT EXISTS academy_section_attempts_question_idx
  ON academy_section_attempts(question_id, question_version, created_at DESC);

CREATE OR REPLACE FUNCTION tecpey_block_academy_section_attempt_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'academy_section_attempts is append-only grading evidence'
    USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS academy_section_attempts_no_update ON academy_section_attempts;
CREATE TRIGGER academy_section_attempts_no_update
  BEFORE UPDATE ON academy_section_attempts
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_academy_section_attempt_mutation();
DROP TRIGGER IF EXISTS academy_section_attempts_no_delete ON academy_section_attempts;
CREATE TRIGGER academy_section_attempts_no_delete
  BEFORE DELETE ON academy_section_attempts
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_academy_section_attempt_mutation();

ALTER TABLE academy_reward_ledger
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revocation_reason TEXT;

UPDATE academy_reward_ledger
   SET revoked_at = NOW(),
       revocation_reason = 'legacy_client_mutable_section_state'
 WHERE reward_key = 'badge:first-lesson'
   AND source_type = 'official_section'
   AND COALESCE((metadata ->> 'backfilled')::boolean, FALSE) = TRUE
   AND revoked_at IS NULL;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runAcademySectionAuthorityMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ACADEMY_SECTION_CHECKPOINT_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-academy-section-authority] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-academy-section-authority] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    await client.query(ACADEMY_SECTION_CHECKPOINT_AUTHORITY_SQL);
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
