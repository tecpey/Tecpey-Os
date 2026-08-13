import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0073_student_tenant_binding_integrity.sql";

// A tenant-scoped row could name a student that tenant was never admitted.
//
// Fourteen tables carry (tenant_id, workspace_id, student_id) and a plain
// foreign key to academy_students. Each half was checked and the pair was not:
// the tenant exists, the student exists, and nothing asked whether that tenant
// has any claim to that student. Reproduced against a migrated database before
// this migration — an academy_certificates row naming tenant A and a student
// bound only to tenant B inserted without complaint.
//
// Six of those fourteen were already protected, which a first draft of this
// migration missed. Migrations 0046 and 0048 gave learning_events,
// offline_sync_commands, academy_public_profiles and the three community tables
// the identical foreign key, with principal_type and principal_id pinned to the
// student by CHECK or by generation. Adding a second copy would have rewritten
// those tables for nothing — and worse, four of the six are DEFERRABLE
// INITIALLY DEFERRED, so a non-deferrable duplicate would have started
// rejecting transactions that insert the row before its binding and commit both
// together. Only the eight genuinely unprotected tables are touched here, and
// their constraints match the deferrability of the ones already in place.
//
// The obvious fix is the wrong one. Giving academy_students a tenant_id would
// say a student belongs to exactly one tenant, and the model deliberately says
// otherwise: platform_principal_bindings admits one student into several
// tenants, and the tenant resolution built in #422 ranks among them. A column
// on the student would break the learner who studies at two white-label
// academies.
//
// So the binding table is the authority, and each row is tied to it by a
// composite foreign key. principal_id is TEXT and student_id is UUID, and the
// key needs a constant 'student', so both are projected as generated columns —
// stored, immutable, and not writable by any caller.
//
// What this does and does not enforce: a foreign key can see that a binding row
// exists, not that its status is still 'active'. Revocation stays an application
// concern, as it already is. What is closed is the case where a tenant names a
// student it was never bound to at all.
//
// The constraint names are abbreviated deliberately. The obvious
// <table>_student_binding_fk runs to 65 characters on the longest table, and
// Postgres truncates an over-length identifier to 63 silently — the constraint
// existed under a name one character short of the one written here, which is
// the sort of quiet mismatch that makes later tooling miss it.
//
// Rows are never invented to satisfy the constraint. If a table holds a pair
// with no binding, creating one would hand that tenant access it was never
// given — the migration names the offending pairs and stops instead. On a
// database carrying this suite's data there were none, because every student is
// bound to the default tenant by tecpey_bind_default_student_principal at
// creation.

