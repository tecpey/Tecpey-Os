import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0066_academy_term_progress_tenant.sql";

// academy_term_progress was the last academy table with no tenant column at all.
// Its uniqueness boundary was (student_id, term_number, locale), and
// platform_principal_bindings lets the SAME student UUID be bound in two
// tenants, so both tenants read and wrote the same rows. That contaminated the
// Mastery Seasons read model, where eligibility is
// `completedTerms >= season.recommendedAfterTerm` — terms completed in one
// tenant unlocked a season in another tenant whose own profile did not qualify
// (audit finding F-8).
//
// Existing rows belong to the default tenant, which is what the column defaults
// encode. The uniqueness boundary moves to include tenant and workspace so the
// same student can hold independent term progress per tenant, and the writer's
// ON CONFLICT target moves with it in the same change.

export const ACADEMY_TERM_PROGRESS_TENANT_SQL = `
ALTER TABLE academy_term_progress
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tecpey';

ALTER TABLE academy_term_progress
  ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'main';

UPDATE academy_term_progress SET tenant_id = 'tecpey' WHERE tenant_id IS NULL;
UPDATE academy_term_progress SET workspace_id = 'main' WHERE workspace_id IS NULL;

ALTER TABLE academy_term_progress
  DROP CONSTRAINT IF EXISTS academy_term_progress_tenant_id_check;
ALTER TABLE academy_term_progress
  ADD CONSTRAINT academy_term_progress_tenant_id_check
  CHECK (tenant_id ~ '^[a-z][a-z0-9-]{2,63}$');

ALTER TABLE academy_term_progress
  DROP CONSTRAINT IF EXISTS academy_term_progress_workspace_id_check;
ALTER TABLE academy_term_progress
  ADD CONSTRAINT academy_term_progress_workspace_id_check
  CHECK (workspace_id ~ '^[a-z][a-z0-9-]{2,63}$');

ALTER TABLE academy_term_progress
  DROP CONSTRAINT IF EXISTS academy_term_progress_tenant_fk;
ALTER TABLE academy_term_progress
  ADD CONSTRAINT academy_term_progress_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS academy_term_progress_tenant_student_term_locale_idx
  ON academy_term_progress (tenant_id, workspace_id, student_id, term_number, locale);

DROP INDEX IF EXISTS uq_academy_term_progress_student_term_locale;

CREATE INDEX IF NOT EXISTS academy_term_progress_tenant_student_idx
  ON academy_term_progress (tenant_id, workspace_id, student_id, locale, term_number);
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runAcademyTermProgressTenantMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ACADEMY_TERM_PROGRESS_TENANT_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-academy-term-progress-tenant] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-academy-term-progress-tenant] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_TERM_PROGRESS_TENANT_SQL);
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
