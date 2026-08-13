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
// So the uniqueness boundary has to move with the row. Ownership of existing
// certificates is derived from the passed term progress that gated their
// issuance rather than assumed to be the default tenant; see the SQL below.
//
// The workspace is bound as a composite pair rather than only by regex, the way
// platform_memberships, platform_principal_bindings, platform_tenant_domains and
// admin_users already bind it: a syntactically valid workspace owned by another
// tenant would otherwise be accepted.

export const ACADEMY_CERTIFICATE_TENANT_SQL = `
-- Added nullable and without a default on purpose. Defaulting every existing row
-- to the default tenant would misattribute any certificate a non-default tenant
-- issued between migration 0067 (which first made issuance work at all) and this
-- one: the issuing tenant would stop finding its own certificate and mint a
-- duplicate, while a default-tenant request for the same student and term could
-- be handed the misattributed row — recreating the disclosure this migration
-- exists to close. Ownership is derived from evidence below instead.
--
-- Leaving the columns without a default afterwards is also deliberate: the only
-- writer always supplies the pair, and a default would let a future tenant-blind
-- insert land silently in the default tenant rather than failing.
ALTER TABLE academy_certificates
  ADD COLUMN IF NOT EXISTS tenant_id TEXT;

ALTER TABLE academy_certificates
  ADD COLUMN IF NOT EXISTS workspace_id TEXT;

-- issueCertificate can only mint a certificate for a term the student passed in
-- the issuing tenant, so a passed academy_term_progress row IS the issuance
-- evidence. Where exactly one tenant holds that evidence, it is the owner. This
-- also covers every pre-0066 certificate, because migration 0066 attributed
-- legacy progress to the default tenant.
UPDATE academy_certificates c
   SET tenant_id = evidence.tenant_id,
       workspace_id = evidence.workspace_id
  FROM (
    SELECT p.student_id,
           p.term_number,
           MIN(p.tenant_id) AS tenant_id,
           MIN(p.workspace_id) AS workspace_id
      FROM academy_term_progress p
     WHERE p.status = 'passed'
     GROUP BY p.student_id, p.term_number
    HAVING COUNT(DISTINCT (p.tenant_id, p.workspace_id)) = 1
  ) AS evidence
 WHERE c.tenant_id IS NULL
   AND c.student_id = evidence.student_id
   AND c.term_number = evidence.term_number;

-- Anything still unattributed but holding passed progress in more than one
-- tenant cannot be resolved from evidence, and neither available guess is
-- acceptable: assigning it hands one tenant's certificate to another, and
-- quarantining it by status breaks verification for whoever already holds it
-- (/verify requires status = 'verified' AND revoked_at IS NULL). Fail loudly and
-- name the rows so an operator decides. On a single-tenant deployment this
-- condition cannot arise.
DO $$
DECLARE
  ambiguous_ids TEXT;
BEGIN
  SELECT string_agg(c.id, ', ' ORDER BY c.id)
    INTO ambiguous_ids
    FROM academy_certificates c
   WHERE c.tenant_id IS NULL
     AND EXISTS (
       SELECT 1 FROM academy_term_progress p
        WHERE p.student_id = c.student_id
          AND p.term_number = c.term_number
          AND p.status = 'passed'
     );
  IF ambiguous_ids IS NOT NULL THEN
    RAISE EXCEPTION
      'academy_certificates ownership is ambiguous for: %. These students passed the same term in more than one tenant, so the issuing tenant cannot be derived. Set tenant_id/workspace_id on these rows from your issuance records, then re-run.',
      ambiguous_ids;
  END IF;
END $$;

-- What remains has no passed progress in any tenant, so no tenant could have
-- issued it through the gate. It predates the gate and belongs to the original
-- single-tenant deployment.
UPDATE academy_certificates
   SET tenant_id = COALESCE(tenant_id, 'tecpey'),
       workspace_id = COALESCE(workspace_id, 'main')
 WHERE tenant_id IS NULL OR workspace_id IS NULL;

ALTER TABLE academy_certificates ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE academy_certificates ALTER COLUMN workspace_id SET NOT NULL;

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
