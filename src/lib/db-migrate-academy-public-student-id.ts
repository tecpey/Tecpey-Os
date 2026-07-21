import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0048_academy_public_student_id_authority.sql";

export const ACADEMY_PUBLIC_STUDENT_ID_SQL = `
ALTER TABLE academy_students
  ADD COLUMN IF NOT EXISTS public_student_id TEXT;

UPDATE academy_students
   SET public_student_id = 'TP-STD-' || upper(replace(id::text, '-', ''))
 WHERE public_student_id IS NULL
    OR btrim(public_student_id) = '';

ALTER TABLE academy_students
  ALTER COLUMN public_student_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS academy_students_public_student_id_unique
  ON academy_students (public_student_id);

CREATE OR REPLACE FUNCTION tecpey_reject_public_student_id_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.public_student_id IS DISTINCT FROM OLD.public_student_id THEN
    RAISE EXCEPTION 'academy public student identity is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_students_public_id_immutable
  ON academy_students;
CREATE TRIGGER academy_students_public_id_immutable
BEFORE UPDATE ON academy_students
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_public_student_id_change();

CREATE OR REPLACE FUNCTION tecpey_assign_public_student_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.public_student_id IS NULL OR btrim(NEW.public_student_id) = '' THEN
    NEW.public_student_id := 'TP-STD-' || upper(replace(NEW.id::text, '-', ''));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_students_assign_public_id
  ON academy_students;
CREATE TRIGGER academy_students_assign_public_id
BEFORE INSERT ON academy_students
FOR EACH ROW EXECUTE FUNCTION tecpey_assign_public_student_id();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runAcademyPublicStudentIdMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(ACADEMY_PUBLIC_STUDENT_ID_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-academy-public-student-id] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_PUBLIC_STUDENT_ID_SQL);
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
