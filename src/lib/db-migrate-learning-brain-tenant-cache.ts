import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0057_learning_brain_tenant_cache.sql";

// Tenant-scope the derived Academy brain caches. The learning_events reads were
// already tenant-filtered, but their derived cache tables were still keyed only
// by student_id, so two tenants could overwrite one student's cached brain.
export const LEARNING_BRAIN_TENANT_CACHE_SQL = `
ALTER TABLE learning_brain_profiles ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tecpey';
ALTER TABLE notification_brain_snapshots ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tecpey';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'learning_brain_profiles'::regclass
       AND conname = 'learning_brain_profiles_pkey'
  ) AND NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a1 ON a1.attrelid = c.conrelid AND a1.attnum = ANY(c.conkey) AND a1.attname = 'tenant_id'
     WHERE c.conrelid = 'learning_brain_profiles'::regclass
       AND c.conname = 'learning_brain_profiles_pkey'
  ) THEN
    ALTER TABLE learning_brain_profiles DROP CONSTRAINT learning_brain_profiles_pkey;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'learning_brain_profiles'::regclass
       AND conname = 'learning_brain_profiles_pkey'
  ) THEN
    ALTER TABLE learning_brain_profiles
      ADD CONSTRAINT learning_brain_profiles_pkey PRIMARY KEY (tenant_id, student_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'notification_brain_snapshots'::regclass
       AND conname = 'notification_brain_snapshots_pkey'
  ) AND NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a1 ON a1.attrelid = c.conrelid AND a1.attnum = ANY(c.conkey) AND a1.attname = 'tenant_id'
     WHERE c.conrelid = 'notification_brain_snapshots'::regclass
       AND c.conname = 'notification_brain_snapshots_pkey'
  ) THEN
    ALTER TABLE notification_brain_snapshots DROP CONSTRAINT notification_brain_snapshots_pkey;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'notification_brain_snapshots'::regclass
       AND conname = 'notification_brain_snapshots_pkey'
  ) THEN
    ALTER TABLE notification_brain_snapshots
      ADD CONSTRAINT notification_brain_snapshots_pkey PRIMARY KEY (tenant_id, student_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS learning_brain_profiles_student_idx
  ON learning_brain_profiles(student_id);

CREATE INDEX IF NOT EXISTS notification_brain_snapshots_student_idx
  ON notification_brain_snapshots(student_id);
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runLearningBrainTenantCacheMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(LEARNING_BRAIN_TENANT_CACHE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-learning-brain-tenant-cache] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-learning-brain-tenant-cache] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(LEARNING_BRAIN_TENANT_CACHE_SQL);
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
