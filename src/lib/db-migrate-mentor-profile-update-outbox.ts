import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0105_mentor_profile_update_outbox.sql";

export const MENTOR_PROFILE_UPDATE_OUTBOX_SQL = `
CREATE TABLE IF NOT EXISTS mentor_profile_update_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence BIGSERIAL NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL REFERENCES platform_tenants(id) ON DELETE RESTRICT,
  workspace_id TEXT NOT NULL,
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'academy.term_progress',
    'mentor.challenge_attempt',
    'arena.trade_signal',
    'mentor.conversation'
  )),
  event_version SMALLINT NOT NULL DEFAULT 1 CHECK (event_version = 1),
  event_id TEXT NOT NULL UNIQUE,
  source_reference TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'authoritative_term_assessment',
    'mentor_challenge_answered',
    'trading_trade_created',
    'mentor_conversation_saved',
    'mentor_conversation_migrated'
  )),
  payload_hash CHAR(64) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'processing',
    'processed',
    'failed_retryable',
    'failed_terminal'
  )),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 20),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  lease_expires_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  terminal_at TIMESTAMPTZ,
  profile_result_hash CHAR(64),
  last_error_code TEXT,
  last_error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mentor_profile_update_outbox_workspace_fk
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (id, tenant_id, workspace_id),
  CHECK (char_length(workspace_id) BETWEEN 1 AND 120),
  CHECK (char_length(event_id) BETWEEN 16 AND 180),
  CHECK (event_id ~ '^[A-Za-z0-9._:-]+$'),
  CHECK (char_length(source_reference) BETWEEN 1 AND 180),
  CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  CHECK (profile_result_hash IS NULL OR profile_result_hash ~ '^[a-f0-9]{64}$'),
  CHECK (locked_by IS NULL OR char_length(locked_by) BETWEEN 1 AND 200),
  CHECK (last_error_code IS NULL OR char_length(last_error_code) BETWEEN 1 AND 100),
  CHECK (last_error_detail IS NULL OR char_length(last_error_detail) <= 2000),
  CHECK (
    (status = 'processing'
      AND locked_at IS NOT NULL
      AND locked_by IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND processed_at IS NULL
      AND terminal_at IS NULL)
    OR
    (status = 'processed'
      AND locked_at IS NULL
      AND locked_by IS NULL
      AND lease_expires_at IS NULL
      AND processed_at IS NOT NULL
      AND terminal_at IS NOT NULL
      AND profile_result_hash IS NOT NULL)
    OR
    (status = 'failed_terminal'
      AND locked_at IS NULL
      AND locked_by IS NULL
      AND lease_expires_at IS NULL
      AND processed_at IS NULL
      AND terminal_at IS NOT NULL)
    OR
    (status IN ('pending', 'failed_retryable')
      AND locked_at IS NULL
      AND locked_by IS NULL
      AND lease_expires_at IS NULL
      AND processed_at IS NULL
      AND terminal_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS mentor_profile_update_outbox_claim_idx
  ON mentor_profile_update_outbox (status, available_at, event_sequence)
  WHERE status IN ('pending', 'failed_retryable');

CREATE INDEX IF NOT EXISTS mentor_profile_update_outbox_student_idx
  ON mentor_profile_update_outbox (student_id, event_sequence DESC);

CREATE INDEX IF NOT EXISTS mentor_profile_update_outbox_lease_idx
  ON mentor_profile_update_outbox (lease_expires_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS mentor_profile_update_outbox_terminal_idx
  ON mentor_profile_update_outbox (terminal_at DESC)
  WHERE status = 'failed_terminal';

CREATE OR REPLACE FUNCTION tecpey_protect_mentor_profile_event_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'mentor profile update events cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.event_sequence IS DISTINCT FROM NEW.event_sequence
    OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
    OR OLD.student_id IS DISTINCT FROM NEW.student_id
    OR OLD.event_type IS DISTINCT FROM NEW.event_type
    OR OLD.event_version IS DISTINCT FROM NEW.event_version
    OR OLD.event_id IS DISTINCT FROM NEW.event_id
    OR OLD.source_reference IS DISTINCT FROM NEW.source_reference
    OR OLD.reason IS DISTINCT FROM NEW.reason
    OR OLD.payload_hash IS DISTINCT FROM NEW.payload_hash
    OR OLD.occurred_at IS DISTINCT FROM NEW.occurred_at
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'mentor profile update event identity is immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mentor_profile_update_outbox_identity_no_update
  ON mentor_profile_update_outbox;
CREATE TRIGGER mentor_profile_update_outbox_identity_no_update
  BEFORE UPDATE ON mentor_profile_update_outbox
  FOR EACH ROW EXECUTE FUNCTION tecpey_protect_mentor_profile_event_identity();

DROP TRIGGER IF EXISTS mentor_profile_update_outbox_no_delete
  ON mentor_profile_update_outbox;
CREATE TRIGGER mentor_profile_update_outbox_no_delete
  BEFORE DELETE ON mentor_profile_update_outbox
  FOR EACH ROW EXECUTE FUNCTION tecpey_protect_mentor_profile_event_identity();

CREATE TABLE IF NOT EXISTS mentor_profile_update_attempts (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  outbox_id UUID NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  worker_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'claimed',
    'processed',
    'failed_retryable',
    'failed_terminal',
    'lease_recovered'
  )),
  error_code TEXT,
  error_detail TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  result_hash CHAR(64),
  CONSTRAINT mentor_profile_update_attempts_outbox_scope_fk
    FOREIGN KEY (outbox_id, tenant_id, workspace_id)
    REFERENCES mentor_profile_update_outbox(id, tenant_id, workspace_id)
    ON DELETE RESTRICT,
  UNIQUE (outbox_id, attempt_number),
  CHECK (char_length(workspace_id) BETWEEN 1 AND 120),
  CHECK (char_length(worker_id) BETWEEN 1 AND 200),
  CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 100),
  CHECK (error_detail IS NULL OR char_length(error_detail) <= 2000),
  CHECK (result_hash IS NULL OR result_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS mentor_profile_update_attempts_outbox_idx
  ON mentor_profile_update_attempts
    (tenant_id, workspace_id, outbox_id, attempt_number DESC);

CREATE TABLE IF NOT EXISTS mentor_profile_update_dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  outbox_id UUID NOT NULL UNIQUE,
  terminal_reason TEXT NOT NULL,
  event_id TEXT NOT NULL,
  student_fingerprint CHAR(64) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mentor_profile_update_dead_letters_outbox_scope_fk
    FOREIGN KEY (outbox_id, tenant_id, workspace_id)
    REFERENCES mentor_profile_update_outbox(id, tenant_id, workspace_id)
    ON DELETE RESTRICT,
  CHECK (char_length(workspace_id) BETWEEN 1 AND 120),
  CHECK (char_length(terminal_reason) BETWEEN 1 AND 100),
  CHECK (student_fingerprint ~ '^[a-f0-9]{64}$'),
  CHECK (payload_hash ~ '^[a-f0-9]{64}$')
);

CREATE OR REPLACE FUNCTION tecpey_block_mentor_profile_dead_letter_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'mentor_profile_update_dead_letters is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS mentor_profile_update_dead_letters_no_update
  ON mentor_profile_update_dead_letters;
CREATE TRIGGER mentor_profile_update_dead_letters_no_update
  BEFORE UPDATE ON mentor_profile_update_dead_letters
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_mentor_profile_dead_letter_mutation();

DROP TRIGGER IF EXISTS mentor_profile_update_dead_letters_no_delete
  ON mentor_profile_update_dead_letters;
CREATE TRIGGER mentor_profile_update_dead_letters_no_delete
  BEFORE DELETE ON mentor_profile_update_dead_letters
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_mentor_profile_dead_letter_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runMentorProfileUpdateOutboxMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(MENTOR_PROFILE_UPDATE_OUTBOX_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-mentor-profile-update-outbox] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(MENTOR_PROFILE_UPDATE_OUTBOX_SQL);
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
