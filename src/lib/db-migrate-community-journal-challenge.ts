import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0048_community_journal_reflection_challenge.sql";

export const COMMUNITY_JOURNAL_CHALLENGE_SQL = `
CREATE TABLE IF NOT EXISTS academy_community_challenge_enrollments (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  principal_type TEXT NOT NULL DEFAULT 'student',
  student_id UUID NOT NULL,
  principal_id TEXT GENERATED ALWAYS AS (student_id::text) STORED,
  challenge_id TEXT NOT NULL,
  challenge_version TEXT NOT NULL,
  cycle_key TEXT NOT NULL,
  cycle_starts_at TIMESTAMPTZ NOT NULL,
  cycle_ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  revision BIGINT NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evaluated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  eligible_closed_trade_count INTEGER NOT NULL DEFAULT 0,
  valid_reflection_count INTEGER NOT NULL DEFAULT 0,
  coverage_rate NUMERIC(8,6)
    GENERATED ALWAYS AS (
      CASE
        WHEN eligible_closed_trade_count = 0 THEN 0::numeric
        ELSE ROUND(valid_reflection_count::numeric / eligible_closed_trade_count::numeric, 6)
      END
    ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT academy_community_challenge_principal_type_check
    CHECK (principal_type = 'student'),
  CONSTRAINT academy_community_challenge_status_check
    CHECK (status IN ('active', 'completed')),
  CONSTRAINT academy_community_challenge_id_check
    CHECK (challenge_id = 'journal-reflection-week'),
  CONSTRAINT academy_community_challenge_version_check
    CHECK (challenge_version = 'journal-reflection-v1'),
  CONSTRAINT academy_community_challenge_cycle_key_check
    CHECK (cycle_key ~ '^[0-9]{4}-W[0-9]{2}$'),
  CONSTRAINT academy_community_challenge_cycle_window_check
    CHECK (cycle_ends_at > cycle_starts_at),
  CONSTRAINT academy_community_challenge_started_window_check
    CHECK (started_at >= cycle_starts_at AND started_at < cycle_ends_at),
  CONSTRAINT academy_community_challenge_counts_check
    CHECK (
      eligible_closed_trade_count >= 0
      AND valid_reflection_count >= 0
      AND valid_reflection_count <= eligible_closed_trade_count
    ),
  CONSTRAINT academy_community_challenge_completion_check
    CHECK (
      (status = 'completed'
        AND completed_at IS NOT NULL
        AND eligible_closed_trade_count >= 3
        AND valid_reflection_count * 5 >= eligible_closed_trade_count * 4)
      OR
      (status = 'active' AND completed_at IS NULL)
    ),
  CONSTRAINT academy_community_challenge_student_fk
    FOREIGN KEY (student_id)
    REFERENCES academy_students(id)
    ON DELETE CASCADE,
  CONSTRAINT academy_community_challenge_principal_binding_fk
    FOREIGN KEY (tenant_id, workspace_id, principal_type, principal_id)
    REFERENCES platform_principal_bindings
      (tenant_id, workspace_id, principal_type, principal_id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT academy_community_challenge_identity_unique
    UNIQUE (
      tenant_id,
      workspace_id,
      principal_type,
      principal_id,
      challenge_id,
      challenge_version,
      cycle_key
    )
);

CREATE INDEX IF NOT EXISTS academy_community_challenge_current_idx
  ON academy_community_challenge_enrollments
    (tenant_id, workspace_id, principal_type, principal_id, cycle_ends_at DESC);

CREATE TABLE IF NOT EXISTS academy_community_challenge_events (
  id UUID PRIMARY KEY,
  enrollment_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT academy_community_challenge_event_type_check
    CHECK (event_type IN ('joined', 'evaluated', 'completed')),
  CONSTRAINT academy_community_challenge_event_key_check
    CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,120}$'),
  CONSTRAINT academy_community_challenge_event_hash_check
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT academy_community_challenge_event_evidence_check
    CHECK (jsonb_typeof(evidence) = 'object'),
  CONSTRAINT academy_community_challenge_event_enrollment_fk
    FOREIGN KEY (enrollment_id)
    REFERENCES academy_community_challenge_enrollments(id)
    ON DELETE RESTRICT,
  CONSTRAINT academy_community_challenge_event_command_unique
    UNIQUE (enrollment_id, event_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS academy_community_challenge_events_enrollment_idx
  ON academy_community_challenge_events (enrollment_id, created_at ASC);

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

  authority_changed :=
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.evaluated_at IS DISTINCT FROM OLD.evaluated_at
    OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
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

DROP TRIGGER IF EXISTS academy_community_challenge_enrollment_guard
  ON academy_community_challenge_enrollments;
CREATE TRIGGER academy_community_challenge_enrollment_guard
BEFORE UPDATE ON academy_community_challenge_enrollments
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_community_challenge_enrollment();

CREATE OR REPLACE FUNCTION tecpey_reject_community_challenge_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'community challenge events are append-only'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_community_challenge_events_append_only_update
  ON academy_community_challenge_events;
CREATE TRIGGER academy_community_challenge_events_append_only_update
BEFORE UPDATE ON academy_community_challenge_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_community_challenge_event_mutation();

DROP TRIGGER IF EXISTS academy_community_challenge_events_append_only_delete
  ON academy_community_challenge_events;
CREATE TRIGGER academy_community_challenge_events_append_only_delete
BEFORE DELETE ON academy_community_challenge_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_community_challenge_event_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runCommunityJournalChallengeMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(COMMUNITY_JOURNAL_CHALLENGE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-community-journal-challenge] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(COMMUNITY_JOURNAL_CHALLENGE_SQL);
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
