import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0081_certificate_share_events_tenant.sql";

// certificate_share_events records a share of a certificate. Its certificate_id
// names a row in academy_certificates, which migration 0070 made tenant-scoped,
// so the share's tenant is DERIVED from that parent rather than invented. Until
// now certificate_id was an unbound TEXT column and the table carried no tenant
// boundary, so a share event could be read across tenants and a dangling
// certificate_id could linger with no owning certificate at all.
//
// The tenant/workspace are denormalised onto the child and then bound to the
// parent as a composite foreign key — the isolation model the withdrawal
// evidence tables already use. Binding (certificate_id, tenant_id, workspace_id)
// to academy_certificates(id, tenant_id, workspace_id) makes it structurally
// impossible for a share event's tenant to diverge from its certificate's, and
// binds certificate_id itself for the first time.

export const CERTIFICATE_SHARE_EVENTS_TENANT_SQL = `
-- Nullable and without a default on purpose: the tenant is derived from the
-- parent certificate below, and leaving no default afterwards stops a future
-- tenant-blind insert from landing silently in the wrong tenant.
ALTER TABLE certificate_share_events
  ADD COLUMN IF NOT EXISTS tenant_id TEXT;

ALTER TABLE certificate_share_events
  ADD COLUMN IF NOT EXISTS workspace_id TEXT;

-- Derive the tenant from the parent certificate. academy_certificates.id is the
-- primary key, so the (tenant_id, workspace_id) it names is unambiguous.
UPDATE certificate_share_events s
   SET tenant_id = c.tenant_id,
       workspace_id = c.workspace_id
  FROM academy_certificates c
 WHERE c.id = s.certificate_id
   AND s.tenant_id IS NULL;

-- Any share event whose certificate_id names no certificate is a dangling
-- reference with no derivable tenant. certificate_id was never FK-bound, so these
-- can exist; the composite foreign key added below (ON DELETE CASCADE) is the
-- lifecycle they should already have followed. Remove them before binding, so the
-- FK can be added without rejecting rows that reference nothing.
DELETE FROM certificate_share_events s
 WHERE NOT EXISTS (
   SELECT 1 FROM academy_certificates c WHERE c.id = s.certificate_id
 );

ALTER TABLE certificate_share_events ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE certificate_share_events ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE certificate_share_events
  DROP CONSTRAINT IF EXISTS certificate_share_events_tenant_id_check;
ALTER TABLE certificate_share_events
  ADD CONSTRAINT certificate_share_events_tenant_id_check
  CHECK (tenant_id ~ '^[a-z][a-z0-9-]{2,63}$');

ALTER TABLE certificate_share_events
  DROP CONSTRAINT IF EXISTS certificate_share_events_workspace_id_check;
ALTER TABLE certificate_share_events
  ADD CONSTRAINT certificate_share_events_workspace_id_check
  CHECK (workspace_id ~ '^[a-z][a-z0-9-]{2,63}$');

-- The parent needs a unique constraint on the exact (id, tenant_id, workspace_id)
-- triple so the child can reference it. id is already the primary key, so the
-- triple is trivially unique — this only exposes it as a referenceable key.
ALTER TABLE academy_certificates
  DROP CONSTRAINT IF EXISTS academy_certificates_id_tenant_key;
ALTER TABLE academy_certificates
  ADD CONSTRAINT academy_certificates_id_tenant_key
  UNIQUE (id, tenant_id, workspace_id);

-- Bind certificate_id AND the derived tenant to the parent as one composite key.
-- A share event's tenant can no longer diverge from its certificate's, and the
-- cascade gives the share events the parent's lifecycle.
ALTER TABLE certificate_share_events
  DROP CONSTRAINT IF EXISTS certificate_share_events_certificate_tenant_fk;
ALTER TABLE certificate_share_events
  ADD CONSTRAINT certificate_share_events_certificate_tenant_fk
  FOREIGN KEY (certificate_id, tenant_id, workspace_id)
  REFERENCES academy_certificates (id, tenant_id, workspace_id) ON DELETE CASCADE;

-- Bind the tenant/workspace to the platform tables too, the way the parent and
-- the other tenant-scoped tables do, so a syntactically valid but non-existent
-- tenant or a workspace owned by another tenant is rejected.
ALTER TABLE certificate_share_events
  DROP CONSTRAINT IF EXISTS certificate_share_events_tenant_fk;
ALTER TABLE certificate_share_events
  ADD CONSTRAINT certificate_share_events_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE RESTRICT;

ALTER TABLE certificate_share_events
  DROP CONSTRAINT IF EXISTS certificate_share_events_tenant_workspace_fk;
ALTER TABLE certificate_share_events
  ADD CONSTRAINT certificate_share_events_tenant_workspace_fk
  FOREIGN KEY (tenant_id, workspace_id)
  REFERENCES platform_workspaces (tenant_id, id) ON DELETE RESTRICT;

-- The composite certificate FK binds the share's tenant to its certificate, but
-- student_id is only globally existence-checked, so a share could still name a
-- student the derived tenant has no binding for — the same principal-binding
-- invariant every other tenant-scoped student table enforces via a stu_bind_fk.
-- Bind it here too. Rows are never invented to satisfy it: a share whose tenant
-- is not bound to its student names access that tenant was never granted, so the
-- migration reports the offending pairs and stops rather than forging a binding.
-- student_id is nullable (ON DELETE SET NULL when the student is removed); a NULL
-- exempts the row under the default MATCH SIMPLE semantics, which is correct — a
-- share whose sharer is gone still belongs to its certificate's tenant.
DO $do$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(DISTINCT s.tenant_id || '/' || s.workspace_id || '/' || s.student_id::text, ', ')
    INTO offenders
    FROM certificate_share_events s
   WHERE s.student_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM platform_principal_bindings b
        WHERE b.tenant_id = s.tenant_id
          AND b.workspace_id = s.workspace_id
          AND b.principal_type = 'student'
          AND b.principal_id = s.student_id::text);
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'certificate_share_events holds rows whose tenant is not bound to their student: %. Each names a student that tenant has no binding for. Creating the missing binding would grant that tenant access it was never given, so this stops instead. Correct the rows or admit the students deliberately, then re-run.',
      offenders;
  END IF;
END $do$;

ALTER TABLE certificate_share_events
  ADD COLUMN IF NOT EXISTS student_principal_type TEXT
    GENERATED ALWAYS AS ('student') STORED,
  ADD COLUMN IF NOT EXISTS student_principal_id TEXT
    GENERATED ALWAYS AS (student_id::text) STORED;

ALTER TABLE certificate_share_events
  DROP CONSTRAINT IF EXISTS certificate_share_events_stu_bind_fk;
ALTER TABLE certificate_share_events
  ADD CONSTRAINT certificate_share_events_stu_bind_fk
  FOREIGN KEY (tenant_id, workspace_id, student_principal_type, student_principal_id)
  REFERENCES platform_principal_bindings
    (tenant_id, workspace_id, principal_type, principal_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS certificate_share_events_tenant_idx
  ON certificate_share_events (tenant_id, workspace_id, certificate_id);
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runCertificateShareEventsTenantMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(CERTIFICATE_SHARE_EVENTS_TENANT_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-certificate-share-events-tenant] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-certificate-share-events-tenant] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(CERTIFICATE_SHARE_EVENTS_TENANT_SQL);
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
