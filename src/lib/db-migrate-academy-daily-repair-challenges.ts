import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0083_academy_daily_repair_challenges.sql";

export const ACADEMY_DAILY_REPAIR_CHALLENGES_SQL = `
CREATE TABLE IF NOT EXISTS academy_daily_repair_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  principal_type TEXT NOT NULL DEFAULT 'student',
  principal_id TEXT NOT NULL,
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  challenge_date DATE NOT NULL,
  weakness_signal_id BIGINT REFERENCES academy_mastery_weakness_signals(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('assessment', 'arena', 'mentor', 'market', 'manual', 'system')),
  source_id TEXT NOT NULL,
  concept_tag TEXT NOT NULL CHECK (concept_tag ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  challenge_key TEXT NOT NULL CHECK (challenge_key ~ '^daily-repair:[a-z]{2}:[0-9]{4}-[0-9]{2}-[0-9]{2}:[a-z0-9][a-z0-9._-]{1,79}$'),
  question_payload JSONB NOT NULL CHECK (jsonb_typeof(question_payload) = 'object'),
  expected_answer JSONB NOT NULL CHECK (jsonb_typeof(expected_answer) = 'object'),
  policy_version TEXT NOT NULL CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$'),
  evidence_sha256 CHAR(64) NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  idempotency_key TEXT NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT academy_daily_repair_principal_check
    CHECK (principal_type = 'student' AND principal_id = student_id::text),
  CONSTRAINT academy_daily_repair_binding_fk
    FOREIGN KEY (tenant_id, workspace_id, principal_type, principal_id)
    REFERENCES platform_principal_bindings(tenant_id, workspace_id, principal_type, principal_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT academy_daily_repair_workspace_fk
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT academy_daily_repair_one_per_day
    UNIQUE (tenant_id, workspace_id, student_id, locale, challenge_date),
  CONSTRAINT academy_daily_repair_idempotency
    UNIQUE (tenant_id, workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS academy_daily_repair_student_idx
  ON academy_daily_repair_challenges
    (tenant_id, workspace_id, student_id, locale, challenge_date DESC);
CREATE INDEX IF NOT EXISTS academy_daily_repair_concept_idx
  ON academy_daily_repair_challenges
    (tenant_id, workspace_id, locale, concept_tag, challenge_date DESC);

CREATE TABLE IF NOT EXISTS academy_daily_repair_challenge_events (
  id BIGSERIAL PRIMARY KEY,
  challenge_id UUID NOT NULL REFERENCES academy_daily_repair_challenges(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  principal_type TEXT NOT NULL DEFAULT 'student',
  principal_id TEXT NOT NULL,
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  event_type TEXT NOT NULL CHECK (event_type = 'completion_submitted'),
  idempotency_key TEXT NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$'),
  answer_payload JSONB NOT NULL CHECK (jsonb_typeof(answer_payload) = 'object'),
  answer_sha256 CHAR(64) NOT NULL CHECK (answer_sha256 ~ '^[0-9a-f]{64}$'),
  passed BOOLEAN NOT NULL,
  policy_version TEXT NOT NULL CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$'),
  evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT academy_daily_repair_event_principal_check
    CHECK (principal_type = 'student' AND principal_id = student_id::text),
  CONSTRAINT academy_daily_repair_event_binding_fk
    FOREIGN KEY (tenant_id, workspace_id, principal_type, principal_id)
    REFERENCES platform_principal_bindings(tenant_id, workspace_id, principal_type, principal_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT academy_daily_repair_event_workspace_fk
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT academy_daily_repair_event_idempotency
    UNIQUE (tenant_id, workspace_id, challenge_id, event_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS academy_daily_repair_events_challenge_idx
  ON academy_daily_repair_challenge_events(challenge_id, created_at DESC);
CREATE INDEX IF NOT EXISTS academy_daily_repair_events_student_idx
  ON academy_daily_repair_challenge_events
    (tenant_id, workspace_id, student_id, locale, created_at DESC);

CREATE OR REPLACE FUNCTION tecpey_reject_daily_repair_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'daily repair challenge ledgers are append-only' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_daily_repair_challenges_no_update
  ON academy_daily_repair_challenges;
CREATE TRIGGER academy_daily_repair_challenges_no_update
BEFORE UPDATE OR DELETE ON academy_daily_repair_challenges
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_daily_repair_mutation();

DROP TRIGGER IF EXISTS academy_daily_repair_challenge_events_no_update
  ON academy_daily_repair_challenge_events;
CREATE TRIGGER academy_daily_repair_challenge_events_no_update
BEFORE UPDATE OR DELETE ON academy_daily_repair_challenge_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_daily_repair_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runAcademyDailyRepairChallengeMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ACADEMY_DAILY_REPAIR_CHALLENGES_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-academy-daily-repair-challenges] checksum mismatch for ${FILENAME}`);
    }
    return;
  }
  logger.info("[db-migrate-academy-daily-repair-challenges] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_DAILY_REPAIR_CHALLENGES_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
