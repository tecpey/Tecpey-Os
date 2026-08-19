import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0085_active_principal_binding_enforcement.sql";

// Every tenant-scoped table that names a principal binds
// (tenant_id, workspace_id, principal_type, principal_id) to
// platform_principal_bindings by a composite foreign key. That foreign key
// proves the pairing EXISTS; it cannot prove the binding is still 'active',
// because a foreign key references a plain unique key and Postgres has no
// "reference only active rows" clause. So a revoked student could still have new
// rows written under a binding that has been turned off — revocation was left an
// application concern (see db-migrate-student-tenant-binding-integrity).
//
// This closes that gap at the database. A shared constraint trigger requires an
// ACTIVE binding at write time, on every table that carries such a foreign key,
// discovered from the catalog so the family cannot drift. Design choices that
// keep it from breaking legitimate flows:
//
//   * It fires IMMEDIATELY (at the end of the writing statement), not deferred to
//     commit. Enforcing at write time is what the requirement asks for, and it
//     sidesteps three sharp edges a deferred constraint trigger has: a deferred
//     event still fires for a row inserted and then deleted in the same
//     transaction (unlike a referential-integrity key, which is optimised for
//     that) — the case that matters here, where the academy_students insert
//     auto-creates a default community profile in the default tenant that
//     onboarding then deletes and re-homes; a deferred event aborts an entire
//     batch at commit if any single row is bad; and a pending deferred event
//     blocks ALTER TABLE. The auto-binding trigger on academy_students runs
//     before the profile/consent triggers, so by the time any child row is
//     written its active binding already exists and the immediate check passes.
//   * It fires on INSERT, and on UPDATE only when the binding key actually
//     changes — mirroring foreign-key re-check semantics. Updating any other
//     column of an existing row whose binding was later revoked is NOT blocked,
//     so a revoked principal's records stay administratively editable.
//   * Existing rows are never re-validated; only new writes are gated. Revoking a
//     binding does not retroactively reject data already written.
//
// A NULL principal id (e.g. certificate_share_events.student_id after ON DELETE
// SET NULL) names no principal, so there is nothing to enforce — matching the
// foreign key's MATCH SIMPLE semantics.

export const ACTIVE_PRINCIPAL_BINDING_ENFORCEMENT_SQL = `
CREATE OR REPLACE FUNCTION tecpey_require_active_principal_binding()
RETURNS trigger AS $fn$
DECLARE
  new_row jsonb := to_jsonb(NEW);
  old_row jsonb;
  v_tenant text := new_row->>'tenant_id';
  v_workspace text := new_row->>'workspace_id';
  -- The stu_bind_fk family projects the principal as generated
  -- student_principal_type/id columns; the rest carry principal_type/id directly.
  v_ptype text := COALESCE(new_row->>'student_principal_type', new_row->>'principal_type');
  v_pid text := COALESCE(new_row->>'student_principal_id', new_row->>'principal_id');
BEGIN
  -- If any binding-key column is NULL the composite foreign key is not enforced
  -- either (MATCH SIMPLE), so there is nothing to check — e.g. a share event whose
  -- student_id was set NULL on delete, or a row observed before its tenant columns
  -- exist during a migration replay.
  IF v_tenant IS NULL OR v_workspace IS NULL OR v_ptype IS NULL OR v_pid IS NULL THEN
    RETURN NULL;
  END IF;

  -- On UPDATE, only re-validate when the binding key changed, exactly as a
  -- foreign key would. This keeps ordinary updates to an existing row — including
  -- one whose binding was revoked after it was written — from being rejected.
  IF TG_OP = 'UPDATE' THEN
    old_row := to_jsonb(OLD);
    IF v_tenant IS NOT DISTINCT FROM (old_row->>'tenant_id')
       AND v_workspace IS NOT DISTINCT FROM (old_row->>'workspace_id')
       AND v_ptype IS NOT DISTINCT FROM COALESCE(old_row->>'student_principal_type', old_row->>'principal_type')
       AND v_pid IS NOT DISTINCT FROM COALESCE(old_row->>'student_principal_id', old_row->>'principal_id')
    THEN
      RETURN NULL;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM platform_principal_bindings b
     WHERE b.tenant_id = v_tenant
       AND b.workspace_id = v_workspace
       AND b.principal_type = v_ptype
       AND b.principal_id = v_pid
       AND b.status = 'active'
  ) THEN
    RAISE EXCEPTION
      'no active % binding for principal % in tenant %/% — write rejected',
      v_ptype, v_pid, v_tenant, v_workspace
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql;

-- Attach the guard to every table that already binds to
-- platform_principal_bindings, discovered from the catalog so no member of the
-- family is missed and the list cannot drift out of sync with the schema.
DO $do$
DECLARE
  child text;
BEGIN
  FOR child IN
    SELECT DISTINCT c.conrelid::regclass::text
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.confrelid = 'platform_principal_bindings'::regclass
     ORDER BY 1
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS tecpey_active_binding_guard ON %s', child);
    EXECUTE format(
      'CREATE CONSTRAINT TRIGGER tecpey_active_binding_guard '
      'AFTER INSERT OR UPDATE ON %s '
      'FOR EACH ROW EXECUTE FUNCTION tecpey_require_active_principal_binding()',
      child);
  END LOOP;
END $do$;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runActivePrincipalBindingEnforcementMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(ACTIVE_PRINCIPAL_BINDING_ENFORCEMENT_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-active-principal-binding-enforcement] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-active-principal-binding-enforcement] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(ACTIVE_PRINCIPAL_BINDING_ENFORCEMENT_SQL);
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
