import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0051_community_reputation_evidence.sql";
const BACKFILL_VERSION = "community-reputation-evidence-backfill-v3";

export const COMMUNITY_REPUTATION_EVIDENCE_SQL = `
CREATE OR REPLACE FUNCTION tecpey_community_reputation_coverage_bps(
  eligible_count INTEGER,
  reflection_count INTEGER
)
RETURNS INTEGER AS $$
BEGIN
  IF eligible_count = 0 THEN
    RETURN 0;
  END IF;
  RETURN (
    (reflection_count::bigint * 10000 + eligible_count::bigint / 2)
    / eligible_count::bigint
  )::integer;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

CREATE OR REPLACE FUNCTION tecpey_community_reputation_source_digest(
  p_tenant_id TEXT,
  p_workspace_id TEXT,
  p_principal_type TEXT,
  p_principal_id TEXT,
  p_student_id UUID,
  p_source_enrollment_id UUID,
  p_challenge_id TEXT,
  p_challenge_version TEXT,
  p_cycle_key TEXT,
  p_cycle_starts_at TIMESTAMPTZ,
  p_cycle_ends_at TIMESTAMPTZ,
  p_outcome TEXT,
  p_finalized_at TIMESTAMPTZ,
  p_eligible_count INTEGER,
  p_reflection_count INTEGER,
  p_coverage_bps INTEGER,
  p_completion_met BOOLEAN,
  p_finalization_source TEXT,
  p_finalization_run_id UUID
)
RETURNS TEXT AS $$
  SELECT encode(
    sha256(
      convert_to(
        concat_ws(
          E'\\n',
          'community-reputation-evidence-v1',
          'official_journal_challenge_finalization',
          p_tenant_id,
          p_workspace_id,
          p_principal_type,
          p_principal_id,
          p_student_id::text,
          p_source_enrollment_id::text,
          p_challenge_id,
          p_challenge_version,
          p_cycle_key,
          to_char(p_cycle_starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          to_char(p_cycle_ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          p_outcome,
          to_char(p_finalized_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          p_eligible_count::text,
          p_reflection_count::text,
          p_coverage_bps::text,
          CASE WHEN p_completion_met THEN 'true' ELSE 'false' END,
          p_finalization_source,
          COALESCE(p_finalization_run_id::text, '')
        ),
        'UTF8'
      )
    ),
    'hex'
  );
$$ LANGUAGE sql IMMUTABLE;

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
      AND coverage_basis_points = tecpey_community_reputation_coverage_bps(
        eligible_closed_trade_count,
        valid_reflection_count
      )
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
  expected_digest TEXT;
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

  expected_coverage := tecpey_community_reputation_coverage_bps(
    source.eligible_closed_trade_count,
    source.valid_reflection_count
  );
  expected_completion := (
    source.eligible_closed_trade_count >= 3
    AND source.valid_reflection_count * 5 >= source.eligible_closed_trade_count * 4
  );
  expected_digest := tecpey_community_reputation_source_digest(
    source.tenant_id,
    source.workspace_id,
    source.principal_type,
    source.principal_id,
    source.student_id,
    source.id,
    source.challenge_id,
    source.challenge_version,
    source.cycle_key,
    source.cycle_starts_at,
    source.cycle_ends_at,
    source.status,
    source.finalized_at,
    source.eligible_closed_trade_count,
    source.valid_reflection_count,
    expected_coverage,
    expected_completion,
    source.finalization_source,
    source.finalization_run_id
  );

  IF NEW.id IS DISTINCT FROM source.id
     OR NEW.tenant_id IS DISTINCT FROM source.tenant_id
     OR NEW.workspace_id IS DISTINCT FROM source.workspace_id
     OR NEW.principal_type IS DISTINCT FROM source.principal_type
     OR NEW.principal_id IS DISTINCT FROM source.principal_id
     OR NEW.student_id IS DISTINCT FROM source.student_id
     OR NEW.evidence_version IS DISTINCT FROM 'community-reputation-evidence-v1'
     OR NEW.source_type IS DISTINCT FROM 'official_journal_challenge_finalization'
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
     OR NEW.finalization_run_id IS DISTINCT FROM source.finalization_run_id
     OR NEW.source_digest IS DISTINCT FROM expected_digest THEN
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

CREATE OR REPLACE FUNCTION tecpey_materialize_community_reputation_evidence()
RETURNS TRIGGER AS $$
DECLARE
  binding_active BOOLEAN;
  expected_coverage INTEGER;
  expected_completion BOOLEAN;
  expected_digest TEXT;
  materialized academy_community_reputation_evidence%ROWTYPE;
BEGIN
  IF NEW.status NOT IN ('completed', 'not_completed') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM platform_principal_bindings AS binding
     WHERE binding.tenant_id = NEW.tenant_id
       AND binding.workspace_id = NEW.workspace_id
       AND binding.principal_type = NEW.principal_type
       AND binding.principal_id = NEW.principal_id
       AND binding.status = 'active'
  ) INTO binding_active;

  IF NOT binding_active THEN
    RAISE EXCEPTION 'community reputation finalization binding inactive'
      USING ERRCODE = '55000';
  END IF;

  expected_coverage := tecpey_community_reputation_coverage_bps(
    NEW.eligible_closed_trade_count,
    NEW.valid_reflection_count
  );
  expected_completion := (
    NEW.eligible_closed_trade_count >= 3
    AND NEW.valid_reflection_count * 5 >= NEW.eligible_closed_trade_count * 4
  );
  expected_digest := tecpey_community_reputation_source_digest(
    NEW.tenant_id,
    NEW.workspace_id,
    NEW.principal_type,
    NEW.principal_id,
    NEW.student_id,
    NEW.id,
    NEW.challenge_id,
    NEW.challenge_version,
    NEW.cycle_key,
    NEW.cycle_starts_at,
    NEW.cycle_ends_at,
    NEW.status,
    NEW.finalized_at,
    NEW.eligible_closed_trade_count,
    NEW.valid_reflection_count,
    expected_coverage,
    expected_completion,
    NEW.finalization_source,
    NEW.finalization_run_id
  );

  INSERT INTO academy_community_reputation_evidence
    (id, tenant_id, workspace_id, principal_type, principal_id, student_id,
     evidence_version, source_type, source_enrollment_id,
     challenge_id, challenge_version, cycle_key, cycle_starts_at, cycle_ends_at,
     outcome, finalized_at, eligible_closed_trade_count, valid_reflection_count,
     coverage_basis_points, completion_criteria_met, finalization_source,
     finalization_run_id, source_digest)
  VALUES
    (NEW.id, NEW.tenant_id, NEW.workspace_id, NEW.principal_type,
     NEW.principal_id, NEW.student_id,
     'community-reputation-evidence-v1',
     'official_journal_challenge_finalization',
     NEW.id,
     NEW.challenge_id, NEW.challenge_version, NEW.cycle_key,
     NEW.cycle_starts_at, NEW.cycle_ends_at,
     NEW.status, NEW.finalized_at,
     NEW.eligible_closed_trade_count, NEW.valid_reflection_count,
     expected_coverage, expected_completion,
     NEW.finalization_source, NEW.finalization_run_id, expected_digest)
  ON CONFLICT (source_enrollment_id) DO NOTHING;

  SELECT evidence.*
    INTO materialized
    FROM academy_community_reputation_evidence AS evidence
   WHERE evidence.source_enrollment_id = NEW.id
   LIMIT 1;

  IF NOT FOUND
     OR materialized.id IS DISTINCT FROM NEW.id
     OR materialized.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR materialized.workspace_id IS DISTINCT FROM NEW.workspace_id
     OR materialized.principal_type IS DISTINCT FROM NEW.principal_type
     OR materialized.principal_id IS DISTINCT FROM NEW.principal_id
     OR materialized.student_id IS DISTINCT FROM NEW.student_id
     OR materialized.evidence_version IS DISTINCT FROM 'community-reputation-evidence-v1'
     OR materialized.source_type IS DISTINCT FROM 'official_journal_challenge_finalization'
     OR materialized.source_enrollment_id IS DISTINCT FROM NEW.id
     OR materialized.challenge_id IS DISTINCT FROM NEW.challenge_id
     OR materialized.challenge_version IS DISTINCT FROM NEW.challenge_version
     OR materialized.cycle_key IS DISTINCT FROM NEW.cycle_key
     OR materialized.cycle_starts_at IS DISTINCT FROM NEW.cycle_starts_at
     OR materialized.cycle_ends_at IS DISTINCT FROM NEW.cycle_ends_at
     OR materialized.outcome IS DISTINCT FROM NEW.status
     OR materialized.finalized_at IS DISTINCT FROM NEW.finalized_at
     OR materialized.eligible_closed_trade_count IS DISTINCT FROM NEW.eligible_closed_trade_count
     OR materialized.valid_reflection_count IS DISTINCT FROM NEW.valid_reflection_count
     OR materialized.coverage_basis_points IS DISTINCT FROM expected_coverage
     OR materialized.completion_criteria_met IS DISTINCT FROM expected_completion
     OR materialized.finalization_source IS DISTINCT FROM NEW.finalization_source
     OR materialized.finalization_run_id IS DISTINCT FROM NEW.finalization_run_id
     OR materialized.source_digest IS DISTINCT FROM expected_digest THEN
    RAISE EXCEPTION 'community reputation materialization conflict'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_community_challenge_reputation_materialization_insert
  ON academy_community_challenge_enrollments;
CREATE TRIGGER academy_community_challenge_reputation_materialization_insert
AFTER INSERT ON academy_community_challenge_enrollments
FOR EACH ROW
WHEN (NEW.status IN ('completed', 'not_completed'))
EXECUTE FUNCTION tecpey_materialize_community_reputation_evidence();

DROP TRIGGER IF EXISTS academy_community_challenge_reputation_materialization
  ON academy_community_challenge_enrollments;
CREATE TRIGGER academy_community_challenge_reputation_materialization
AFTER UPDATE ON academy_community_challenge_enrollments
FOR EACH ROW
WHEN (
  NEW.status IN ('completed', 'not_completed')
  AND OLD.status IS DISTINCT FROM NEW.status
)
EXECUTE FUNCTION tecpey_materialize_community_reputation_evidence();

INSERT INTO academy_community_reputation_evidence
  (id, tenant_id, workspace_id, principal_type, principal_id, student_id,
   evidence_version, source_type, source_enrollment_id,
   challenge_id, challenge_version, cycle_key, cycle_starts_at, cycle_ends_at,
   outcome, finalized_at, eligible_closed_trade_count, valid_reflection_count,
   coverage_basis_points, completion_criteria_met, finalization_source,
   finalization_run_id, source_digest)
SELECT
  enrollment.id,
  enrollment.tenant_id,
  enrollment.workspace_id,
  enrollment.principal_type,
  enrollment.principal_id,
  enrollment.student_id,
  'community-reputation-evidence-v1',
  'official_journal_challenge_finalization',
  enrollment.id,
  enrollment.challenge_id,
  enrollment.challenge_version,
  enrollment.cycle_key,
  enrollment.cycle_starts_at,
  enrollment.cycle_ends_at,
  enrollment.status,
  enrollment.finalized_at,
  enrollment.eligible_closed_trade_count,
  enrollment.valid_reflection_count,
  tecpey_community_reputation_coverage_bps(
    enrollment.eligible_closed_trade_count,
    enrollment.valid_reflection_count
  ),
  (
    enrollment.eligible_closed_trade_count >= 3
    AND enrollment.valid_reflection_count * 5 >= enrollment.eligible_closed_trade_count * 4
  ),
  enrollment.finalization_source,
  enrollment.finalization_run_id,
  tecpey_community_reputation_source_digest(
    enrollment.tenant_id,
    enrollment.workspace_id,
    enrollment.principal_type,
    enrollment.principal_id,
    enrollment.student_id,
    enrollment.id,
    enrollment.challenge_id,
    enrollment.challenge_version,
    enrollment.cycle_key,
    enrollment.cycle_starts_at,
    enrollment.cycle_ends_at,
    enrollment.status,
    enrollment.finalized_at,
    enrollment.eligible_closed_trade_count,
    enrollment.valid_reflection_count,
    tecpey_community_reputation_coverage_bps(
      enrollment.eligible_closed_trade_count,
      enrollment.valid_reflection_count
    ),
    (
      enrollment.eligible_closed_trade_count >= 3
      AND enrollment.valid_reflection_count * 5 >= enrollment.eligible_closed_trade_count * 4
    ),
    enrollment.finalization_source,
    enrollment.finalization_run_id
  )
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
ON CONFLICT (source_enrollment_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM academy_community_challenge_enrollments AS enrollment
      JOIN platform_principal_bindings AS binding
        ON binding.tenant_id = enrollment.tenant_id
       AND binding.workspace_id = enrollment.workspace_id
       AND binding.principal_type = enrollment.principal_type
       AND binding.principal_id = enrollment.principal_id
       AND binding.status = 'active'
      LEFT JOIN academy_community_reputation_evidence AS evidence
        ON evidence.source_enrollment_id = enrollment.id
     WHERE enrollment.challenge_id = 'journal-reflection-week'
       AND enrollment.challenge_version = 'journal-reflection-v1'
       AND enrollment.status IN ('completed', 'not_completed')
       AND (
         evidence.id IS NULL
         OR evidence.id IS DISTINCT FROM enrollment.id
         OR evidence.tenant_id IS DISTINCT FROM enrollment.tenant_id
         OR evidence.workspace_id IS DISTINCT FROM enrollment.workspace_id
         OR evidence.principal_type IS DISTINCT FROM enrollment.principal_type
         OR evidence.principal_id IS DISTINCT FROM enrollment.principal_id
         OR evidence.student_id IS DISTINCT FROM enrollment.student_id
         OR evidence.evidence_version IS DISTINCT FROM 'community-reputation-evidence-v1'
         OR evidence.source_type IS DISTINCT FROM 'official_journal_challenge_finalization'
         OR evidence.challenge_id IS DISTINCT FROM enrollment.challenge_id
         OR evidence.challenge_version IS DISTINCT FROM enrollment.challenge_version
         OR evidence.cycle_key IS DISTINCT FROM enrollment.cycle_key
         OR evidence.cycle_starts_at IS DISTINCT FROM enrollment.cycle_starts_at
         OR evidence.cycle_ends_at IS DISTINCT FROM enrollment.cycle_ends_at
         OR evidence.outcome IS DISTINCT FROM enrollment.status
         OR evidence.finalized_at IS DISTINCT FROM enrollment.finalized_at
         OR evidence.eligible_closed_trade_count IS DISTINCT FROM enrollment.eligible_closed_trade_count
         OR evidence.valid_reflection_count IS DISTINCT FROM enrollment.valid_reflection_count
         OR evidence.coverage_basis_points IS DISTINCT FROM tecpey_community_reputation_coverage_bps(
           enrollment.eligible_closed_trade_count,
           enrollment.valid_reflection_count
         )
         OR evidence.completion_criteria_met IS DISTINCT FROM (
           enrollment.eligible_closed_trade_count >= 3
           AND enrollment.valid_reflection_count * 5 >= enrollment.eligible_closed_trade_count * 4
         )
         OR evidence.finalization_source IS DISTINCT FROM enrollment.finalization_source
         OR evidence.finalization_run_id IS DISTINCT FROM enrollment.finalization_run_id
         OR evidence.source_digest IS DISTINCT FROM tecpey_community_reputation_source_digest(
           enrollment.tenant_id,
           enrollment.workspace_id,
           enrollment.principal_type,
           enrollment.principal_id,
           enrollment.student_id,
           enrollment.id,
           enrollment.challenge_id,
           enrollment.challenge_version,
           enrollment.cycle_key,
           enrollment.cycle_starts_at,
           enrollment.cycle_ends_at,
           enrollment.status,
           enrollment.finalized_at,
           enrollment.eligible_closed_trade_count,
           enrollment.valid_reflection_count,
           tecpey_community_reputation_coverage_bps(
             enrollment.eligible_closed_trade_count,
             enrollment.valid_reflection_count
           ),
           (
             enrollment.eligible_closed_trade_count >= 3
             AND enrollment.valid_reflection_count * 5 >= enrollment.eligible_closed_trade_count * 4
           ),
           enrollment.finalization_source,
           enrollment.finalization_run_id
         )
       )
  ) THEN
    RAISE EXCEPTION 'community reputation evidence backfill mismatch'
      USING ERRCODE = '55000';
  END IF;
END;
$$;
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
