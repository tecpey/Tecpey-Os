import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0033_sensitive_mutation_audit.sql";

export const SENSITIVE_MUTATION_AUDIT_SQL = `
CREATE TABLE IF NOT EXISTS sensitive_mutation_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, action, correlation_id),
  CHECK (tenant_id ~ '^[a-z][a-z0-9._-]{1,79}$'),
  CHECK (actor_type ~ '^[a-z][a-z0-9._-]{1,39}$'),
  CHECK (length(actor_id) BETWEEN 1 AND 300),
  CHECK (action ~ '^[a-z][a-z0-9._:-]{2,119}$'),
  CHECK (resource_type ~ '^[a-z][a-z0-9._:-]{2,119}$'),
  CHECK (length(resource_id) BETWEEN 1 AND 300),
  CHECK (outcome IN ('success', 'no_op', 'rejected', 'failed')),
  CHECK (correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'),
  CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (octet_length(metadata::text) <= 16384)
);

CREATE INDEX IF NOT EXISTS sensitive_mutation_audit_actor_idx
  ON sensitive_mutation_audit_events
  (tenant_id, actor_type, actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sensitive_mutation_audit_resource_idx
  ON sensitive_mutation_audit_events
  (tenant_id, resource_type, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sensitive_mutation_audit_action_idx
  ON sensitive_mutation_audit_events
  (tenant_id, action, created_at DESC);

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
        'email', 'phone', 'raw', 'body', 'authorization', 'cookie'
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

CREATE OR REPLACE FUNCTION tecpey_validate_sensitive_mutation_audit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF tecpey_sensitive_audit_has_forbidden_key(NEW.metadata) THEN
    RAISE EXCEPTION 'sensitive audit metadata contains forbidden keys'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sensitive_mutation_audit_validate
  ON sensitive_mutation_audit_events;
CREATE TRIGGER sensitive_mutation_audit_validate
  BEFORE INSERT ON sensitive_mutation_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_validate_sensitive_mutation_audit();

CREATE OR REPLACE FUNCTION tecpey_reject_sensitive_mutation_audit_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'sensitive mutation audit evidence is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS sensitive_mutation_audit_no_update
  ON sensitive_mutation_audit_events;
CREATE TRIGGER sensitive_mutation_audit_no_update
  BEFORE UPDATE ON sensitive_mutation_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_reject_sensitive_mutation_audit_change();

DROP TRIGGER IF EXISTS sensitive_mutation_audit_no_delete
  ON sensitive_mutation_audit_events;
CREATE TRIGGER sensitive_mutation_audit_no_delete
  BEFORE DELETE ON sensitive_mutation_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_reject_sensitive_mutation_audit_change();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runSensitiveMutationAuditMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(SENSITIVE_MUTATION_AUDIT_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-sensitive-mutation-audit] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-sensitive-mutation-audit] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(SENSITIVE_MUTATION_AUDIT_SQL);
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
