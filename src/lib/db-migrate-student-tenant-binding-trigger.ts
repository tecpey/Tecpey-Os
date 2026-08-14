import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0074_student_tenant_binding_trigger.sql";

// The three per-student derived tables that carry a tenant but no workspace.
//
// learning_brain_profiles, notification_brain_snapshots and
// ai_mentor_request_evidence each hold data derived for one student inside one
// tenant, and each could name a student that tenant was never admitted — the
// same hole migration 0073 closed for the eight tables that carry a workspace.
//
// They are deliberately NOT given a workspace_id to reuse 0073's composite
// foreign key. Every read and write of these tables keys on (student_id,
// tenant_id) and nothing else:
//
//   phase5-achievement-engine.ts:104
//     SELECT * FROM learning_brain_profiles WHERE student_id = $1::uuid AND tenant_id = $2
//
// A learning brain profile is what the platform knows about a learner inside a
// tenant; it does not become a different profile in a different workspace.
// Adding the column would invent a dimension the domain does not have, purely so
// the foreign key idiom would fit — the schema bending to the constraint rather
// than the constraint following the schema.
//
// So the same invariant is enforced by trigger at the level the data actually
// lives at. Two triggers, because a foreign key guards both ends and a trigger
// on one table would only guard one:
//
//   - writes into these tables require a binding for (tenant_id, student_id);
//   - deleting a binding is refused while any of them still references it,
//     which is what ON DELETE RESTRICT gives the other eight.
//
// Matching 0073 exactly, the check is that a binding *exists*, not that its
// status is still 'active'. Revocation stays an application concern in both
// idioms, so the two say the same thing rather than two different things.
//
// Rows are never invented to satisfy the check: a missing binding means the row
// asserts access the tenant was never given, so the migration names the
// offending pairs and stops. All three tables were empty on a database carrying
// this suite's data.

export const STUDENT_TENANT_BINDING_TRIGGER_SQL = `
DO $do$
DECLARE
  offenders TEXT;
  target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'learning_brain_profiles',
    'notification_brain_snapshots',
    'ai_mentor_request_evidence'
  ] LOOP
    EXECUTE format(
      $q$SELECT string_agg(DISTINCT c.tenant_id || '/' || c.student_id::text, ', ')
           FROM %I c
          WHERE c.student_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM platform_principal_bindings b
               WHERE b.tenant_id = c.tenant_id
                 AND b.principal_type = 'student'
                 AND b.principal_id = c.student_id::text)$q$,
      target
    ) INTO offenders;
    IF offenders IS NOT NULL THEN
      RAISE EXCEPTION
        '% holds rows whose tenant is not bound to their student: %. Each names a student that tenant has no binding for. Creating the missing binding would grant that tenant access it was never given, so this stops instead. Correct the rows or admit the students deliberately, then re-run.',
        target, offenders;
    END IF;
  END LOOP;
END $do$;

-- Write side: a row may only name a student its tenant has admitted.
CREATE OR REPLACE FUNCTION tecpey_require_student_tenant_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.student_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM platform_principal_bindings b
     WHERE b.tenant_id = NEW.tenant_id
       AND b.principal_type = 'student'
       AND b.principal_id = NEW.student_id::text
  ) THEN
    RAISE EXCEPTION
      'tenant % is not bound to student %, so it may not hold this row',
      NEW.tenant_id, NEW.student_id
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

-- Delete side: what ON DELETE RESTRICT gives the eight tables with a workspace.
-- Without this the trigger above would guard writes while a binding could still
-- be removed out from under rows that depend on it.
CREATE OR REPLACE FUNCTION tecpey_guard_student_binding_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  dependent TEXT;
  found BOOLEAN;
BEGIN
  IF OLD.principal_type <> 'student' THEN
    RETURN OLD;
  END IF;

  -- Another binding for the same student in the same tenant still satisfies the
  -- write-side check, so this only refuses the removal of the last one.
  IF EXISTS (
    SELECT 1 FROM platform_principal_bindings b
     WHERE b.tenant_id = OLD.tenant_id
       AND b.principal_type = 'student'
       AND b.principal_id = OLD.principal_id
       AND b.workspace_id <> OLD.workspace_id
  ) THEN
    RETURN OLD;
  END IF;

  FOREACH dependent IN ARRAY ARRAY[
    'learning_brain_profiles',
    'notification_brain_snapshots',
    'ai_mentor_request_evidence'
  ] LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I c WHERE c.tenant_id = $1 AND c.student_id::text = $2)',
      dependent
    ) INTO found USING OLD.tenant_id, OLD.principal_id;
    IF found THEN
      RAISE EXCEPTION
        'student binding %/% still has rows in %',
        OLD.tenant_id, OLD.principal_id, dependent
        USING ERRCODE = '23503';
    END IF;
  END LOOP;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS learning_brain_profiles_student_binding
  ON learning_brain_profiles;
CREATE TRIGGER learning_brain_profiles_student_binding
  BEFORE INSERT OR UPDATE ON learning_brain_profiles
  FOR EACH ROW EXECUTE FUNCTION tecpey_require_student_tenant_binding();

DROP TRIGGER IF EXISTS notification_brain_snapshots_student_binding
  ON notification_brain_snapshots;
CREATE TRIGGER notification_brain_snapshots_student_binding
  BEFORE INSERT OR UPDATE ON notification_brain_snapshots
  FOR EACH ROW EXECUTE FUNCTION tecpey_require_student_tenant_binding();

DROP TRIGGER IF EXISTS ai_mentor_request_evidence_student_binding
  ON ai_mentor_request_evidence;
CREATE TRIGGER ai_mentor_request_evidence_student_binding
  BEFORE INSERT OR UPDATE ON ai_mentor_request_evidence
  FOR EACH ROW EXECUTE FUNCTION tecpey_require_student_tenant_binding();

DROP TRIGGER IF EXISTS platform_principal_bindings_student_delete_guard
  ON platform_principal_bindings;
CREATE TRIGGER platform_principal_bindings_student_delete_guard
  BEFORE DELETE ON platform_principal_bindings
  FOR EACH ROW EXECUTE FUNCTION tecpey_guard_student_binding_delete();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runStudentTenantBindingTriggerMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(STUDENT_TENANT_BINDING_TRIGGER_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-student-tenant-binding-trigger] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-student-tenant-binding-trigger] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(STUDENT_TENANT_BINDING_TRIGGER_SQL);
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
