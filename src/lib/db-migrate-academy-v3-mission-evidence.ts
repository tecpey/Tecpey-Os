import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0119_academy_v3_mission_evidence.sql";

export const ACADEMY_V3_MISSION_EVIDENCE_SQL = `
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS academy_v3_mission_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  principal_type TEXT NOT NULL DEFAULT 'student' CHECK (principal_type = 'student'),
  principal_id TEXT NOT NULL,
  student_id UUID NOT NULL,
  CHECK (principal_id = student_id::text),
  locale TEXT NOT NULL CHECK (locale IN ('fa','en')),
  mission_id TEXT NOT NULL CHECK (char_length(mission_id) BETWEEN 8 AND 160),
  mission_version INTEGER NOT NULL CHECK (mission_version > 0),
  concept_id TEXT NOT NULL CHECK (char_length(concept_id) BETWEEN 3 AND 120),
  objective_ids JSONB NOT NULL CHECK (
    jsonb_typeof(objective_ids) = 'array'
    AND jsonb_array_length(objective_ids) BETWEEN 1 AND 32
    AND octet_length(objective_ids::text) <= 4096
  ),
  policy_version TEXT NOT NULL CHECK (char_length(policy_version) BETWEEN 8 AND 80),
  mission_sha256 CHAR(64) NOT NULL CHECK (mission_sha256 ~ '^[0-9a-f]{64}$'),
  issued_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (
    char_length(idempotency_key) BETWEEN 8 AND 180
    AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, workspace_id, principal_type, principal_id)
    REFERENCES platform_principal_bindings(tenant_id, workspace_id, principal_type, principal_id)
    ON DELETE RESTRICT,
  UNIQUE (id, tenant_id, workspace_id, principal_type, principal_id, student_id),
  UNIQUE (tenant_id, workspace_id, principal_id, student_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS academy_v3_mission_attempt_student_idx
  ON academy_v3_mission_attempts
    (tenant_id, workspace_id, student_id, issued_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS academy_v3_mission_decision_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  principal_type TEXT NOT NULL DEFAULT 'student' CHECK (principal_type = 'student'),
  principal_id TEXT NOT NULL,
  student_id UUID NOT NULL,
  CHECK (principal_id = student_id::text),
  choice_id TEXT NOT NULL CHECK (
    char_length(choice_id) BETWEEN 1 AND 120
    AND choice_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
  ),
  correct BOOLEAN NOT NULL,
  misconception_id TEXT CHECK (
    misconception_id IS NULL OR (
      char_length(misconception_id) BETWEEN 3 AND 160
      AND misconception_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$'
    )
  ),
  evidence_kind TEXT NOT NULL CHECK (evidence_kind = 'scenario'),
  policy_version TEXT NOT NULL CHECK (char_length(policy_version) BETWEEN 8 AND 80),
  mission_sha256 CHAR(64) NOT NULL CHECK (mission_sha256 ~ '^[0-9a-f]{64}$'),
  submitted_at TIMESTAMPTZ NOT NULL,
  reassessment_due_after TIMESTAMPTZ NOT NULL CHECK (reassessment_due_after > submitted_at),
  idempotency_key TEXT NOT NULL CHECK (
    char_length(idempotency_key) BETWEEN 8 AND 180
    AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$'
  ),
  evidence JSONB NOT NULL CHECK (
    jsonb_typeof(evidence) = 'object' AND octet_length(evidence::text) <= 16384
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (attempt_id, tenant_id, workspace_id, principal_type, principal_id, student_id)
    REFERENCES academy_v3_mission_attempts(id, tenant_id, workspace_id, principal_type, principal_id, student_id)
    ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, attempt_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS academy_v3_mission_decision_student_idx
  ON academy_v3_mission_decision_events
    (tenant_id, workspace_id, student_id, submitted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS academy_v3_mission_reassessment_due_idx
  ON academy_v3_mission_decision_events
    (tenant_id, workspace_id, reassessment_due_after, id);

REVOKE ALL ON TABLE academy_v3_mission_attempts, academy_v3_mission_decision_events FROM PUBLIC;

ALTER TABLE academy_v3_mission_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_v3_mission_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE academy_v3_mission_decision_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_v3_mission_decision_events FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION tecpey_reject_academy_v3_mission_evidence_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'academy v3 mission evidence is append-only' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION tecpey_reject_academy_v3_mission_evidence_mutation() FROM PUBLIC;

DROP TRIGGER IF EXISTS academy_v3_mission_attempts_no_update ON academy_v3_mission_attempts;
CREATE TRIGGER academy_v3_mission_attempts_no_update
BEFORE UPDATE OR DELETE ON academy_v3_mission_attempts
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_academy_v3_mission_evidence_mutation();

DROP TRIGGER IF EXISTS academy_v3_mission_decision_events_no_update ON academy_v3_mission_decision_events;
CREATE TRIGGER academy_v3_mission_decision_events_no_update
BEFORE UPDATE OR DELETE ON academy_v3_mission_decision_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_academy_v3_mission_evidence_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runAcademyV3MissionEvidenceMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ACADEMY_V3_MISSION_EVIDENCE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-academy-v3-mission-evidence] checksum mismatch for ${FILENAME}`);
    }
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_V3_MISSION_EVIDENCE_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
