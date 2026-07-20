import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0035_session_authority.sql";

export const SESSION_AUTHORITY_SQL = `
ALTER TABLE known_devices
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS refresh_token_families (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  known_device_id TEXT REFERENCES known_devices(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (id, user_id)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM refresh_tokens
     GROUP BY family_id
    HAVING COUNT(DISTINCT user_id) > 1
  ) THEN
    RAISE EXCEPTION 'refresh token family is bound to multiple users';
  END IF;
END;
$$;

INSERT INTO refresh_token_families (id, user_id, status, created_at, last_rotated_at, revoked_at)
SELECT family_id,
       MIN(user_id),
       CASE WHEN BOOL_AND(is_revoked) THEN 'revoked' ELSE 'active' END,
       MIN(created_at),
       MAX(created_at),
       CASE WHEN BOOL_AND(is_revoked) THEN MAX(revoked_at) ELSE NULL END
  FROM refresh_tokens
 GROUP BY family_id
ON CONFLICT (id) DO NOTHING;

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS known_device_id TEXT REFERENCES known_devices(id) ON DELETE SET NULL;

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS refresh_family_id TEXT REFERENCES refresh_token_families(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS known_device_id TEXT REFERENCES known_devices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS refresh_token_families_user_idx
  ON refresh_token_families (user_id, status, last_rotated_at DESC);
CREATE INDEX IF NOT EXISTS refresh_token_families_device_idx
  ON refresh_token_families (known_device_id, status)
  WHERE known_device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS refresh_tokens_family_user_idx
  ON refresh_tokens (family_id, user_id, is_revoked, expires_at DESC);
CREATE INDEX IF NOT EXISTS refresh_tokens_device_idx
  ON refresh_tokens (known_device_id, is_revoked, expires_at DESC)
  WHERE known_device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS user_sessions_family_idx
  ON user_sessions (refresh_family_id, is_revoked, expires_at DESC)
  WHERE refresh_family_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS user_sessions_device_idx
  ON user_sessions (known_device_id, is_revoked, expires_at DESC)
  WHERE known_device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS known_devices_active_user_idx
  ON known_devices (user_id, is_active, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS session_revocation_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_jti TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS session_revocation_outbox_pending_idx
  ON session_revocation_outbox (status, updated_at, created_at)
  WHERE status = 'pending';

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
        'userhandle', 'credentialid', 'credential_id', 'rawid', 'raw_id',
        'ip', 'useragent', 'user_agent', 'deviceinfo', 'device_info',
        'access_token', 'accesstoken', 'refresh_token', 'refreshtoken',
        'jti', 'sessionid', 'session_id', 'familyid', 'family_id'
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
