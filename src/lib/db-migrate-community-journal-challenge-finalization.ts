import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0049_community_journal_challenge_finalization.sql";

export const COMMUNITY_JOURNAL_CHALLENGE_FINALIZATION_SQL = `
DROP TRIGGER IF EXISTS academy_community_challenge_enrollment_guard
  ON academy_community_challenge_enrollments;

ALTER TABLE academy_community_challenge_enrollments
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalization_source TEXT,
  ADD COLUMN IF NOT EXISTS finalization_run_id UUID;

UPDATE academy_community_challenge_enrollments
   SET finalized_at = COALESCE(finalized_at, completed_at, evaluated_at, updated_at),
       finalization_source = COALESCE(finalization_source, 'interactive'),
       finalization_run_id = NULL
 WHERE status = 'completed';

ALTER TABLE academy_community_challenge_enrollments
  DROP CONSTRAINT IF EXISTS academy_community_challenge_status_check,
  DROP CONSTRAINT IF EXISTS academy_community_challenge_completion_check,
  DROP CONSTRAINT IF EXISTS academy_community_challenge_finalization_check;

ALTER TABLE academy_community_challenge_enrollments
  ADD CONSTRAINT academy_community_challenge_status_check
    CHECK (status IN ('active', 'completed', 'not_completed')),
  ADD CONSTRAINT academy_community_challenge_finalization_check
    CHECK (
      (
        status = 'active'
        AND completed_at IS NULL
        AND finalized_at IS NULL
        AND finalization_source IS NULL
        AND finalization_run_id IS NULL
      )
      OR
      (
        status = 'completed'
        AND completed_at IS NOT NULL
        AND evaluated_at IS NOT NULL
        AND finalized_at IS NOT NULL
        AND finalization_source IN ('interactive', 'worker')
        AND (
          (finalization_source = 'interactive' AND finalization_run_id IS NULL)
          OR
          (finalization_source = 'worker' AND finalization_run_id IS NOT NULL)
        )
        AND eligible_closed_trade_count >= 3
        AND valid_reflection_count * 5 >= eligible_closed_trade_count * 4
      )
      OR
      (
        status = 'not_completed'
        AND completed_at IS NULL
        AND evaluated_at IS NOT NULL
        AND finalized_at IS NOT NULL
        AND finalized_at >= cycle_ends_at
        AND finalization_source = 'worker'
        AND finalization_run_id IS NOT NULL
        AND (
          eligible_closed_trade_count < 3
          OR valid_reflection_count * 5 < eligible_closed_trade_count * 4
        )
      )
    );

ALTER TABLE academy_community_challenge_events
  DROP CONSTRAINT IF EXISTS academy_community_challenge_event_type_check;
ALTER TABLE academy_community_challenge_events
  ADD CONSTRAINT academy_community_challenge_event_type_check
    CHECK (
      event_type IN (
        'joined',
        'evaluated',
        'completed',
        'finalized_completed',
        'finalized_not_completed'
      )
    );

CREATE UNIQUE INDEX IF NOT EXISTS academy_community_challenge_one_finalization_event_idx
  ON academy_community_challenge_events (enrollment_id)
  WHERE event_type IN ('finalized_completed', 'finalized_not_completed');

CREATE INDEX IF NOT EXISTS academy_community_challenge_due_finalization_idx
  ON academy_community_challenge_enrollments (cycle_ends_at ASC, id ASC)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION tecpey_guard_community_challenge_enrollment()
RETURNS TRIGGER AS $$
DECLARE
  authority_changed BOOLEAN;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.principal_type IS DISTINCT FROM OLD.principal_type
     OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.challenge_id IS DISTINCT FROM OLD.challenge_id
     OR NEW.challenge_version IS DISTINCT FROM OLD.challenge_version
     OR NEW.cycle_key IS DISTINCT FROM OLD.cycle_key
     OR NEW.cycle_starts_at IS DISTINCT FROM OLD.cycle_starts_at
     OR NEW.cycle_ends_at IS DISTINCT FROM OLD.cycle_ends_at
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'community challenge enrollment identity is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'completed community challenge enrollment is immutable'
      USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'not_completed' THEN
    RAISE EXCEPTION 'finalized community challenge enrollment is immutable'
      USING ERRCODE = '55000';
  END IF;

  authority_changed :=
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.evaluated_at IS DISTINCT FROM OLD.evaluated_at
    OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
    OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at
    OR NEW.finalization_source IS DISTINCT FROM OLD.finalization_source
    OR NEW.finalization_run_id IS DISTINCT FROM OLD.finalization_run_id
    OR NEW.eligible_closed_trade_count IS DISTINCT FROM OLD.eligible_closed_trade_count
    OR NEW.valid_reflection_count IS DISTINCT FROM OLD.valid_reflection_count;

  IF authority_changed AND NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'community challenge revision must advance by one'
      USING ERRCODE = '55000';
  END IF;
  IF NOT authority_changed AND NEW.revision <> OLD.revision THEN
    RAISE EXCEPTION 'community challenge revision cannot change without authority mutation'
      USING ERRCODE = '55000';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER academy_community_challenge_enrollment_guard
BEFORE UPDATE ON academy_community_challenge_enrollments
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_community_challenge_enrollment();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runCommunityJournalChallengeFinalizationMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(COMMUNITY_JOURNAL_CHALLENGE_FINALIZATION_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-community-journal-challenge-finalization] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(COMMUNITY_JOURNAL_CHALLENGE_FINALIZATION_SQL);
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
