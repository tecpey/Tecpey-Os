import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0089_admin_password_totp.sql";

export const ADMIN_PASSWORD_TOTP_SQL = `
CREATE TABLE IF NOT EXISTS admin_password_totp_credentials (
  admin_id UUID PRIMARY KEY REFERENCES admin_users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  encrypted_totp_secret TEXT NOT NULL,
  recovery_code_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_accepted_step BIGINT,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ,
  enrolled_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (password_hash LIKE 'scrypt$32768$8$1$%'),
  CHECK (length(encrypted_totp_secret) BETWEEN 40 AND 512),
  CHECK (jsonb_typeof(recovery_code_hashes) = 'array'),
  CHECK (jsonb_array_length(recovery_code_hashes) <= 10),
  CHECK (octet_length(recovery_code_hashes::text) <= 2048)
);

CREATE INDEX IF NOT EXISTS admin_password_totp_active_idx
  ON admin_password_totp_credentials (admin_id)
  WHERE enrolled_at IS NOT NULL AND revoked_at IS NULL;
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runAdminPasswordTotpMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ADMIN_PASSWORD_TOTP_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error("[db-migrate-admin-password-totp] checksum mismatch for 0089_admin_password_totp.sql");
    }
    return;
  }

  logger.info("[db-migrate-admin-password-totp] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(ADMIN_PASSWORD_TOTP_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
