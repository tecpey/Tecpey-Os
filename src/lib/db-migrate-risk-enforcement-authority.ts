import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0045_risk_enforcement_authority.sql";

export const RISK_ENFORCEMENT_AUTHORITY_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS risk_authority_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'tecpey',
  principal_id TEXT NOT NULL CHECK (char_length(principal_id) BETWEEN 1 AND 300),
  principal_fingerprint TEXT NOT NULL CHECK (
    principal_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  event_key TEXT NOT NULL CHECK (event_key ~ '^[0-9a-f]{64}$'),
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'order_frequency_high', 'order_burst', 'ip_switch_detected',
      'duplicate_request', 'suspicious_api_behavior'
    )
  ),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  market TEXT CHECK (market IS NULL OR char_length(market) BETWEEN 2 AND 40),
  policy_version TEXT NOT NULL CHECK (char_length(policy_version) BETWEEN 3 AND 80),
  desired_level TEXT CHECK (
    desired_level IS NULL OR desired_level IN (
      'review', 'trade_blocked', 'withdraw_blocked', 'all_blocked'
    )
  ),
  desired_expires_at TIMESTAMPTZ,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  detector_facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, event_key),
  CHECK (
    (desired_level IS NULL AND desired_expires_at IS NULL)
    OR (desired_level IS NOT NULL AND desired_expires_at IS NOT NULL)
  ),
  CHECK (NOT tecpey_sensitive_audit_has_forbidden_key(detector_facts)),
  CHECK (octet_length(detector_facts::text) <= 8192)
);

CREATE INDEX IF NOT EXISTS risk_authority_events_principal_idx
  ON risk_authority_events (tenant_id, principal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS risk_effective_enforcements (
  tenant_id TEXT NOT NULL DEFAULT 'tecpey',
  principal_id TEXT NOT NULL CHECK (char_length(principal_id) BETWEEN 1 AND 300),
  principal_fingerprint TEXT NOT NULL CHECK (
    principal_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  level TEXT NOT NULL CHECK (
    level IN ('none', 'review', 'trade_blocked', 'withdraw_blocked', 'all_blocked')
  ),
  generation BIGINT NOT NULL CHECK (generation > 0),
  source_event_id UUID REFERENCES risk_authority_events(id) ON DELETE RESTRICT,
  policy_version TEXT NOT NULL CHECK (char_length(policy_version) BETWEEN 3 AND 80),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, principal_id),
  CHECK (
    (level = 'none' AND expires_at IS NULL)
    OR (level <> 'none' AND expires_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS risk_effective_enforcements_expiry_idx
  ON risk_effective_enforcements (expires_at)
  WHERE level <> 'none';

CREATE TABLE IF NOT EXISTS risk_enforcement_outbox (
  tenant_id TEXT NOT NULL DEFAULT 'tecpey',
  principal_id TEXT NOT NULL CHECK (char_length(principal_id) BETWEEN 1 AND 300),
  principal_fingerprint TEXT NOT NULL CHECK (
    principal_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  generation BIGINT NOT NULL CHECK (generation > 0),
  level TEXT NOT NULL CHECK (
    level IN ('none', 'review', 'trade_blocked', 'withdraw_blocked', 'all_blocked')
  ),
  expires_at TIMESTAMPTZ,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (
    state IN ('pending', 'published', 'dead_letter', 'completed')
  ),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error_category TEXT CHECK (
    last_error_category IS NULL OR last_error_category IN (
      'redis_unavailable', 'publication_failed', 'authority_conflict', 'unknown'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, principal_id, generation),
  CHECK (
    (level = 'none' AND expires_at IS NULL)
    OR (level <> 'none' AND expires_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS risk_enforcement_outbox_due_idx
  ON risk_enforcement_outbox (available_at, created_at)
  WHERE state IN ('pending', 'dead_letter');

CREATE OR REPLACE FUNCTION tecpey_guard_risk_authority_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'risk authority event rows are append-preserved';
END;
$$;

DROP TRIGGER IF EXISTS risk_authority_event_append_guard
  ON risk_authority_events;
CREATE TRIGGER risk_authority_event_append_guard
  BEFORE UPDATE OR DELETE ON risk_authority_events
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_guard_risk_authority_event();

CREATE OR REPLACE FUNCTION tecpey_guard_risk_effective_enforcement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'risk effective enforcement rows cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.generation <> 1 THEN
      RAISE EXCEPTION 'risk effective enforcement must start at generation 1';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.principal_id IS DISTINCT FROM NEW.principal_id
     OR OLD.principal_fingerprint IS DISTINCT FROM NEW.principal_fingerprint
     OR OLD.effective_at IS DISTINCT FROM NEW.effective_at THEN
    RAISE EXCEPTION 'risk effective enforcement identity is immutable';
  END IF;
  IF NEW.generation <> OLD.generation + 1 THEN
    RAISE EXCEPTION 'risk effective enforcement generation must increment exactly once';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS risk_effective_enforcement_guard
  ON risk_effective_enforcements;
CREATE TRIGGER risk_effective_enforcement_guard
  BEFORE INSERT OR UPDATE OR DELETE ON risk_effective_enforcements
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_guard_risk_effective_enforcement();

CREATE OR REPLACE FUNCTION tecpey_guard_risk_enforcement_outbox()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'risk enforcement outbox rows are append-preserved';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'pending' THEN
      RAISE EXCEPTION 'risk enforcement outbox must start pending';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.principal_id IS DISTINCT FROM NEW.principal_id
     OR OLD.principal_fingerprint IS DISTINCT FROM NEW.principal_fingerprint
     OR OLD.generation IS DISTINCT FROM NEW.generation
     OR OLD.level IS DISTINCT FROM NEW.level
     OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'risk enforcement outbox identity is immutable';
  END IF;
  IF OLD.state = 'completed' THEN
    RAISE EXCEPTION 'completed risk enforcement outbox is immutable';
  END IF;
  IF NOT (
    (OLD.state = 'pending' AND NEW.state IN ('published', 'dead_letter', 'completed'))
    OR (OLD.state = 'dead_letter' AND NEW.state IN ('published', 'dead_letter', 'completed'))
    OR (OLD.state = 'published' AND NEW.state = 'completed')
  ) THEN
    RAISE EXCEPTION 'invalid risk enforcement outbox transition % -> %', OLD.state, NEW.state;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS risk_enforcement_outbox_guard
  ON risk_enforcement_outbox;
CREATE TRIGGER risk_enforcement_outbox_guard
  BEFORE INSERT OR UPDATE OR DELETE ON risk_enforcement_outbox
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_guard_risk_enforcement_outbox();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runRiskEnforcementAuthorityMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(RISK_ENFORCEMENT_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-risk-enforcement-authority] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-risk-enforcement-authority] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(RISK_ENFORCEMENT_AUTHORITY_SQL);
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
