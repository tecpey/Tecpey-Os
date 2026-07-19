import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0027_academy_progress_authority_v2.sql";

export const ACADEMY_PROGRESS_AUTHORITY_V2_SQL = `
CREATE TABLE IF NOT EXISTS academy_progress_legacy_reward_quarantine (
  id BIGSERIAL PRIMARY KEY,
  original_reward_id BIGINT NOT NULL UNIQUE,
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  reward_key TEXT NOT NULL,
  reward_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  xp INTEGER NOT NULL,
  badge_code TEXT,
  metadata JSONB NOT NULL,
  reason TEXT NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL,
  quarantined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS academy_progress_legacy_reward_student_idx
  ON academy_progress_legacy_reward_quarantine(student_id, locale, quarantined_at DESC);

INSERT INTO academy_progress_legacy_reward_quarantine (
  original_reward_id, student_id, locale, reward_key, reward_type,
  source_type, source_id, xp, badge_code, metadata, reason, awarded_at
)
SELECT id, student_id, locale, reward_key, reward_type,
       source_type, source_id, xp, badge_code, metadata,
       'client_declared_section_completion', awarded_at
  FROM academy_reward_ledger
 WHERE source_type = 'official_section'
    OR (
      reward_key = 'badge:first-lesson'
      AND metadata->>'backfilled' = 'true'
    )
ON CONFLICT (original_reward_id) DO NOTHING;

DELETE FROM academy_reward_ledger
 WHERE source_type = 'official_section'
    OR (
      reward_key = 'badge:first-lesson'
      AND metadata->>'backfilled' = 'true'
    );

CREATE OR REPLACE FUNCTION tecpey_reject_client_section_reward()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_type = 'official_section' THEN
    RAISE EXCEPTION 'client section completion cannot issue rewards'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS academy_reward_ledger_reject_client_section
  ON academy_reward_ledger;
CREATE TRIGGER academy_reward_ledger_reject_client_section
  BEFORE INSERT OR UPDATE ON academy_reward_ledger
  FOR EACH ROW EXECUTE FUNCTION tecpey_reject_client_section_reward();

CREATE OR REPLACE FUNCTION tecpey_block_legacy_academy_progress_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'legacy section progress is read-only; use canonical assessment authority'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS academy_lesson_progress_read_only ON academy_lesson_progress;
CREATE TRIGGER academy_lesson_progress_read_only
  BEFORE INSERT OR UPDATE OR DELETE ON academy_lesson_progress
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_legacy_academy_progress_mutation();

DROP TRIGGER IF EXISTS academy_term_learning_progress_read_only
  ON academy_term_learning_progress;
CREATE TRIGGER academy_term_learning_progress_read_only
  BEFORE INSERT OR UPDATE OR DELETE ON academy_term_learning_progress
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_legacy_academy_progress_mutation();

CREATE OR REPLACE FUNCTION tecpey_block_legacy_progress_quarantine_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'academy_progress_legacy_reward_quarantine is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS academy_progress_legacy_reward_quarantine_no_update
  ON academy_progress_legacy_reward_quarantine;
CREATE TRIGGER academy_progress_legacy_reward_quarantine_no_update
  BEFORE UPDATE ON academy_progress_legacy_reward_quarantine
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_legacy_progress_quarantine_mutation();

DROP TRIGGER IF EXISTS academy_progress_legacy_reward_quarantine_no_delete
  ON academy_progress_legacy_reward_quarantine;
CREATE TRIGGER academy_progress_legacy_reward_quarantine_no_delete
  BEFORE DELETE ON academy_progress_legacy_reward_quarantine
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_legacy_progress_quarantine_mutation();

INSERT INTO academy_progress_legacy_snapshots (
  student_id, locale, snapshot, snapshot_hash,
  reconciliation_status, reconciliation_report
)
SELECT student_id, locale, progress,
       md5(progress::text) || md5('tecpey-academy-v2:' || progress::text),
       'quarantined',
       jsonb_build_object(
         'reason', 'server_projection_v1_included_client_section_evidence',
         'preservedAt', NOW()
       )
  FROM academy_state_documents
 WHERE progress_authority = 'server_projection_v1'
   AND jsonb_typeof(progress) = 'object'
ON CONFLICT (student_id, locale) DO NOTHING;

UPDATE academy_state_documents
   SET progress = '{}'::jsonb,
       progress_authority = 'legacy_section_quarantine',
       projection_hash = NULL,
       projection_updated_at = NULL,
       revision = revision + 1,
       updated_at = NOW()
 WHERE progress_authority = 'server_projection_v1';

UPDATE academy_student_cartax cartax
   SET progress = '{}'::jsonb,
       total_xp = 0,
       earned_badges = '[]'::jsonb,
       streak_days = 0,
       updated_at = NOW()
 WHERE EXISTS (
   SELECT 1
     FROM academy_state_documents state
    WHERE state.student_id = cartax.student_id
      AND state.progress_authority = 'legacy_section_quarantine'
 );
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runAcademyProgressHardeningMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(ACADEMY_PROGRESS_AUTHORITY_V2_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-academy-progress-hardening] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-academy-progress-hardening] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_PROGRESS_AUTHORITY_V2_SQL);
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
