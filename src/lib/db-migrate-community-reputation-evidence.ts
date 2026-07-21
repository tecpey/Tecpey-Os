import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  materializeCommunityReputationEvidenceTx,
} from "@/lib/community-reputation-evidence-authority";
import type { OfficialJournalChallengeEnrollmentRow } from "@/lib/community-journal-challenge-authority";

const FILENAME = "0051_community_reputation_evidence.sql";
const BACKFILL_VERSION = "community-reputation-evidence-backfill-v1";

export const COMMUNITY_REPUTATION_EVIDENCE_SQL = `
CREATE TABLE IF NOT EXISTS academy_community_reputation_evidence (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  student_id UUID NOT NULL,
  evidence_version TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_enrollment_id UUID NOT NULL,
  challenge_id TEXT NOT NULL,
  challenge_version TEXT NOT NULL,
  cycle_key TEXT NOT NULL,
  cycle_starts_at TIMESTAMPTZ NOT NULL,
  cycle_ends_at TIMESTAMPTZ NOT NULL,
  outcome TEXT NOT NULL,
  finalized_at TIMESTAMPTZ NOT NULL,
  eligible_closed_trade_count INTEGER NOT NULL,
  valid_reflection_count INTEGER NOT NULL,
  coverage_basis_points INTEGER NOT NULL,
  completion_criteria_met BOOLEAN NOT NULL,
  finalization_source TEXT NOT NULL,
  finalization_run_id UUID,
  source_digest TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT academy_community_reputation_principal_type_check
    CHECK (principal_type = 'student'),
  CONSTRAINT academy_community_reputation_principal_identity_check
    CHECK (principal_id = student_id::text),
  CONSTRAINT academy_community_reputation_version_check
    CHECK (evidence_version = 'community-reputation-evidence-v1'),
  CONSTRAINT academy_community_reputation_source_type_check
    CHECK (source_type = 'official_journal_challenge_finalization'),
  CONSTRAINT academy_community_reputation_challenge_id_check
    CHECK (challenge_id = 'journal-reflection-week'),
  CONSTRAINT academy_community_reputation_challenge_version_check
    CHECK (challenge_version = 'journal-reflection-v1'),
  CONSTRAINT academy_community_reputation_cycle_key_check
    CHECK (cycle_key ~ '^[0-9]{4}-W[0-9]{2}$'),
  CONSTRAINT academy_community_reputation_cycle_window_check
    CHECK (cycle_ends_at > cycle_starts_at),
  CONSTRAINT academy_community_reputation_outcome_check
    CHECK (outcome IN ('completed', 'not_completed')),
  CONSTRAINT academy_community_reputation_counts_check
    CHECK (
      eligible_closed_trade_count BETWEEN 0 AND 1000000
      AND valid_reflection_count BETWEEN 0 AND eligible_closed_trade_count
    ),
  CONSTRAINT academy_community_reputation_coverage_check
    CHECK (
      coverage_basis_points BETWEEN 0 AND 10000
      AND coverage_basis_points = CASE
        WHEN eligible_closed_trade_count = 0 THEN 0
        ELSE (
          (valid_reflection_count::bigint * 10000 + eligible_closed_trade_count::bigint / 2)
          / eligible_closed_trade_count::bigint
        )::integer
      END
    ),
  CONSTRAINT academy_community_reputation_completion_check
    CHECK (
      completion_criteria_met = (
        eligible_closed_trade_count >= 3
        AND valid_reflection_count * 5 >= eligible_closed_trade_count * 4
      )
      AND (outcome = 'completed') = completion_criteria_met
    ),
  CONSTRAINT academy_community_reputation_finalization_check
    CHECK (
      (finalization_source = 'interactive' AND finalization_run_id IS NULL)
      OR
      (finalization_source = 'worker' AND finalization_run_id IS NOT NULL)
    ),
  CONSTRAINT academy_community_reputation_digest_check
    CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT academy_community_reputation_recorded_time_check
    CHECK (recorded_at >= finalized_at),
  CONSTRAINT academy_community_reputation_student_fk
    FOREIGN KEY (student_id)
    REFERENCES academy_students(id)
    ON DELETE RESTRICT,
  CONSTRAINT academy_community_reputation_binding_fk
    FOREIGN KEY (tenant_id, workspace_id, principal_type, principal_id)
    REFERENCES platform_principal_bindings
      (tenant_id, workspace_id, principal_type, principal_id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT academy_community_reputation_source_enrollment_fk
    FOREIGN KEY (source_enrollment_id)
    REFERENCES academy_community_challenge_enrollments(id)
    ON DELETE RESTRICT,
  CONSTRAINT academy_community_reputation_source_unique
    UNIQUE (source_enrollment_id)
);

CREATE INDEX IF NOT EXISTS academy_community_reputation_owner_timeline_idx
  ON academy_community_reputation_evidence
    (tenant_id, workspace_id, principal_type, principal_id, finalized_at DESC, id DESC);

CREATE OR REPLACE FUNCTION tecpey_validate_community_reputation_evidence_insert()
RETURNS TRIGGER AS $$
DECLARE
  source academy_community_challenge_enrollments%ROWTYPE;
  binding_active BOOLEAN;
  expected_coverage INTEGER;
  expected_completion BOOLEAN;
BEGIN
  SELECT enrollment.*
    INTO source
    FROM academy_community_challenge_enrollments AS enrollment
   WHERE enrollment.id = NEW.source_enrollment_id
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'community reputation source enrollment missing'
      USING ERRCODE = '55000';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM platform_principal_bindings AS binding
     WHERE binding.tenant_id = source.tenant_id
       AND binding.workspace_id = source.workspace_id
       AND binding.principal_type = source.principal_type
       AND binding.principal_id = source.principal_id
       AND binding.status = 'active'
  ) INTO binding_active;

  IF NOT binding_active THEN
    RAISE EXCEPTION 'community reputation principal binding inactive'
      USING ERRCODE = '55000';
  END IF;

  IF source.status NOT IN ('completed', 'not_completed')
     OR source.finalized_at IS NULL
     OR source.finalization_source IS NULL THEN
    RAISE EXCEPTION 'community reputation source is not terminal'
      USING ERRCODE = '55000';
  END IF;

  expected_coverage := CASE
    WHEN source.eligible_closed_trade_count = 0 THEN 0
    ELSE (
      (source.valid_reflection_count::bigint * 10000 + source.eligible_closed_trade_count::bigint / 2)
      / source.eligible_closed_trade_count::bigint
    )::integer
  END;
  expected_completion := (
    source.eligible_closed_trade_count >= 3
    AND source.valid_reflection_count * 5 >= source.eligible_closed_trade_count * 4
  );

  IF NEW.tenant_id IS DISTINCT FROM source.tenant_id
     OR NEW.workspace_id IS DISTINCT FROM source.workspace_id
     OR NEW.principal_type IS DISTINCT FROM source.principal_type
     OR NEW.principal_id IS DISTINCT FROM source.principal_id
     OR NEW.student_id IS DISTINCT FROM source.student_id
     OR NEW.challenge_id IS DISTINCT FROM source.challenge_id
     OR NEW.challenge_version IS DISTINCT FROM source.challenge_version
     OR NEW.cycle_key IS DISTINCT FROM source.cycle_key
     OR NEW.cycle_starts_at IS DISTINCT FROM source.cycle_starts_at
     OR NEW.cycle_ends_at IS DISTINCT FROM source.cycle_ends_at
     OR NEW.outcome IS DISTINCT FROM source.status
     OR NEW.finalized_at IS DISTINCT FROM source.finalized_at
     OR NEW.eligible_closed_trade_count IS DISTINCT FROM source.eligible_closed_trade_count
     OR NEW.valid_reflection_count IS DISTINCT FROM source.valid_reflection_count
     OR NEW.coverage_basis_points IS DISTINCT FROM expected_coverage
     OR NEW.completion_criteria_met IS DISTINCT FROM expected_completion
     OR NEW.finalization_source IS DISTINCT FROM source.finalization_source
     OR NEW.finalization_run_id IS DISTINCT FROM source.finalization_run_id THEN
    RAISE EXCEPTION 'community reputation evidence does not match terminal source'
      USING ERRCODE = '55000';
  END IF;

  IF (source.status = 'completed') IS DISTINCT FROM expected_completion THEN
    RAISE EXCEPTION 'community reputation terminal source criteria mismatch'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_community_reputation_validate_insert
  ON academy_community_reputation_evidence;
CREATE TRIGGER academy_community_reputation_validate_insert
BEFORE INSERT ON academy_community_reputation_evidence
FOR EACH ROW EXECUTE FUNCTION tecpey_validate_community_reputation_evidence_insert();

CREATE OR REPLACE FUNCTION tecpey_reject_community_reputation_evidence_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'community reputation evidence is append-only'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_community_reputation_append_only_update
  ON academy_community_reputation_evidence;
CREATE TRIGGER academy_community_reputation_append_only_update
BEFORE UPDATE ON academy_community_reputation_evidence
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_community_reputation_evidence_mutation();

DROP TRIGGER IF EXISTS academy_community_reputation_append_only_delete
  ON academy_community_reputation_evidence;
CREATE TRIGGER academy_community_reputation_append_only_delete
BEFORE DELETE ON academy_community_reputation_evidence
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_community_reputation_evidence_mutation();
`;

