import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0060_ai_mentor_evidence_tenant_key.sql";

export const AI_MENTOR_EVIDENCE_TENANT_KEY_SQL = `
ALTER TABLE ai_mentor_request_evidence
  DROP CONSTRAINT IF EXISTS ai_mentor_request_evidence_request_id_phase_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'ai_mentor_request_evidence'::regclass
       AND conname = 'ai_mentor_request_evidence_tenant_request_phase_key'
  ) THEN
    ALTER TABLE ai_mentor_request_evidence
      ADD CONSTRAINT ai_mentor_request_evidence_tenant_request_phase_key
      UNIQUE (tenant_id, request_id, phase);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_mentor_evidence_tenant_student_idx
  ON ai_mentor_request_evidence(tenant_id, student_id, created_at DESC)
  WHERE student_id IS NOT NULL;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runAiMentorEvidenceTenantKeyMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(AI_MENTOR_EVIDENCE_TENANT_KEY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-ai-mentor-evidence-tenant-key] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-ai-mentor-evidence-tenant-key] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(AI_MENTOR_EVIDENCE_TENANT_KEY_SQL);
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
