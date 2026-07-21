import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0050_operational_job_evidence.sql";

export const OPERATIONAL_JOB_EVIDENCE_SQL = `
CREATE TABLE IF NOT EXISTS platform_operational_job_runs (
  run_id UUID PRIMARY KEY,
  job_name TEXT NOT NULL,
  scheduler_unit TEXT NOT NULL,
  host_name TEXT NOT NULL,
  result_status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  batches_processed INTEGER NOT NULL,
  selected_count INTEGER NOT NULL,
  finalized_completed_count INTEGER NOT NULL,
  finalized_not_completed_count INTEGER NOT NULL,
  failure_count INTEGER NOT NULL,
  drain_limit_reached BOOLEAN NOT NULL DEFAULT FALSE,
  result_hash TEXT NOT NULL,
  summary JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_operational_job_name_check
    CHECK (job_name ~ '^[a-z0-9][a-z0-9._:-]{2,99}$'),
  CONSTRAINT platform_operational_scheduler_unit_check
    CHECK (scheduler_unit ~ '^[A-Za-z0-9@_.:-]{3,200}\\.service$'),
  CONSTRAINT platform_operational_host_name_check
    CHECK (char_length(host_name) BETWEEN 1 AND 120 AND host_name !~ '[[:cntrl:]]'),
  CONSTRAINT platform_operational_result_status_check
    CHECK (result_status IN ('succeeded', 'partial_failure', 'authority_unavailable')),
  CONSTRAINT platform_operational_time_check
    CHECK (completed_at >= started_at),
  CONSTRAINT platform_operational_counts_check
    CHECK (
      batches_processed >= 0
      AND selected_count >= 0
      AND finalized_completed_count >= 0
      AND finalized_not_completed_count >= 0
      AND failure_count >= 0
      AND finalized_completed_count + finalized_not_completed_count <= selected_count
    ),
  CONSTRAINT platform_operational_result_hash_check
    CHECK (result_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT platform_operational_summary_check
    CHECK (jsonb_typeof(summary) = 'object')
);

CREATE INDEX IF NOT EXISTS platform_operational_job_runs_lookup_idx
  ON platform_operational_job_runs (job_name, completed_at DESC);

CREATE TABLE IF NOT EXISTS platform_operational_alerts (
  alert_id TEXT PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES platform_operational_job_runs(run_id) ON DELETE RESTRICT,
  job_name TEXT NOT NULL,
  scheduler_unit TEXT NOT NULL,
  severity TEXT NOT NULL,
  status_classification TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_operational_alert_id_check
    CHECK (alert_id ~ '^[A-Za-z0-9._:-]{8,220}$'),
  CONSTRAINT platform_operational_alert_job_name_check
    CHECK (job_name ~ '^[a-z0-9][a-z0-9._:-]{2,99}$'),
  CONSTRAINT platform_operational_alert_unit_check
    CHECK (scheduler_unit ~ '^[A-Za-z0-9@_.:-]{3,200}\\.service$'),
  CONSTRAINT platform_operational_alert_severity_check
    CHECK (severity IN ('warning', 'critical')),
  CONSTRAINT platform_operational_alert_status_check
    CHECK (status_classification IN ('partial_failure', 'authority_unavailable')),
  CONSTRAINT platform_operational_alert_payload_hash_check
    CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT platform_operational_alert_payload_check
    CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS platform_operational_alerts_lookup_idx
  ON platform_operational_alerts (occurred_at DESC, severity);

CREATE TABLE IF NOT EXISTS platform_operational_alert_delivery_attempts (
  alert_id TEXT NOT NULL REFERENCES platform_operational_alerts(alert_id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL,
  delivery_result TEXT NOT NULL,
  http_status INTEGER,
  error_code TEXT,
  attempted_at TIMESTAMPTZ NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (alert_id, attempt_number),
  CONSTRAINT platform_operational_alert_attempt_number_check
    CHECK (attempt_number BETWEEN 1 AND 100),
  CONSTRAINT platform_operational_alert_delivery_result_check
    CHECK (delivery_result IN ('delivered', 'retryable_failure', 'terminal_failure')),
  CONSTRAINT platform_operational_alert_http_status_check
    CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  CONSTRAINT platform_operational_alert_error_code_check
    CHECK (error_code IS NULL OR (char_length(error_code) BETWEEN 1 AND 100 AND error_code ~ '^[a-z0-9._:-]+$')),
  CONSTRAINT platform_operational_alert_attempt_evidence_check
    CHECK (jsonb_typeof(evidence) = 'object')
);

CREATE OR REPLACE FUNCTION tecpey_reject_operational_evidence_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'operational evidence is append-only'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS platform_operational_job_runs_immutable
  ON platform_operational_job_runs;
CREATE TRIGGER platform_operational_job_runs_immutable
BEFORE UPDATE OR DELETE ON platform_operational_job_runs
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_operational_evidence_mutation();

DROP TRIGGER IF EXISTS platform_operational_alerts_immutable
  ON platform_operational_alerts;
CREATE TRIGGER platform_operational_alerts_immutable
BEFORE UPDATE OR DELETE ON platform_operational_alerts
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_operational_evidence_mutation();

DROP TRIGGER IF EXISTS platform_operational_alert_delivery_attempts_immutable
  ON platform_operational_alert_delivery_attempts;
CREATE TRIGGER platform_operational_alert_delivery_attempts_immutable
BEFORE UPDATE OR DELETE ON platform_operational_alert_delivery_attempts
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_operational_evidence_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runOperationalJobEvidenceMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(OPERATIONAL_JOB_EVIDENCE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-operational-job-evidence] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(OPERATIONAL_JOB_EVIDENCE_SQL);
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
