import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0090_phone_otp_local_verifier.sql";

export const PHONE_OTP_LOCAL_VERIFIER_SQL = `
ALTER TABLE identity_phone_otp_challenges
  ADD COLUMN IF NOT EXISTS otp_code_digest TEXT;

UPDATE identity_phone_otp_challenges
   SET status = 'expired', verified_at = NULL, updated_at = NOW()
 WHERE otp_code_digest IS NULL
   AND status IN ('prepared', 'sent', 'verifying', 'verified');

ALTER TABLE identity_phone_otp_challenges
  DROP CONSTRAINT IF EXISTS identity_phone_otp_code_digest_format;
ALTER TABLE identity_phone_otp_challenges
  ADD CONSTRAINT identity_phone_otp_code_digest_format
  CHECK (otp_code_digest IS NULL OR otp_code_digest ~ '^[0-9a-f]{64}$');

ALTER TABLE identity_phone_otp_challenges
  DROP CONSTRAINT IF EXISTS identity_phone_otp_active_code_digest;
ALTER TABLE identity_phone_otp_challenges
  ADD CONSTRAINT identity_phone_otp_active_code_digest
  CHECK (
    status NOT IN ('prepared', 'sent', 'verifying', 'verified')
    OR otp_code_digest IS NOT NULL
  );
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runPhoneOtpLocalVerifierMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(PHONE_OTP_LOCAL_VERIFIER_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error("[db-migrate-phone-otp-local-verifier] checksum mismatch for 0090_phone_otp_local_verifier.sql");
    }
    return;
  }

  logger.info("[db-migrate-phone-otp-local-verifier] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(PHONE_OTP_LOCAL_VERIFIER_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
