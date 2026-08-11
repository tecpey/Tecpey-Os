import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0059_community_profile_tenant_primary_key.sql";

// academy_public_profiles started as a single-tenant table keyed by student_id.
// After tenant/profile consent hardening, public_profile_id is the durable row
// identity and (tenant_id, workspace_id, principal_type, principal_id) scopes
// ownership. Drop the legacy student-only primary key so the same student can
// have independent profiles in multiple tenants.
export const COMMUNITY_PROFILE_TENANT_PRIMARY_KEY_SQL = `
DO $$
DECLARE
  primary_key_columns TEXT[];
BEGIN
  SELECT ARRAY_AGG(attribute.attname ORDER BY key.ordinality)
    INTO primary_key_columns
    FROM pg_constraint constraint_row
    JOIN UNNEST(constraint_row.conkey) WITH ORDINALITY AS key(attnum, ordinality)
      ON TRUE
    JOIN pg_attribute attribute
      ON attribute.attrelid = constraint_row.conrelid
     AND attribute.attnum = key.attnum
   WHERE constraint_row.conrelid = 'academy_public_profiles'::regclass
     AND constraint_row.contype = 'p'
     AND constraint_row.conname = 'academy_public_profiles_pkey';

  IF primary_key_columns = ARRAY['student_id']::TEXT[] THEN
    ALTER TABLE academy_public_profiles DROP CONSTRAINT academy_public_profiles_pkey;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'academy_public_profiles'::regclass
       AND contype = 'p'
       AND conname = 'academy_public_profiles_pkey'
  ) THEN
    ALTER TABLE academy_public_profiles
      ADD CONSTRAINT academy_public_profiles_pkey PRIMARY KEY (public_profile_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS academy_public_profiles_student_idx
  ON academy_public_profiles(student_id);
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runCommunityProfileTenantPrimaryKeyMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(COMMUNITY_PROFILE_TENANT_PRIMARY_KEY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-community-profile-tenant-primary-key] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-community-profile-tenant-primary-key] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(COMMUNITY_PROFILE_TENANT_PRIMARY_KEY_SQL);
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
