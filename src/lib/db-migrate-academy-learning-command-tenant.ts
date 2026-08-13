import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0068_academy_learning_command_tenant.sql";

// academy_learning_commands is the idempotency receipt for academy write
// commands, and it was keyed only by (student_id, command_type, request_hash)
// and (student_id, idempotency_key).
//
// That was survivable while term progress itself was global, but migration 0066
// gave academy_term_progress a tenant boundary — and a tenant-scoped write
// behind a tenant-blind receipt is worse than either alone. The same student
// submitting identical answers in a second tenant would match the first
// tenant's receipt, get that tenant's cached response back with
// `replayed: true`, and never receive a progress row of their own: a silent
// success that writes nothing.
//
// The receipt boundary therefore has to match the boundary of the rows it
// guards. Existing receipts belong to the default tenant.

export const ACADEMY_LEARNING_COMMAND_TENANT_SQL = `
ALTER TABLE academy_learning_commands
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tecpey';

ALTER TABLE academy_learning_commands
  ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'main';

ALTER TABLE academy_learning_commands
  DROP CONSTRAINT IF EXISTS academy_learning_commands_tenant_id_check;
ALTER TABLE academy_learning_commands
  ADD CONSTRAINT academy_learning_commands_tenant_id_check
  CHECK (tenant_id ~ '^[a-z][a-z0-9-]{2,63}$');

ALTER TABLE academy_learning_commands
  DROP CONSTRAINT IF EXISTS academy_learning_commands_workspace_id_check;
ALTER TABLE academy_learning_commands
  ADD CONSTRAINT academy_learning_commands_workspace_id_check
  CHECK (workspace_id ~ '^[a-z][a-z0-9-]{2,63}$');

ALTER TABLE academy_learning_commands
  DROP CONSTRAINT IF EXISTS academy_learning_commands_tenant_fk;
ALTER TABLE academy_learning_commands
  ADD CONSTRAINT academy_learning_commands_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS academy_learning_commands_tenant_request_idx
  ON academy_learning_commands (tenant_id, workspace_id, student_id, command_type, request_hash);

ALTER TABLE academy_learning_commands
  DROP CONSTRAINT IF EXISTS academy_learning_commands_student_id_command_type_request_h_key;

CREATE UNIQUE INDEX IF NOT EXISTS academy_learning_commands_tenant_idempotency_idx
  ON academy_learning_commands (tenant_id, workspace_id, student_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DROP INDEX IF EXISTS academy_learning_commands_idempotency_idx;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runAcademyLearningCommandTenantMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ACADEMY_LEARNING_COMMAND_TENANT_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-academy-learning-command-tenant] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-academy-learning-command-tenant] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_LEARNING_COMMAND_TENANT_SQL);
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
