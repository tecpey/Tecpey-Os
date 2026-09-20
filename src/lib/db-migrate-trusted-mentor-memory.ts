import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0110_trusted_mentor_memory_contract.sql";

export const TRUSTED_MENTOR_MEMORY_SQL = `
ALTER TABLE mentor_memories
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS trust_level TEXT,
  ADD COLUMN IF NOT EXISTS source_reference TEXT,
  ADD COLUMN IF NOT EXISTS evidence_hash TEXT,
  ADD COLUMN IF NOT EXISTS policy_version TEXT,
  ADD COLUMN IF NOT EXISTS retention_class TEXT,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

UPDATE mentor_memories
   SET source_type = COALESCE(source_type, 'legacy_unknown'),
       trust_level = COALESCE(trust_level, 'unverified'),
       policy_version = COALESCE(policy_version, 'mentor-memory-v1'),
       retention_class = COALESCE(retention_class, 'legacy_unverified_90d'),
       expires_at = COALESCE(expires_at, NOW() + INTERVAL '90 days')
 WHERE source_type IS NULL
    OR trust_level IS NULL
    OR policy_version IS NULL
    OR retention_class IS NULL
    OR expires_at IS NULL;

ALTER TABLE mentor_memories
  ALTER COLUMN source_type SET DEFAULT 'user_asserted',
  ALTER COLUMN source_type SET NOT NULL,
  ALTER COLUMN trust_level SET DEFAULT 'asserted',
  ALTER COLUMN trust_level SET NOT NULL,
  ALTER COLUMN policy_version SET DEFAULT 'mentor-memory-v1',
  ALTER COLUMN policy_version SET NOT NULL,
  ALTER COLUMN retention_class SET DEFAULT 'user_asserted_90d',
  ALTER COLUMN retention_class SET NOT NULL;

ALTER TABLE mentor_memories
  DROP CONSTRAINT IF EXISTS mentor_memories_source_type_check,
  ADD CONSTRAINT mentor_memories_source_type_check
    CHECK (source_type IN ('legacy_unknown', 'user_asserted', 'academy_verified', 'arena_verified', 'mentor_inferred', 'admin_curated')),
  DROP CONSTRAINT IF EXISTS mentor_memories_trust_level_check,
  ADD CONSTRAINT mentor_memories_trust_level_check
    CHECK (trust_level IN ('unverified', 'asserted', 'inferred', 'verified', 'authoritative')),
  DROP CONSTRAINT IF EXISTS mentor_memories_evidence_hash_check,
  ADD CONSTRAINT mentor_memories_evidence_hash_check
    CHECK (evidence_hash IS NULL OR evidence_hash ~ '^[0-9a-f]{64}$'),
  DROP CONSTRAINT IF EXISTS mentor_memories_retention_class_check,
  ADD CONSTRAINT mentor_memories_retention_class_check
    CHECK (retention_class IN ('legacy_unverified_90d', 'user_asserted_90d', 'verified_learning_365d', 'verified_behavioral_180d', 'admin_governed')),
  DROP CONSTRAINT IF EXISTS mentor_memories_authority_provenance_check,
  ADD CONSTRAINT mentor_memories_authority_provenance_check
    CHECK (
      trust_level NOT IN ('verified', 'authoritative')
      OR (
        source_type IN ('academy_verified', 'arena_verified', 'admin_curated')
        AND evidence_hash IS NOT NULL
        AND source_reference IS NOT NULL
      )
    );

CREATE INDEX IF NOT EXISTS mentor_memories_active_context_idx
  ON mentor_memories (student_id, importance DESC, created_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS mentor_memories_trust_expiry_idx
  ON mentor_memories (trust_level, expires_at, id)
  WHERE revoked_at IS NULL;
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runTrustedMentorMemoryMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(TRUSTED_MENTOR_MEMORY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-trusted-mentor-memory] checksum mismatch for ${FILENAME}`);
    }
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(TRUSTED_MENTOR_MEMORY_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
