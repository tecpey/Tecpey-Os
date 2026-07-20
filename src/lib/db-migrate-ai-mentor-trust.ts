import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0034_ai_mentor_trust_boundary.sql";

export const AI_MENTOR_TRUST_SQL = `
CREATE TABLE IF NOT EXISTS mentor_ai_preferences (
  student_id UUID PRIMARY KEY REFERENCES academy_students(id) ON DELETE CASCADE,
  external_provider_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  behavioral_personalization_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  real_exchange_signals_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  consent_version TEXT NOT NULL DEFAULT '2026-07-20.1',
  consented_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mentor_conversations
  ADD COLUMN IF NOT EXISTS request_id UUID,
  ADD COLUMN IF NOT EXISTS content_class TEXT NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS retention_class TEXT NOT NULL DEFAULT 'mentor_history_90d';

CREATE INDEX IF NOT EXISTS mentor_conversations_request_idx
  ON mentor_conversations(student_id, request_id, created_at ASC)
  WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ai_mentor_request_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'tecpey',
  request_id UUID NOT NULL,
  student_id UUID REFERENCES academy_students(id) ON DELETE SET NULL,
  phase TEXT NOT NULL CHECK (phase IN ('blocked', 'local', 'admitted', 'completed')),
  provider TEXT NOT NULL,
  model TEXT,
  policy_version TEXT NOT NULL,
  context_classes TEXT[] NOT NULL DEFAULT '{}',
  redaction_count INTEGER NOT NULL DEFAULT 0 CHECK (redaction_count >= 0),
  injection_signal_count INTEGER NOT NULL DEFAULT 0 CHECK (injection_signal_count >= 0),
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  input_chars INTEGER NOT NULL DEFAULT 0 CHECK (input_chars >= 0),
  estimated_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (estimated_input_tokens >= 0),
  estimated_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (estimated_output_tokens >= 0),
  outcome TEXT NOT NULL CHECK (outcome IN (
    'blocked_secret',
    'local_guidance',
    'provider_admitted',
    'provider_success',
    'provider_failure',
    'provider_timeout',
    'provider_circuit_open',
    'output_rejected',
    'evidence_unavailable'
  )),
  memory_persisted BOOLEAN,
  retention_class TEXT NOT NULL DEFAULT 'ai_evidence_365d',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, phase),
  CHECK (tenant_id ~ '^[a-z][a-z0-9._-]{1,79}$'),
  CHECK (provider ~ '^[a-z][a-z0-9._-]{1,39}$'),
  CHECK (model IS NULL OR length(model) BETWEEN 1 AND 120),
  CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$'),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (octet_length(metadata::text) <= 8192)
);

CREATE INDEX IF NOT EXISTS ai_mentor_evidence_student_idx
  ON ai_mentor_request_evidence(student_id, created_at DESC)
  WHERE student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_mentor_evidence_outcome_idx
  ON ai_mentor_request_evidence(outcome, created_at DESC);

CREATE OR REPLACE FUNCTION tecpey_validate_ai_mentor_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF tecpey_sensitive_audit_has_forbidden_key(NEW.metadata) THEN
    RAISE EXCEPTION 'AI mentor evidence metadata contains forbidden keys'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION tecpey_reject_ai_mentor_evidence_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AI mentor request evidence is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS ai_mentor_evidence_validate
  ON ai_mentor_request_evidence;
CREATE TRIGGER ai_mentor_evidence_validate
  BEFORE INSERT ON ai_mentor_request_evidence
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_validate_ai_mentor_evidence();

DROP TRIGGER IF EXISTS ai_mentor_evidence_no_update
  ON ai_mentor_request_evidence;
CREATE TRIGGER ai_mentor_evidence_no_update
  BEFORE UPDATE ON ai_mentor_request_evidence
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_reject_ai_mentor_evidence_change();

DROP TRIGGER IF EXISTS ai_mentor_evidence_no_delete
  ON ai_mentor_request_evidence;
CREATE TRIGGER ai_mentor_evidence_no_delete
  BEFORE DELETE ON ai_mentor_request_evidence
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_reject_ai_mentor_evidence_change();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runAiMentorTrustMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(AI_MENTOR_TRUST_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-ai-mentor-trust] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-ai-mentor-trust] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(AI_MENTOR_TRUST_SQL);
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
