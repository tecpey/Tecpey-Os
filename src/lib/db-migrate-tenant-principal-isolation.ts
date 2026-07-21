import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0046_tenant_principal_isolation_foundation.sql";

const SQL = `
CREATE TABLE IF NOT EXISTS platform_principal_bindings (
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, workspace_id, principal_type, principal_id),
  CONSTRAINT platform_principal_bindings_status_check
    CHECK (status IN ('active', 'revoked')),
  CONSTRAINT platform_principal_bindings_type_check
    CHECK (principal_type IN ('student', 'account', 'user', 'admin', 'service')),
  CONSTRAINT platform_principal_bindings_workspace_fk
    FOREIGN KEY (workspace_id, tenant_id)
    REFERENCES platform_workspaces(id, tenant_id)
    ON DELETE CASCADE
);

INSERT INTO platform_tenants (id, slug, display_name, status, settings)
VALUES ('tecpey', 'tecpey', 'TecPey', 'active', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO platform_workspaces
  (id, tenant_id, slug, display_name, is_default, products, settings)
VALUES
  ('workspace-primary', 'tecpey', 'primary', 'TecPey Primary', TRUE, '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS platform_principal_bindings_lookup_idx
  ON platform_principal_bindings
    (principal_type, principal_id, tenant_id, workspace_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS platform_principal_bindings_active_tenant_idx
  ON platform_principal_bindings (tenant_id, principal_type, principal_id)
  WHERE status = 'active';

INSERT INTO platform_principal_bindings
  (tenant_id, workspace_id, principal_type, principal_id, source)
SELECT
  'tecpey',
  'workspace-primary',
  'student',
  student.id::text,
  'academy_students_backfill'
FROM academy_students student
ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id)
DO UPDATE SET status = 'active', updated_at = NOW();

INSERT INTO platform_principal_bindings
  (tenant_id, workspace_id, principal_type, principal_id, source)
SELECT
  'tecpey',
  'workspace-primary',
  'account',
  account.id::text,
  'academy_auth_accounts_backfill'
FROM academy_auth_accounts account
ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id)
DO UPDATE SET status = 'active', updated_at = NOW();

CREATE OR REPLACE FUNCTION tecpey_bind_default_student_principal()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO platform_principal_bindings
    (tenant_id, workspace_id, principal_type, principal_id, source)
  VALUES
    ('tecpey', 'workspace-primary', 'student', NEW.id::text, 'academy_students_trigger')
  ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id)
  DO UPDATE SET status = 'active', updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_students_default_principal_binding
  ON academy_students;
CREATE TRIGGER academy_students_default_principal_binding
AFTER INSERT ON academy_students
FOR EACH ROW EXECUTE FUNCTION tecpey_bind_default_student_principal();

CREATE OR REPLACE FUNCTION tecpey_bind_default_account_principal()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO platform_principal_bindings
    (tenant_id, workspace_id, principal_type, principal_id, source)
  VALUES
    ('tecpey', 'workspace-primary', 'account', NEW.id::text, 'academy_auth_accounts_trigger')
  ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id)
  DO UPDATE SET status = 'active', updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_auth_accounts_default_principal_binding
  ON academy_auth_accounts;
CREATE TRIGGER academy_auth_accounts_default_principal_binding
AFTER INSERT ON academy_auth_accounts
FOR EACH ROW EXECUTE FUNCTION tecpey_bind_default_account_principal();

ALTER TABLE offline_sync_commands
  ADD COLUMN IF NOT EXISTS workspace_id TEXT,
  ADD COLUMN IF NOT EXISTS principal_type TEXT,
  ADD COLUMN IF NOT EXISTS principal_id TEXT
    GENERATED ALWAYS AS (student_id::text) STORED;

UPDATE offline_sync_commands
   SET workspace_id = COALESCE(workspace_id, 'workspace-primary'),
       principal_type = COALESCE(principal_type, 'student');

ALTER TABLE offline_sync_commands
  ALTER COLUMN workspace_id SET NOT NULL,
  ALTER COLUMN principal_type SET NOT NULL;

ALTER TABLE offline_sync_commands
  DROP CONSTRAINT IF EXISTS offline_sync_commands_student_binding_fk,
  DROP CONSTRAINT IF EXISTS offline_sync_commands_principal_binding_fk,
  DROP CONSTRAINT IF EXISTS offline_sync_commands_principal_type_check;

ALTER TABLE offline_sync_commands
  ADD CONSTRAINT offline_sync_commands_principal_type_check
    CHECK (principal_type = 'student'),
  ADD CONSTRAINT offline_sync_commands_principal_binding_fk
    FOREIGN KEY (tenant_id, workspace_id, principal_type, principal_id)
    REFERENCES platform_principal_bindings
      (tenant_id, workspace_id, principal_type, principal_id)
    ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS offline_sync_commands_tenant_principal_idx
  ON offline_sync_commands
    (tenant_id, workspace_id, principal_type, principal_id, created_at DESC);

ALTER TABLE learning_events
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS workspace_id TEXT,
  ADD COLUMN IF NOT EXISTS principal_type TEXT,
  ADD COLUMN IF NOT EXISTS principal_id TEXT;

UPDATE learning_events
   SET tenant_id = COALESCE(tenant_id, 'tecpey'),
       workspace_id = COALESCE(workspace_id, 'workspace-primary'),
       principal_type = COALESCE(principal_type, 'student'),
       principal_id = COALESCE(principal_id, student_id::text);

ALTER TABLE learning_events
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN workspace_id SET NOT NULL,
  ALTER COLUMN principal_type SET NOT NULL,
  ALTER COLUMN principal_id SET NOT NULL;

ALTER TABLE learning_events
  DROP CONSTRAINT IF EXISTS learning_events_student_binding_fk,
  DROP CONSTRAINT IF EXISTS learning_events_principal_binding_fk,
  DROP CONSTRAINT IF EXISTS learning_events_principal_type_check,
  DROP CONSTRAINT IF EXISTS learning_events_principal_matches_student_check;

ALTER TABLE learning_events
  ADD CONSTRAINT learning_events_principal_type_check
    CHECK (principal_type = 'student'),
  ADD CONSTRAINT learning_events_principal_matches_student_check
    CHECK (principal_id = student_id::text),
  ADD CONSTRAINT learning_events_principal_binding_fk
    FOREIGN KEY (tenant_id, workspace_id, principal_type, principal_id)
    REFERENCES platform_principal_bindings
      (tenant_id, workspace_id, principal_type, principal_id)
    ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS learning_events_tenant_principal_idx
  ON learning_events
    (tenant_id, workspace_id, principal_type, principal_id, created_at DESC);
`;

export async function runTenantPrincipalIsolationMigrations(
  client: PoolClient,
): Promise<void> {
  const checksum = createHash("sha256").update(SQL).digest("hex");
  const existing = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1",
    [FILENAME],
  );
  if (existing.rows[0]) {
    if (existing.rows[0].checksum !== checksum) {
      throw new Error(`Migration checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(SQL);
    await client.query(
      "INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)",
      [FILENAME, checksum],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
