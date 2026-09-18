import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0109_operational_signal_envelope.sql";

export const OPERATIONAL_SIGNAL_ENVELOPE_SQL = `
CREATE TABLE IF NOT EXISTS platform_operational_signals (
  signal_id TEXT PRIMARY KEY,
  signal_type TEXT NOT NULL,
  component TEXT NOT NULL,
  source_unit TEXT NOT NULL,
  severity TEXT NOT NULL,
  lifecycle TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  dedupe_window_start TIMESTAMPTZ NOT NULL,
  dedupe_window_seconds INTEGER NOT NULL,
  incident_key CHAR(64) NOT NULL,
  incident_id CHAR(64) NOT NULL,
  condition_fingerprint CHAR(64) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_operational_signal_id_check
    CHECK (signal_id ~ '^[A-Za-z0-9._:-]{8,220}$'),
  CONSTRAINT platform_operational_signal_type_check
    CHECK (signal_type ~ '^[a-z0-9][a-z0-9._:-]{2,99}$'),
  CONSTRAINT platform_operational_signal_component_check
    CHECK (component ~ '^[a-z0-9][a-z0-9._:-]{2,99}$'),
  CONSTRAINT platform_operational_signal_unit_check
    CHECK (source_unit ~ '^[A-Za-z0-9@_.:-]{3,200}\\.service$'),
  CONSTRAINT platform_operational_signal_severity_check
    CHECK (severity IN ('warning', 'critical')),
  CONSTRAINT platform_operational_signal_lifecycle_check
    CHECK (lifecycle IN ('firing', 'resolved')),
  CONSTRAINT platform_operational_signal_window_check
    CHECK (dedupe_window_seconds BETWEEN 60 AND 86400),
  CONSTRAINT platform_operational_signal_incident_key_check
    CHECK (incident_key ~ '^[0-9a-f]{64}
    CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT platform_operational_signal_payload_check
    CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS platform_operational_signals_component_idx
  ON platform_operational_signals (component, occurred_at DESC);

CREATE INDEX IF NOT EXISTS platform_operational_signals_incident_idx
  ON platform_operational_signals (incident_key, occurred_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS platform_operational_signals_incident_lifecycle_idx
  ON platform_operational_signals (incident_id, lifecycle);

CREATE TABLE IF NOT EXISTS platform_operational_signal_delivery_attempts (
  signal_id TEXT NOT NULL
    REFERENCES platform_operational_signals(signal_id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL,
  delivery_result TEXT NOT NULL,
  http_status INTEGER,
  error_code TEXT,
  attempted_at TIMESTAMPTZ NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (signal_id, attempt_number),
  CONSTRAINT platform_operational_signal_attempt_number_check
    CHECK (attempt_number BETWEEN 1 AND 100),
  CONSTRAINT platform_operational_signal_delivery_result_check
    CHECK (delivery_result IN ('delivered', 'retryable_failure', 'terminal_failure')),
  CONSTRAINT platform_operational_signal_http_status_check
    CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  CONSTRAINT platform_operational_signal_error_code_check
    CHECK (
      error_code IS NULL
      OR (
        char_length(error_code) BETWEEN 1 AND 100
        AND error_code ~ '^[a-z0-9._:-]+$'
      )
    ),
  CONSTRAINT platform_operational_signal_attempt_evidence_check
    CHECK (jsonb_typeof(evidence) = 'object')
);

DROP TRIGGER IF EXISTS platform_operational_signals_immutable
  ON platform_operational_signals;
CREATE TRIGGER platform_operational_signals_immutable
BEFORE UPDATE OR DELETE ON platform_operational_signals
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_operational_evidence_mutation();

DROP TRIGGER IF EXISTS platform_operational_signal_delivery_attempts_immutable
  ON platform_operational_signal_delivery_attempts;
CREATE TRIGGER platform_operational_signal_delivery_attempts_immutable
BEFORE UPDATE OR DELETE ON platform_operational_signal_delivery_attempts
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_operational_evidence_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runOperationalSignalEnvelopeMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(OPERATIONAL_SIGNAL_ENVELOPE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-operational-signal-envelope] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(OPERATIONAL_SIGNAL_ENVELOPE_SQL);
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
),
  CONSTRAINT platform_operational_signal_incident_id_check
    CHECK (incident_id ~ '^[0-9a-f]{64}
    CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT platform_operational_signal_payload_check
    CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS platform_operational_signals_component_idx
  ON platform_operational_signals (component, occurred_at DESC);

CREATE INDEX IF NOT EXISTS platform_operational_signals_incident_idx
  ON platform_operational_signals (incident_key, occurred_at DESC);

CREATE TABLE IF NOT EXISTS platform_operational_signal_delivery_attempts (
  signal_id TEXT NOT NULL
    REFERENCES platform_operational_signals(signal_id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL,
  delivery_result TEXT NOT NULL,
  http_status INTEGER,
  error_code TEXT,
  attempted_at TIMESTAMPTZ NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (signal_id, attempt_number),
  CONSTRAINT platform_operational_signal_attempt_number_check
    CHECK (attempt_number BETWEEN 1 AND 100),
  CONSTRAINT platform_operational_signal_delivery_result_check
    CHECK (delivery_result IN ('delivered', 'retryable_failure', 'terminal_failure')),
  CONSTRAINT platform_operational_signal_http_status_check
    CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  CONSTRAINT platform_operational_signal_error_code_check
    CHECK (
      error_code IS NULL
      OR (
        char_length(error_code) BETWEEN 1 AND 100
        AND error_code ~ '^[a-z0-9._:-]+$'
      )
    ),
  CONSTRAINT platform_operational_signal_attempt_evidence_check
    CHECK (jsonb_typeof(evidence) = 'object')
);

DROP TRIGGER IF EXISTS platform_operational_signals_immutable
  ON platform_operational_signals;
CREATE TRIGGER platform_operational_signals_immutable
BEFORE UPDATE OR DELETE ON platform_operational_signals
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_operational_evidence_mutation();

DROP TRIGGER IF EXISTS platform_operational_signal_delivery_attempts_immutable
  ON platform_operational_signal_delivery_attempts;
CREATE TRIGGER platform_operational_signal_delivery_attempts_immutable
BEFORE UPDATE OR DELETE ON platform_operational_signal_delivery_attempts
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_operational_evidence_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runOperationalSignalEnvelopeMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(OPERATIONAL_SIGNAL_ENVELOPE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-operational-signal-envelope] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(OPERATIONAL_SIGNAL_ENVELOPE_SQL);
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
),
  CONSTRAINT platform_operational_signal_condition_fingerprint_check
    CHECK (condition_fingerprint ~ '^[0-9a-f]{64}
    CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT platform_operational_signal_payload_check
    CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS platform_operational_signals_component_idx
  ON platform_operational_signals (component, occurred_at DESC);

CREATE INDEX IF NOT EXISTS platform_operational_signals_incident_idx
  ON platform_operational_signals (incident_key, occurred_at DESC);

CREATE TABLE IF NOT EXISTS platform_operational_signal_delivery_attempts (
  signal_id TEXT NOT NULL
    REFERENCES platform_operational_signals(signal_id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL,
  delivery_result TEXT NOT NULL,
  http_status INTEGER,
  error_code TEXT,
  attempted_at TIMESTAMPTZ NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (signal_id, attempt_number),
  CONSTRAINT platform_operational_signal_attempt_number_check
    CHECK (attempt_number BETWEEN 1 AND 100),
  CONSTRAINT platform_operational_signal_delivery_result_check
    CHECK (delivery_result IN ('delivered', 'retryable_failure', 'terminal_failure')),
  CONSTRAINT platform_operational_signal_http_status_check
    CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  CONSTRAINT platform_operational_signal_error_code_check
    CHECK (
      error_code IS NULL
      OR (
        char_length(error_code) BETWEEN 1 AND 100
        AND error_code ~ '^[a-z0-9._:-]+$'
      )
    ),
  CONSTRAINT platform_operational_signal_attempt_evidence_check
    CHECK (jsonb_typeof(evidence) = 'object')
);

DROP TRIGGER IF EXISTS platform_operational_signals_immutable
  ON platform_operational_signals;
CREATE TRIGGER platform_operational_signals_immutable
BEFORE UPDATE OR DELETE ON platform_operational_signals
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_operational_evidence_mutation();

DROP TRIGGER IF EXISTS platform_operational_signal_delivery_attempts_immutable
  ON platform_operational_signal_delivery_attempts;
CREATE TRIGGER platform_operational_signal_delivery_attempts_immutable
BEFORE UPDATE OR DELETE ON platform_operational_signal_delivery_attempts
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_operational_evidence_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runOperationalSignalEnvelopeMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(OPERATIONAL_SIGNAL_ENVELOPE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-operational-signal-envelope] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(OPERATIONAL_SIGNAL_ENVELOPE_SQL);
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
),
  CONSTRAINT platform_operational_signal_payload_hash_check
    CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT platform_operational_signal_payload_check
    CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS platform_operational_signals_component_idx
  ON platform_operational_signals (component, occurred_at DESC);

CREATE INDEX IF NOT EXISTS platform_operational_signals_incident_idx
  ON platform_operational_signals (incident_key, occurred_at DESC);

CREATE TABLE IF NOT EXISTS platform_operational_signal_delivery_attempts (
  signal_id TEXT NOT NULL
    REFERENCES platform_operational_signals(signal_id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL,
  delivery_result TEXT NOT NULL,
  http_status INTEGER,
  error_code TEXT,
  attempted_at TIMESTAMPTZ NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (signal_id, attempt_number),
  CONSTRAINT platform_operational_signal_attempt_number_check
    CHECK (attempt_number BETWEEN 1 AND 100),
  CONSTRAINT platform_operational_signal_delivery_result_check
    CHECK (delivery_result IN ('delivered', 'retryable_failure', 'terminal_failure')),
  CONSTRAINT platform_operational_signal_http_status_check
    CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  CONSTRAINT platform_operational_signal_error_code_check
    CHECK (
      error_code IS NULL
      OR (
        char_length(error_code) BETWEEN 1 AND 100
        AND error_code ~ '^[a-z0-9._:-]+$'
      )
    ),
  CONSTRAINT platform_operational_signal_attempt_evidence_check
    CHECK (jsonb_typeof(evidence) = 'object')
);

DROP TRIGGER IF EXISTS platform_operational_signals_immutable
  ON platform_operational_signals;
CREATE TRIGGER platform_operational_signals_immutable
BEFORE UPDATE OR DELETE ON platform_operational_signals
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_operational_evidence_mutation();

DROP TRIGGER IF EXISTS platform_operational_signal_delivery_attempts_immutable
  ON platform_operational_signal_delivery_attempts;
CREATE TRIGGER platform_operational_signal_delivery_attempts_immutable
BEFORE UPDATE OR DELETE ON platform_operational_signal_delivery_attempts
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_operational_evidence_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runOperationalSignalEnvelopeMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(OPERATIONAL_SIGNAL_ENVELOPE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-operational-signal-envelope] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(OPERATIONAL_SIGNAL_ENVELOPE_SQL);
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