const BACKFILL_ENROLLMENT_SELECT = `
  enrollment.id::text,
  enrollment.tenant_id,
  enrollment.workspace_id,
  enrollment.principal_type,
  enrollment.principal_id,
  enrollment.student_id::text,
  enrollment.challenge_id,
  enrollment.challenge_version,
  enrollment.cycle_key,
  enrollment.cycle_starts_at,
  enrollment.cycle_ends_at,
  enrollment.status,
  enrollment.revision::text,
  enrollment.started_at,
  enrollment.evaluated_at,
  enrollment.completed_at,
  enrollment.finalized_at,
  enrollment.finalization_source,
  enrollment.finalization_run_id::text,
  enrollment.eligible_closed_trade_count,
  enrollment.valid_reflection_count,
  enrollment.coverage_rate::text
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(`${sql.replace(/\s+/g, " ").trim()}\n${BACKFILL_VERSION}`)
    .digest("hex")
    .slice(0, 16);
}

export async function runCommunityReputationEvidenceMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(COMMUNITY_REPUTATION_EVIDENCE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-community-reputation-evidence] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(COMMUNITY_REPUTATION_EVIDENCE_SQL);
    const terminal = await client.query<OfficialJournalChallengeEnrollmentRow>(
      `SELECT ${BACKFILL_ENROLLMENT_SELECT}
         FROM academy_community_challenge_enrollments AS enrollment
         JOIN platform_principal_bindings AS binding
           ON binding.tenant_id = enrollment.tenant_id
          AND binding.workspace_id = enrollment.workspace_id
          AND binding.principal_type = enrollment.principal_type
          AND binding.principal_id = enrollment.principal_id
          AND binding.status = 'active'
        WHERE enrollment.challenge_id = 'journal-reflection-week'
          AND enrollment.challenge_version = 'journal-reflection-v1'
          AND enrollment.status IN ('completed', 'not_completed')
        ORDER BY enrollment.finalized_at ASC, enrollment.id ASC
        FOR SHARE OF enrollment`,
    );
    for (const enrollment of terminal.rows) {
      await materializeCommunityReputationEvidenceTx(client, enrollment);
    }
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
