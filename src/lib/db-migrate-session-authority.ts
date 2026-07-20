import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0035_session_authority.sql";

export const SESSION_AUTHORITY_SQL = `
ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS refresh_family_id TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_id TEXT,
  ADD COLUMN IF NOT EXISTS known_device_id TEXT;

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS known_device_id TEXT;

ALTER TABLE known_devices
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS user_sessions_refresh_family_idx
  ON user_sessions(user_id, refresh_family_id, is_revoked, expires_at DESC)
  WHERE refresh_family_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_sessions_refresh_token_idx
  ON user_sessions(refresh_token_id)
  WHERE refresh_token_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_sessions_known_device_idx
  ON user_sessions(user_id, known_device_id, is_revoked, expires_at DESC)
  WHERE known_device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS refresh_tokens_known_device_idx
  ON refresh_tokens(user_id, known_device_id, family_id, is_revoked, expires_at DESC)
  WHERE known_device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS known_devices_active_user_idx
  ON known_devices(user_id, is_active, last_seen_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_refresh_token_fk'
  ) THEN
    ALTER TABLE user_sessions
      ADD CONSTRAINT user_sessions_refresh_token_fk
      FOREIGN KEY (refresh_token_id) REFERENCES refresh_tokens(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_known_device_fk'
  ) THEN
    ALTER TABLE user_sessions
      ADD CONSTRAINT user_sessions_known_device_fk
      FOREIGN KEY (known_device_id) REFERENCES known_devices(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'refresh_tokens_known_device_fk'
  ) THEN
    ALTER TABLE refresh_tokens
      ADD CONSTRAINT refresh_tokens_known_device_fk
      FOREIGN KEY (known_device_id) REFERENCES known_devices(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS session_revocation_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_jti TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  UNIQUE(session_jti),
  CHECK (tenant_id ~ '^[a-z][a-z0-9._-]{1,79}$'),
  CHECK (length(user_id) BETWEEN 1 AND 300),
  CHECK (length(session_jti) BETWEEN 1 AND 300),
  CHECK (last_error IS NULL OR length(last_error) <= 500)
);

CREATE INDEX IF NOT EXISTS session_revocation_outbox_pending_idx
  ON session_revocation_outbox(created_at, id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS session_revocation_outbox_user_idx
  ON session_revocation_outbox(tenant_id, user_id, created_at DESC);

-- Extend the database-layer metadata guard without mutating the immutable
-- migration that originally introduced sensitive audit evidence.
CREATE OR REPLACE FUNCTION tecpey_sensitive_audit_has_forbidden_key(document JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  object_entry RECORD;
  array_item JSONB;
BEGIN
  IF jsonb_typeof(document) = 'object' THEN
    FOR object_entry IN
      SELECT object_item.key, object_item.value
        FROM jsonb_each(document) AS object_item(key, value)
    LOOP
      IF lower(object_entry.key) = ANY(ARRAY[
        'token', 'device_token', 'content', 'message', 'messages',
        'conversation', 'conversations', 'secret', 'password',
        'email', 'phone', 'raw', 'body', 'authorization', 'cookie',
        'public_key', 'publickey', 'signature', 'challenge',
        'clientdatajson', 'authenticatordata', 'attestationobject',
        'userhandle', 'ip', 'useragent', 'user_agent', 'deviceinfo',
        'device_info', 'access_token', 'refreshtoken', 'refresh_token',
        'jti'
      ]) THEN
        RETURN TRUE;
      END IF;
      IF tecpey_sensitive_audit_has_forbidden_key(object_entry.value) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(document) = 'array' THEN
    FOR array_item IN
      SELECT array_element.value
        FROM jsonb_array_elements(document) AS array_element(value)
    LOOP
      IF tecpey_sensitive_audit_has_forbidden_key(array_item) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  END IF;
  RETURN FALSE;
END;
$$;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runSessionAuthorityMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(SESSION_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-session-authority] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-session-authority] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(SESSION_AUTHORITY_SQL);
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
