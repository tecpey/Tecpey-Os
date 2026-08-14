import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0076_academy_credential_ledger.sql";

export const ACADEMY_CREDENTIAL_LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS academy_credential_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  principal_type TEXT NOT NULL DEFAULT 'student' CHECK (principal_type = 'student'),
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE RESTRICT,
  principal_id TEXT GENERATED ALWAYS AS (student_id::text) STORED,
  credential_key TEXT NOT NULL,
  credential_type TEXT NOT NULL CHECK (credential_type IN (
    'achievement', 'certificate', 'competition_medal', 'league_medal', 'mastery_season'
  )),
  code TEXT NOT NULL,
  title_fa TEXT NOT NULL,
  title_en TEXT NOT NULL,
  description_fa TEXT NOT NULL,
  description_en TEXT NOT NULL,
  icon TEXT NOT NULL,
  issuer TEXT NOT NULL DEFAULT 'TecPey Academy',
  competition_id TEXT,
  season_key TEXT,
  rank INTEGER CHECK (rank IS NULL OR rank > 0),
  points_bps INTEGER CHECK (points_bps IS NULL OR points_bps BETWEEN 0 AND 10000),
  policy_version TEXT NOT NULL,
  evidence_sha256 CHAR(64) NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id, principal_type, principal_id)
    REFERENCES platform_principal_bindings
      (tenant_id, workspace_id, principal_type, principal_id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, tenant_id)
    REFERENCES platform_workspaces (id, tenant_id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, student_id, credential_key),
  CHECK (credential_key ~ '^[a-z0-9][a-z0-9._:-]{7,179}$'),
  CHECK (code ~ '^[a-z0-9][a-z0-9._:-]{2,99}$'),
  CHECK (length(title_fa) BETWEEN 1 AND 160 AND length(title_en) BETWEEN 1 AND 160),
  CHECK (length(description_fa) BETWEEN 1 AND 500 AND length(description_en) BETWEEN 1 AND 500),
  CHECK (length(icon) BETWEEN 1 AND 32),
  CHECK (length(issuer) BETWEEN 2 AND 120),
  CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$'),
  CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  CHECK (jsonb_typeof(evidence) = 'object'),
  CHECK (expires_at IS NULL OR expires_at > issued_at),
  CHECK (
    credential_type NOT IN ('competition_medal', 'league_medal')
    OR (competition_id IS NOT NULL AND season_key IS NOT NULL AND rank IS NOT NULL AND points_bps IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS academy_credential_records_profile_idx
  ON academy_credential_records (tenant_id, workspace_id, student_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS academy_credential_records_competition_idx
  ON academy_credential_records (tenant_id, competition_id, season_key, rank)
  WHERE competition_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS academy_credential_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence BIGSERIAL NOT NULL UNIQUE,
  credential_id UUID NOT NULL REFERENCES academy_credential_records(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'issued', 'suspended', 'reinstated', 'revoked', 'appeal_opened', 'appeal_resolved'
  )),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'student', 'admin', 'c_level')),
  actor_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  evidence_sha256 CHAR(64) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key TEXT NOT NULL,
  UNIQUE (credential_id, idempotency_key),
  CHECK (length(actor_id) BETWEEN 1 AND 180),
  CHECK (reason_code ~ '^[a-z0-9][a-z0-9._:-]{2,99}$'),
  CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$'),
  CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$')
);

CREATE INDEX IF NOT EXISTS academy_credential_events_timeline_idx
  ON academy_credential_events (credential_id, event_sequence DESC);

CREATE OR REPLACE FUNCTION tecpey_validate_academy_credential_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previous_state TEXT;
  previous_appeal_state TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.credential_id::text));
  SELECT event_type INTO previous_state
    FROM academy_credential_events
   WHERE credential_id = NEW.credential_id
     AND event_type IN ('issued', 'suspended', 'reinstated', 'revoked')
   ORDER BY event_sequence DESC
   LIMIT 1;
  SELECT event_type INTO previous_appeal_state
    FROM academy_credential_events
   WHERE credential_id = NEW.credential_id
     AND event_type IN ('appeal_opened', 'appeal_resolved')
   ORDER BY event_sequence DESC
   LIMIT 1;

  IF previous_state IS NULL AND NEW.event_type <> 'issued' THEN
    RAISE EXCEPTION 'academy credential lifecycle must begin with issued' USING ERRCODE = '23514';
  ELSIF NEW.event_type = 'issued' AND previous_state IS NOT NULL THEN
    RAISE EXCEPTION 'academy credential cannot be issued twice' USING ERRCODE = '23505';
  ELSIF NEW.event_type = 'suspended' AND previous_state NOT IN ('issued', 'reinstated') THEN
    RAISE EXCEPTION 'academy credential suspension transition is invalid' USING ERRCODE = '23514';
  ELSIF NEW.event_type = 'reinstated' AND previous_state <> 'suspended' THEN
    RAISE EXCEPTION 'academy credential reinstatement transition is invalid' USING ERRCODE = '23514';
  ELSIF NEW.event_type = 'revoked' AND previous_state NOT IN ('issued', 'suspended', 'reinstated') THEN
    RAISE EXCEPTION 'academy credential revocation transition is invalid' USING ERRCODE = '23514';
  ELSIF NEW.event_type = 'appeal_opened' AND previous_appeal_state = 'appeal_opened' THEN
    RAISE EXCEPTION 'academy credential already has an open appeal' USING ERRCODE = '23514';
  ELSIF NEW.event_type = 'appeal_resolved' AND previous_appeal_state IS DISTINCT FROM 'appeal_opened' THEN
    RAISE EXCEPTION 'academy credential appeal resolution requires an open appeal' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS academy_credential_events_validate_transition ON academy_credential_events;