export const STUDENT_TENANT_BINDING_INTEGRITY_SQL = `
-- academy_certificates
DO $do$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(DISTINCT c.tenant_id || '/' || c.workspace_id || '/' || c.student_id::text, ', ')
    INTO offenders
    FROM academy_certificates c
   WHERE c.student_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM platform_principal_bindings b
        WHERE b.tenant_id = c.tenant_id
          AND b.workspace_id = c.workspace_id
          AND b.principal_type = 'student'
          AND b.principal_id = c.student_id::text);
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'academy_certificates holds rows whose tenant is not bound to their student: %. Each names a student that tenant has no binding for. Creating the missing binding would grant that tenant access it was never given, so this stops instead. Correct the rows or admit the students deliberately, then re-run.',
      offenders;
  END IF;
END $do$;

-- Both projections in one statement: a stored generated column is computed for
-- every existing row, so two ALTERs would rewrite the table twice under an
-- exclusive lock.
ALTER TABLE academy_certificates
  ADD COLUMN IF NOT EXISTS student_principal_type TEXT
    GENERATED ALWAYS AS ('student') STORED,
  ADD COLUMN IF NOT EXISTS student_principal_id TEXT
    GENERATED ALWAYS AS (student_id::text) STORED;

ALTER TABLE academy_certificates
  DROP CONSTRAINT IF EXISTS academy_certificates_stu_bind_fk;
ALTER TABLE academy_certificates
  ADD CONSTRAINT academy_certificates_stu_bind_fk
  FOREIGN KEY (tenant_id, workspace_id, student_principal_type, student_principal_id)
  REFERENCES platform_principal_bindings
    (tenant_id, workspace_id, principal_type, principal_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


-- academy_learning_commands
DO $do$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(DISTINCT c.tenant_id || '/' || c.workspace_id || '/' || c.student_id::text, ', ')
    INTO offenders
    FROM academy_learning_commands c
   WHERE c.student_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM platform_principal_bindings b
        WHERE b.tenant_id = c.tenant_id
          AND b.workspace_id = c.workspace_id
          AND b.principal_type = 'student'
          AND b.principal_id = c.student_id::text);
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'academy_learning_commands holds rows whose tenant is not bound to their student: %. Each names a student that tenant has no binding for. Creating the missing binding would grant that tenant access it was never given, so this stops instead. Correct the rows or admit the students deliberately, then re-run.',
      offenders;
  END IF;
END $do$;

-- Both projections in one statement: a stored generated column is computed for
-- every existing row, so two ALTERs would rewrite the table twice under an
-- exclusive lock.
ALTER TABLE academy_learning_commands
  ADD COLUMN IF NOT EXISTS student_principal_type TEXT
    GENERATED ALWAYS AS ('student') STORED,
  ADD COLUMN IF NOT EXISTS student_principal_id TEXT
    GENERATED ALWAYS AS (student_id::text) STORED;

ALTER TABLE academy_learning_commands
  DROP CONSTRAINT IF EXISTS academy_learning_commands_stu_bind_fk;
ALTER TABLE academy_learning_commands
  ADD CONSTRAINT academy_learning_commands_stu_bind_fk
  FOREIGN KEY (tenant_id, workspace_id, student_principal_type, student_principal_id)
  REFERENCES platform_principal_bindings
    (tenant_id, workspace_id, principal_type, principal_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


-- academy_mastery_season_assignments
DO $do$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(DISTINCT c.tenant_id || '/' || c.workspace_id || '/' || c.student_id::text, ', ')
    INTO offenders
    FROM academy_mastery_season_assignments c
   WHERE c.student_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM platform_principal_bindings b
        WHERE b.tenant_id = c.tenant_id
          AND b.workspace_id = c.workspace_id
          AND b.principal_type = 'student'
          AND b.principal_id = c.student_id::text);
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'academy_mastery_season_assignments holds rows whose tenant is not bound to their student: %. Each names a student that tenant has no binding for. Creating the missing binding would grant that tenant access it was never given, so this stops instead. Correct the rows or admit the students deliberately, then re-run.',
      offenders;
  END IF;
END $do$;

-- Both projections in one statement: a stored generated column is computed for
-- every existing row, so two ALTERs would rewrite the table twice under an
-- exclusive lock.
ALTER TABLE academy_mastery_season_assignments
  ADD COLUMN IF NOT EXISTS student_principal_type TEXT
    GENERATED ALWAYS AS ('student') STORED,
  ADD COLUMN IF NOT EXISTS student_principal_id TEXT
    GENERATED ALWAYS AS (student_id::text) STORED;

ALTER TABLE academy_mastery_season_assignments
  DROP CONSTRAINT IF EXISTS academy_mastery_season_assignments_stu_bind_fk;
ALTER TABLE academy_mastery_season_assignments
  ADD CONSTRAINT academy_mastery_season_assignments_stu_bind_fk
  FOREIGN KEY (tenant_id, workspace_id, student_principal_type, student_principal_id)
  REFERENCES platform_principal_bindings
    (tenant_id, workspace_id, principal_type, principal_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


-- academy_mastery_season_progress_events
DO $do$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(DISTINCT c.tenant_id || '/' || c.workspace_id || '/' || c.student_id::text, ', ')
    INTO offenders
    FROM academy_mastery_season_progress_events c
   WHERE c.student_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM platform_principal_bindings b
        WHERE b.tenant_id = c.tenant_id
          AND b.workspace_id = c.workspace_id
          AND b.principal_type = 'student'
          AND b.principal_id = c.student_id::text);
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'academy_mastery_season_progress_events holds rows whose tenant is not bound to their student: %. Each names a student that tenant has no binding for. Creating the missing binding would grant that tenant access it was never given, so this stops instead. Correct the rows or admit the students deliberately, then re-run.',
      offenders;
  END IF;
END $do$;

-- Both projections in one statement: a stored generated column is computed for
-- every existing row, so two ALTERs would rewrite the table twice under an
-- exclusive lock.
ALTER TABLE academy_mastery_season_progress_events
  ADD COLUMN IF NOT EXISTS student_principal_type TEXT
    GENERATED ALWAYS AS ('student') STORED,
  ADD COLUMN IF NOT EXISTS student_principal_id TEXT
    GENERATED ALWAYS AS (student_id::text) STORED;

ALTER TABLE academy_mastery_season_progress_events
  DROP CONSTRAINT IF EXISTS academy_mastery_season_progress_events_stu_bind_fk;
ALTER TABLE academy_mastery_season_progress_events
  ADD CONSTRAINT academy_mastery_season_progress_events_stu_bind_fk
  FOREIGN KEY (tenant_id, workspace_id, student_principal_type, student_principal_id)
  REFERENCES platform_principal_bindings
    (tenant_id, workspace_id, principal_type, principal_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


-- academy_mastery_weakness_signals
DO $do$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(DISTINCT c.tenant_id || '/' || c.workspace_id || '/' || c.student_id::text, ', ')
    INTO offenders
    FROM academy_mastery_weakness_signals c
   WHERE c.student_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM platform_principal_bindings b
        WHERE b.tenant_id = c.tenant_id
          AND b.workspace_id = c.workspace_id
          AND b.principal_type = 'student'
          AND b.principal_id = c.student_id::text);
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'academy_mastery_weakness_signals holds rows whose tenant is not bound to their student: %. Each names a student that tenant has no binding for. Creating the missing binding would grant that tenant access it was never given, so this stops instead. Correct the rows or admit the students deliberately, then re-run.',
      offenders;
  END IF;
END $do$;

-- Both projections in one statement: a stored generated column is computed for
-- every existing row, so two ALTERs would rewrite the table twice under an
-- exclusive lock.
ALTER TABLE academy_mastery_weakness_signals
  ADD COLUMN IF NOT EXISTS student_principal_type TEXT
    GENERATED ALWAYS AS ('student') STORED,
  ADD COLUMN IF NOT EXISTS student_principal_id TEXT
    GENERATED ALWAYS AS (student_id::text) STORED;

ALTER TABLE academy_mastery_weakness_signals
  DROP CONSTRAINT IF EXISTS academy_mastery_weakness_signals_stu_bind_fk;
ALTER TABLE academy_mastery_weakness_signals
  ADD CONSTRAINT academy_mastery_weakness_signals_stu_bind_fk
  FOREIGN KEY (tenant_id, workspace_id, student_principal_type, student_principal_id)
  REFERENCES platform_principal_bindings
    (tenant_id, workspace_id, principal_type, principal_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


-- academy_student_mastery_profiles
DO $do$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(DISTINCT c.tenant_id || '/' || c.workspace_id || '/' || c.student_id::text, ', ')
    INTO offenders
    FROM academy_student_mastery_profiles c
   WHERE c.student_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM platform_principal_bindings b
        WHERE b.tenant_id = c.tenant_id
          AND b.workspace_id = c.workspace_id
          AND b.principal_type = 'student'
          AND b.principal_id = c.student_id::text);
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'academy_student_mastery_profiles holds rows whose tenant is not bound to their student: %. Each names a student that tenant has no binding for. Creating the missing binding would grant that tenant access it was never given, so this stops instead. Correct the rows or admit the students deliberately, then re-run.',
      offenders;
  END IF;
END $do$;

-- Both projections in one statement: a stored generated column is computed for
-- every existing row, so two ALTERs would rewrite the table twice under an
-- exclusive lock.
ALTER TABLE academy_student_mastery_profiles
  ADD COLUMN IF NOT EXISTS student_principal_type TEXT
    GENERATED ALWAYS AS ('student') STORED,
  ADD COLUMN IF NOT EXISTS student_principal_id TEXT
    GENERATED ALWAYS AS (student_id::text) STORED;

ALTER TABLE academy_student_mastery_profiles
  DROP CONSTRAINT IF EXISTS academy_student_mastery_profiles_stu_bind_fk;
ALTER TABLE academy_student_mastery_profiles
  ADD CONSTRAINT academy_student_mastery_profiles_stu_bind_fk
  FOREIGN KEY (tenant_id, workspace_id, student_principal_type, student_principal_id)
  REFERENCES platform_principal_bindings
    (tenant_id, workspace_id, principal_type, principal_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


-- academy_term_progress
DO $do$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(DISTINCT c.tenant_id || '/' || c.workspace_id || '/' || c.student_id::text, ', ')
    INTO offenders
    FROM academy_term_progress c
   WHERE c.student_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM platform_principal_bindings b
        WHERE b.tenant_id = c.tenant_id
          AND b.workspace_id = c.workspace_id
          AND b.principal_type = 'student'
          AND b.principal_id = c.student_id::text);
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'academy_term_progress holds rows whose tenant is not bound to their student: %. Each names a student that tenant has no binding for. Creating the missing binding would grant that tenant access it was never given, so this stops instead. Correct the rows or admit the students deliberately, then re-run.',
      offenders;
  END IF;
END $do$;

-- Both projections in one statement: a stored generated column is computed for
-- every existing row, so two ALTERs would rewrite the table twice under an
-- exclusive lock.
ALTER TABLE academy_term_progress
  ADD COLUMN IF NOT EXISTS student_principal_type TEXT
    GENERATED ALWAYS AS ('student') STORED,
  ADD COLUMN IF NOT EXISTS student_principal_id TEXT
    GENERATED ALWAYS AS (student_id::text) STORED;

ALTER TABLE academy_term_progress
  DROP CONSTRAINT IF EXISTS academy_term_progress_stu_bind_fk;
ALTER TABLE academy_term_progress
  ADD CONSTRAINT academy_term_progress_stu_bind_fk
  FOREIGN KEY (tenant_id, workspace_id, student_principal_type, student_principal_id)
  REFERENCES platform_principal_bindings
    (tenant_id, workspace_id, principal_type, principal_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


-- notification_center
DO $do$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(DISTINCT c.tenant_id || '/' || c.workspace_id || '/' || c.student_id::text, ', ')
    INTO offenders
    FROM notification_center c
   WHERE c.student_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM platform_principal_bindings b
        WHERE b.tenant_id = c.tenant_id
          AND b.workspace_id = c.workspace_id
          AND b.principal_type = 'student'
          AND b.principal_id = c.student_id::text);
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'notification_center holds rows whose tenant is not bound to their student: %. Each names a student that tenant has no binding for. Creating the missing binding would grant that tenant access it was never given, so this stops instead. Correct the rows or admit the students deliberately, then re-run.',
      offenders;
  END IF;
END $do$;

-- Both projections in one statement: a stored generated column is computed for
-- every existing row, so two ALTERs would rewrite the table twice under an
-- exclusive lock.
ALTER TABLE notification_center
  ADD COLUMN IF NOT EXISTS student_principal_type TEXT
    GENERATED ALWAYS AS ('student') STORED,
  ADD COLUMN IF NOT EXISTS student_principal_id TEXT
    GENERATED ALWAYS AS (student_id::text) STORED;

ALTER TABLE notification_center
  DROP CONSTRAINT IF EXISTS notification_center_stu_bind_fk;
ALTER TABLE notification_center
  ADD CONSTRAINT notification_center_stu_bind_fk
  FOREIGN KEY (tenant_id, workspace_id, student_principal_type, student_principal_id)
  REFERENCES platform_principal_bindings
    (tenant_id, workspace_id, principal_type, principal_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runStudentTenantBindingIntegrityMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(STUDENT_TENANT_BINDING_INTEGRITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-student-tenant-binding-integrity] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-student-tenant-binding-integrity] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(STUDENT_TENANT_BINDING_INTEGRITY_SQL);
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
