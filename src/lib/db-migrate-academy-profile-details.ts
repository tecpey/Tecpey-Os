import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0100_academy_profile_details.sql";

export const ACADEMY_PROFILE_DETAILS_SQL = `
ALTER TABLE academy_students
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT;

ALTER TABLE academy_students
  DROP CONSTRAINT IF EXISTS academy_students_gender_check;
ALTER TABLE academy_students
  ADD CONSTRAINT academy_students_gender_check
  CHECK (
    gender IS NULL OR gender IN ('female', 'male', 'nonbinary', 'prefer_not_to_say')
  );

ALTER TABLE academy_students
  DROP CONSTRAINT IF EXISTS academy_students_birth_date_floor_check;
ALTER TABLE academy_students
  ADD CONSTRAINT academy_students_birth_date_floor_check
  CHECK (birth_date IS NULL OR birth_date >= DATE '1900-01-01');

ALTER TABLE academy_students
  DROP CONSTRAINT IF EXISTS academy_students_country_length_check;
ALTER TABLE academy_students
  ADD CONSTRAINT academy_students_country_length_check
  CHECK (country IS NULL OR char_length(country) BETWEEN 2 AND 80);
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runAcademyProfileDetailsMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ACADEMY_PROFILE_DETAILS_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-academy-profile-details] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_PROFILE_DETAILS_SQL);
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
