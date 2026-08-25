import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0087_phone_identity_otp.sql";

export const PHONE_IDENTITY_OTP_SQL = `
ALTER TABLE academy_auth_accounts
  ADD COLUMN IF NOT EXISTS phone_e164 TEXT,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS academy_auth_accounts_phone_unique
  ON academy_auth_accounts (phone_e164)
  WHERE phone_e164 IS NOT NULL;

CREATE TABLE IF NOT EXISTS identity_phone_otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_fingerprint TEXT NOT NULL,
  encrypted_phone TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('signup', 'login', 'profile_verify')),
  provider TEXT NOT NULL CHECK (provider = 'limoo_sms'),
  status TEXT NOT NULL DEFAULT 'prepared'
    CHECK (status IN ('prepared', 'sent', 'verifying', 'verified', 'consumed', 'failed', 'expired')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts = 5),
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  consumed_by_account_id TEXT REFERENCES academy_auth_accounts(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (phone_fingerprint ~ '^[0-9a-f]{64}$'),
  CHECK (expires_at > created_at),
  CHECK ((status IN ('verified', 'consumed')) = (verified_at IS NOT NULL)),
  CHECK ((status = 'consumed') = (consumed_at IS NOT NULL)),
  CHECK ((status = 'consumed') = (consumed_by_account_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS identity_phone_otp_active_idx
  ON identity_phone_otp_challenges (phone_fingerprint, purpose, created_at DESC)
  WHERE status IN ('prepared', 'sent', 'verifying', 'verified');

CREATE INDEX IF NOT EXISTS identity_phone_otp_expiry_idx
  ON identity_phone_otp_challenges (expires_at)
  WHERE status IN ('prepared', 'sent', 'verifying', 'verified');

CREATE TABLE IF NOT EXISTS identity_phone_otp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES identity_phone_otp_challenges(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('prepared', 'sent', 'send_failed', 'verification_started', 'verification_failed', 'verified', 'consumed', 'expired')),
  phone_fingerprint TEXT NOT NULL CHECK (phone_fingerprint ~ '^[0-9a-f]{64}$'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (octet_length(metadata::text) <= 2048)
);

CREATE INDEX IF NOT EXISTS identity_phone_otp_events_challenge_idx
  ON identity_phone_otp_events (challenge_id, created_at ASC);

CREATE OR REPLACE FUNCTION tecpey_reject_phone_otp_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'phone OTP events are append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS identity_phone_otp_events_no_update ON identity_phone_otp_events;
CREATE TRIGGER identity_phone_otp_events_no_update
BEFORE UPDATE ON identity_phone_otp_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_phone_otp_event_mutation();

DROP TRIGGER IF EXISTS identity_phone_otp_events_no_delete ON identity_phone_otp_events;
CREATE TRIGGER identity_phone_otp_events_no_delete
BEFORE DELETE ON identity_phone_otp_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_phone_otp_event_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runPhoneIdentityOtpMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(PHONE_IDENTITY_OTP_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error("[db-migrate-phone-identity-otp] checksum mismatch for 0087_phone_identity_otp.sql");
    }
    return;
  }

  logger.info("[db-migrate-phone-identity-otp] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(PHONE_IDENTITY_OTP_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