CREATE TRIGGER academy_credential_events_validate_transition BEFORE INSERT
  ON academy_credential_events FOR EACH ROW
  EXECUTE FUNCTION tecpey_validate_academy_credential_transition();

CREATE TABLE IF NOT EXISTS academy_credential_visibility_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence BIGSERIAL NOT NULL UNIQUE,
  credential_id UUID NOT NULL REFERENCES academy_credential_records(id) ON DELETE RESTRICT,
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'profile', 'public')),
  actor_student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE RESTRICT,
  policy_version TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('profile_settings', 'credential_cabinet', 'privacy_center')),
  idempotency_key TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (credential_id, idempotency_key),
  CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$'),
  CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$'),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS academy_credential_visibility_timeline_idx
  ON academy_credential_visibility_events (credential_id, event_sequence DESC);

CREATE OR REPLACE FUNCTION tecpey_validate_academy_credential_visibility_actor()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM academy_credential_records
     WHERE id = NEW.credential_id AND student_id = NEW.actor_student_id
  ) THEN
    RAISE EXCEPTION 'credential visibility may only be changed by its student' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS academy_credential_visibility_validate_actor ON academy_credential_visibility_events;
CREATE TRIGGER academy_credential_visibility_validate_actor BEFORE INSERT
  ON academy_credential_visibility_events FOR EACH ROW
  EXECUTE FUNCTION tecpey_validate_academy_credential_visibility_actor();

CREATE OR REPLACE FUNCTION tecpey_block_academy_credential_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'academy credential ledger is append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS academy_credential_records_no_update ON academy_credential_records;
CREATE TRIGGER academy_credential_records_no_update BEFORE UPDATE OR DELETE
  ON academy_credential_records FOR EACH ROW
  EXECUTE FUNCTION tecpey_block_academy_credential_ledger_mutation();
DROP TRIGGER IF EXISTS academy_credential_events_no_update ON academy_credential_events;
CREATE TRIGGER academy_credential_events_no_update BEFORE UPDATE OR DELETE
  ON academy_credential_events FOR EACH ROW
  EXECUTE FUNCTION tecpey_block_academy_credential_ledger_mutation();
DROP TRIGGER IF EXISTS academy_credential_visibility_events_no_update ON academy_credential_visibility_events;
CREATE TRIGGER academy_credential_visibility_events_no_update BEFORE UPDATE OR DELETE
  ON academy_credential_visibility_events FOR EACH ROW
  EXECUTE FUNCTION tecpey_block_academy_credential_ledger_mutation();

CREATE OR REPLACE VIEW academy_credential_current_state AS
WITH lifecycle AS (
  SELECT DISTINCT ON (credential_id)
    credential_id, event_type, reason_code, occurred_at
  FROM academy_credential_events
  WHERE event_type IN ('issued', 'suspended', 'reinstated', 'revoked')
  ORDER BY credential_id, event_sequence DESC
), visibility AS (
  SELECT DISTINCT ON (credential_id)
    credential_id, visibility, occurred_at
  FROM academy_credential_visibility_events
  ORDER BY credential_id, event_sequence DESC
)
SELECT record.*,
  COALESCE(lifecycle.event_type, 'issued') AS lifecycle_state,
  lifecycle.reason_code AS lifecycle_reason,
  lifecycle.occurred_at AS lifecycle_changed_at,
  COALESCE(visibility.visibility, 'private') AS visibility,
  visibility.occurred_at AS visibility_changed_at
FROM academy_credential_records record
LEFT JOIN lifecycle ON lifecycle.credential_id = record.id
LEFT JOIN visibility ON visibility.credential_id = record.id;
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runAcademyCredentialLedgerMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ACADEMY_CREDENTIAL_LEDGER_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) throw new Error(`[db-migrate-academy-credential-ledger] checksum mismatch for ${FILENAME}`);
    return;
  }
  logger.info("[db-migrate-academy-credential-ledger] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_CREDENTIAL_LEDGER_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
