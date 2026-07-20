import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0046_tenant_principal_isolation_foundation.sql";

export const TENANT_PRINCIPAL_ISOLATION_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO platform_workspaces
  (id, tenant_id, slug, name, description, is_default, created_at, updated_at)
VALUES
  ('workspace-primary', 'tecpey', 'primary', 'TecPey Primary Workspace',
   'Canonical workspace used by server-authoritative tenant/principal contexts.',
   FALSE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM platform_workspaces
     WHERE id = 'workspace-primary'
       AND tenant_id = 'tecpey'
  ) THEN
    RAISE EXCEPTION 'workspace-primary must belong to tenant tecpey';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS platform_workspaces_id_tenant_uidx
  ON platform_workspaces (id, tenant_id);

CREATE TABLE IF NOT EXISTS platform_principal_bindings (
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  principal_type TEXT NOT NULL CHECK (
    principal_type IN ('student', 'account', 'user', 'admin', 'service')
  ),
  principal_id TEXT NOT NULL CHECK (char_length(principal_id) BETWEEN 1 AND 300),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  source TEXT NOT NULL CHECK (
    source IN ('academy_backfill', 'account_backfill', 'membership', 'admin', 'service', 'migration')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, principal_type, principal_id),
  CONSTRAINT platform_principal_binding_workspace_fk
    FOREIGN KEY (workspace_id, tenant_id)
    REFERENCES platform_workspaces(id, tenant_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS platform_principal_bindings_lookup_idx
  ON platform_principal_bindings (principal_type, principal_id, status, tenant_id);

CREATE OR REPLACE FUNCTION tecpey_guard_platform_principal_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'platform principal bindings cannot be deleted; revoke them';
  END IF;
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
     OR OLD.principal_type IS DISTINCT FROM NEW.principal_type
     OR OLD.principal_id IS DISTINCT FROM NEW.principal_id
     OR OLD.source IS DISTINCT FROM NEW.source
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'platform principal binding identity is immutable';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_principal_binding_guard
  ON platform_principal_bindings;
CREATE TRIGGER platform_principal_binding_guard
  BEFORE UPDATE OR DELETE ON platform_principal_bindings
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_guard_platform_principal_binding();

INSERT INTO platform_principal_bindings
  (tenant_id, workspace_id, principal_type, principal_id, status, source)
SELECT 'tecpey', 'workspace-primary', 'student', student.id::text, 'active', 'academy_backfill'
  FROM academy_students student
ON CONFLICT (tenant_id, principal_type, principal_id) DO NOTHING;

INSERT INTO platform_principal_bindings
  (tenant_id, workspace_id, principal_type, principal_id, status, source)
SELECT 'tecpey', 'workspace-primary', 'account', account.id, 'active', 'account_backfill'
  FROM academy_auth_accounts account
ON CONFLICT (tenant_id, principal_type, principal_id) DO NOTHING;

ALTER TABLE offline_sync_commands
  ADD COLUMN IF NOT EXISTS principal_type TEXT NOT NULL DEFAULT 'student';
ALTER TABLE offline_sync_commands
  ADD COLUMN IF NOT EXISTS principal_id TEXT
    GENERATED ALWAYS AS (student_id::text) STORED;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'offline_sync_commands_principal_type_check'
  ) THEN
    ALTER TABLE offline_sync_commands
      ADD CONSTRAINT offline_sync_commands_principal_type_check
      CHECK (principal_type = 'student');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'offline_sync_commands_principal_binding_fk'
  ) THEN
    ALTER TABLE offline_sync_commands
      ADD CONSTRAINT offline_sync_commands_principal_binding_fk
      FOREIGN KEY (tenant_id, principal_type, principal_id)
      REFERENCES platform_principal_bindings(tenant_id, principal_type, principal_id)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT
      NOT VALID;
    ALTER TABLE offline_sync_commands
      VALIDATE CONSTRAINT offline_sync_commands_principal_binding_fk;
  END IF;
END;
$$;

ALTER TABLE learning_events
  ADD COLUMN IF NOT EXISTS principal_type TEXT NOT NULL DEFAULT 'student';
ALTER TABLE learning_events
  ADD COLUMN IF NOT EXISTS principal_id TEXT
    GENERATED ALWAYS AS (student_id::text) STORED;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'learning_events_principal_type_check'
  ) THEN
    ALTER TABLE learning_events
      ADD CONSTRAINT learning_events_principal_type_check
      CHECK (principal_type = 'student');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'learning_events_principal_binding_fk'
  ) THEN
    ALTER TABLE learning_events
      ADD CONSTRAINT learning_events_principal_binding_fk
      FOREIGN KEY (tenant_id, principal_type, principal_id)
      REFERENCES platform_principal_bindings(tenant_id, principal_type, principal_id)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT
      NOT VALID;
    ALTER TABLE learning_events
      VALIDATE CONSTRAINT learning_events_principal_binding_fk;
  END IF;
END;
$$;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runTenantPrincipalIsolationMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(TENANT_PRINCIPAL_ISOLATION_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-tenant-principal-isolation] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-tenant-principal-isolation] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(TENANT_PRINCIPAL_ISOLATION_SQL);
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
