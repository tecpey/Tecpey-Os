import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0112_identity_auth_kyc_v2.sql";

export const IDENTITY_AUTH_KYC_V2_SQL = `
-- TOTP replay authority: persisted on the credential row so concurrent verifiers
-- serialize on the existing FOR UPDATE lock and one RFC-6238 step succeeds once.
ALTER TABLE user_2fa
  ADD COLUMN IF NOT EXISTS last_accepted_totp_step BIGINT;

CREATE TABLE IF NOT EXISTS academy_external_identities (
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple')),
  provider_subject TEXT NOT NULL CHECK (char_length(provider_subject) BETWEEN 1 AND 255),
  account_id TEXT NOT NULL REFERENCES academy_auth_accounts(id) ON DELETE CASCADE,
  provider_email TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, provider_subject),
  UNIQUE (account_id, provider),
  CHECK (provider_email IS NULL OR char_length(provider_email) BETWEEN 3 AND 320)
);

CREATE INDEX IF NOT EXISTS academy_external_identities_account_idx
  ON academy_external_identities (account_id, provider);

CREATE TABLE IF NOT EXISTS academy_external_identity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple')),
  provider_subject_fingerprint TEXT NOT NULL
    CHECK (provider_subject_fingerprint ~ '^[0-9a-f]{64}$'),
  account_id TEXT NOT NULL REFERENCES academy_auth_accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('created', 'linked', 'login', 'link_rejected')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (octet_length(metadata::text) <= 2048)
);

CREATE INDEX IF NOT EXISTS academy_external_identity_events_account_idx
  ON academy_external_identity_events (account_id, created_at DESC);

CREATE OR REPLACE FUNCTION tecpey_reject_external_identity_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'external identity events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS academy_external_identity_events_append_only
  ON academy_external_identity_events;
CREATE TRIGGER academy_external_identity_events_append_only
BEFORE UPDATE OR DELETE ON academy_external_identity_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_external_identity_event_mutation();

CREATE TABLE IF NOT EXISTS identity_verification_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL REFERENCES academy_auth_accounts(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL
    CHECK (purpose IN ('account_identity', 'certificate_identity')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'needs_action', 'verified', 'rejected', 'expired')),
  legal_name TEXT NOT NULL CHECK (char_length(legal_name) BETWEEN 2 AND 160),
  birth_date DATE,
  nationality_country TEXT,
  document_type TEXT
    CHECK (document_type IS NULL OR document_type IN ('passport', 'national_id', 'other')),
  document_country TEXT,
  document_reference_hash TEXT,
  certificate_name TEXT,
  reviewer_reason_code TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (birth_date IS NULL OR birth_date >= DATE '1900-01-01'),
  CHECK (nationality_country IS NULL OR nationality_country ~ '^[A-Z]{2}$'),
  CHECK (document_country IS NULL OR document_country ~ '^[A-Z]{2}$'),
  CHECK (document_reference_hash IS NULL OR document_reference_hash ~ '^[0-9a-f]{64}$'),
  CHECK (certificate_name IS NULL OR char_length(certificate_name) BETWEEN 2 AND 160),
  CHECK (reviewer_reason_code IS NULL OR reviewer_reason_code ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  CHECK (
    (status IN ('verified', 'rejected') AND reviewed_at IS NOT NULL)
    OR (status NOT IN ('verified', 'rejected'))
  ),
  CHECK (expires_at IS NULL OR expires_at > submitted_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS identity_verification_cases_one_open_per_purpose
  ON identity_verification_cases (account_id, purpose)
  WHERE status IN ('pending', 'needs_action');

CREATE INDEX IF NOT EXISTS identity_verification_cases_account_idx
  ON identity_verification_cases (account_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS identity_verification_cases_review_idx
  ON identity_verification_cases (status, submitted_at)
  WHERE status IN ('pending', 'needs_action');

CREATE TABLE IF NOT EXISTS identity_verification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES identity_verification_cases(id) ON DELETE RESTRICT,
  account_id TEXT NOT NULL REFERENCES academy_auth_accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('submitted', 'updated', 'needs_action', 'verified', 'rejected', 'expired')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'admin', 'system')),
  actor_fingerprint TEXT NOT NULL CHECK (actor_fingerprint ~ '^[0-9a-f]{64}$'),
  reason_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reason_code IS NULL OR reason_code ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (octet_length(metadata::text) <= 2048)
);

CREATE INDEX IF NOT EXISTS identity_verification_events_case_idx
  ON identity_verification_events (case_id, created_at);

CREATE OR REPLACE FUNCTION tecpey_reject_identity_verification_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'identity verification events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS identity_verification_events_append_only
  ON identity_verification_events;
CREATE TRIGGER identity_verification_events_append_only
BEFORE UPDATE OR DELETE ON identity_verification_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_identity_verification_event_mutation();

CREATE TABLE IF NOT EXISTS academy_certificate_legal_identities (
  account_id TEXT PRIMARY KEY REFERENCES academy_auth_accounts(id) ON DELETE CASCADE,
  verification_case_id UUID NOT NULL UNIQUE
    REFERENCES identity_verification_cases(id) ON DELETE RESTRICT,
  certificate_name TEXT NOT NULL CHECK (char_length(certificate_name) BETWEEN 2 AND 160),
  nationality_country TEXT,
  document_type TEXT,
  document_country TEXT,
  verified_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (nationality_country IS NULL OR nationality_country ~ '^[A-Z]{2}$'),
  CHECK (document_type IS NULL OR document_type IN ('passport', 'national_id', 'other')),
  CHECK (document_country IS NULL OR document_country ~ '^[A-Z]{2}$')
);
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runIdentityAuthKycV2Migrations(client: PoolClient): Promise<void> {
  const cs = checksum(IDENTITY_AUTH_KYC_V2_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-identity-auth-kyc-v2] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(IDENTITY_AUTH_KYC_V2_SQL);
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
