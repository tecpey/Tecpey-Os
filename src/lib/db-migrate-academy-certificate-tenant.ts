import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0070_academy_certificate_tenant.sql";

// academy_certificates had no tenant boundary, and migration 0066 had already
// given academy_term_progress one. issueCertificate therefore gates on progress
// recorded in the issuing tenant and then looks the certificate up by
// (student_id, term_number, status) alone — the same tenant-scoped-gate behind a
// tenant-blind row that made the learning-command receipt defect (0068) real.
//
// The consequence is worse here than a duplicate. For a student who passed the
// same term in two tenants, tenant B's issuance finds tenant A's certificate and
// returns it: tenant B's response carries tenant A's certificate id, student
// name and course title, and tenant B never issues a certificate of its own. And
// academy_certificates_active_term_idx, unique on (student_id, term_number)
// where status = 'verified', makes it structurally impossible for it ever to.
//
// So the uniqueness boundary has to move with the row. Existing certificates
// belong to the default tenant, which is what the column defaults encode.
//
// The workspace is bound as a composite pair rather than only by regex, the way
// platform_memberships, platform_principal_bindings, platform_tenant_domains and
// admin_users already bind it: a syntactically valid workspace owned by another
// tenant would otherwise be accepted.

export const ACADEMY_CERTIFICATE_TENANT_SQL = `
ALTER TABLE academy_certificates
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tecpey';

ALTER TABLE academy_certificates
  ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'main';

ALTER TABLE academy_certificates
  DROP CONSTRAINT IF EXISTS academy_certificates_tenant_id_check;
ALTER TABLE academy_certificates
  ADD CONSTRAINT academy_certificates_tenant_id_check
  CHECK (tenant_id ~ '^[a-z][a-z0-9-]{2,63}$');

ALTER TABLE academy_certificates
  DROP CONSTRAINT IF EXISTS academy_certificates_workspace_id_check;
ALTER TABLE academy_certificates
  ADD CONSTRAINT academy_certificates_workspace_id_check
  CHECK (workspace_id ~ '^[a-z][a-z0-9-]{2,63}$');

ALTER TABLE academy_certificates
  DROP CONSTRAINT IF EXISTS academy_certificates_tenant_fk;
ALTER TABLE academy_certificates
  ADD CONSTRAINT academy_certificates_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE RESTRICT;

ALTER TABLE academy_certificates
  DROP CONSTRAINT IF EXISTS academy_certificates_tenant_workspace_fk;
ALTER TABLE academy_certificates
  ADD CONSTRAINT academy_certificates_tenant_workspace_fk
  FOREIGN KEY (tenant_id, workspace_id)
  REFERENCES platform_workspaces (tenant_id, id) ON DELETE RESTRICT;

-- The active-certificate boundary moves with the row. Creating the tenant-scoped
-- index before dropping the global one keeps the "one active certificate per
-- student and term" guarantee unbroken across the migration.
CREATE UNIQUE INDEX IF NOT EXISTS academy_certificates_tenant_active_term_idx
  ON academy_certificates (tenant_id, workspace_id, student_id, term_number)
  WHERE status = 'verified';

DROP INDEX IF EXISTS academy_certificates_active_term_idx;

CREATE INDEX IF NOT EXISTS academy_certificates_tenant_student_idx
  ON academy_certificates (tenant_id, workspace_id, student_id, term_number, status);
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runAcademyCertificateTenantMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ACADEMY_CERTIFICATE_TENANT_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-academy-certificate-tenant] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-academy-certificate-tenant] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_CERTIFICATE_TENANT_SQL);
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
