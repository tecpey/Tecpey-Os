import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0067_academy_certificate_contract.sql";

// academy_certificates was created with (id, student_id, term_number,
// display_name, issued_at, anchor_hash, revoked_at) and never migrated further,
// but src/lib/academy-certificates.ts issues certificates against a different
// shape entirely. issueCertificate selects `status = 'verified'` and inserts
// public_student_id, student_name, course_title, score, level_title and
// verification_hash — none of which existed. On any correctly migrated database
// issuance failed at the first statement with `column "status" does not exist`,
// so POST /api/academy-certificates could only ever answer 500.
//
// This is the same class of drift that migration 0056 closed for
// achievement_catalog: the reader and the schema were written against different
// contracts and no test drove the real path against a real database.
//
// display_name also loses its NOT NULL: the writer never supplies it, and
// student_name carries that value for rows this code path creates. Existing
// rows keep their display_name and have it copied into student_name so reads
// stay coherent.

export const ACADEMY_CERTIFICATE_CONTRACT_SQL = `
ALTER TABLE academy_certificates ADD COLUMN IF NOT EXISTS public_student_id TEXT;
ALTER TABLE academy_certificates ADD COLUMN IF NOT EXISTS student_name TEXT;
ALTER TABLE academy_certificates ADD COLUMN IF NOT EXISTS course_title TEXT;
ALTER TABLE academy_certificates ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE academy_certificates ADD COLUMN IF NOT EXISTS level_title TEXT;
ALTER TABLE academy_certificates ADD COLUMN IF NOT EXISTS verification_hash TEXT;
ALTER TABLE academy_certificates ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'verified';

-- The column default cannot see revoked_at, so a legacy revoked certificate
-- would arrive here marked 'verified'. issueCertificate looks for an existing
-- row by status alone and would hand that revoked certificate back, while
-- /verify rejects it (it checks revoked_at separately) — leaving the student
-- unable to obtain a usable certificate. Derive the real status instead.
UPDATE academy_certificates SET status = 'revoked' WHERE revoked_at IS NOT NULL AND status <> 'revoked';

ALTER TABLE academy_certificates ALTER COLUMN display_name DROP NOT NULL;

UPDATE academy_certificates
   SET student_name = display_name
 WHERE student_name IS NULL
   AND display_name IS NOT NULL;

ALTER TABLE academy_certificates
  DROP CONSTRAINT IF EXISTS academy_certificates_status_check;
ALTER TABLE academy_certificates
  ADD CONSTRAINT academy_certificates_status_check
  CHECK (status IN ('verified', 'revoked'));

-- issueCertificate checks for an existing certificate and then inserts without
-- holding a lock, and the route runs on withDb rather than a serializing
-- transaction, so two concurrent first-time requests could both see no row and
-- both issue. A unique partial index makes that impossible; the writer below
-- turns the resulting conflict into a replay of the winning certificate.
--
-- No duplicate can exist today: issueCertificate is the only writer to this
-- table and it has never completed against a migrated schema. If a deployment
-- somehow holds duplicates, this statement fails loudly and names the index,
-- which is the right outcome — silently revoking one of a student's
-- certificates to force the index through would be worse.
CREATE UNIQUE INDEX IF NOT EXISTS academy_certificates_active_term_idx
  ON academy_certificates (student_id, term_number)
  WHERE status = 'verified';

CREATE INDEX IF NOT EXISTS academy_certificates_student_term_idx
  ON academy_certificates (student_id, term_number, status);
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runAcademyCertificateContractMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ACADEMY_CERTIFICATE_CONTRACT_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-academy-certificate-contract] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-academy-certificate-contract] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_CERTIFICATE_CONTRACT_SQL);
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
