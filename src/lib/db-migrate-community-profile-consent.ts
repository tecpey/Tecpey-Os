import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0047_community_profile_consent_authority.sql";

export const COMMUNITY_PROFILE_CONSENT_SQL = `
ALTER TABLE academy_public_profiles
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS workspace_id TEXT,
  ADD COLUMN IF NOT EXISTS principal_type TEXT,
  ADD COLUMN IF NOT EXISTS principal_id TEXT
    GENERATED ALWAYS AS (student_id::text) STORED,
  ADD COLUMN IF NOT EXISTS public_profile_id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS leaderboard_visible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS journal_sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS instructor_review_consent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS challenge_participation BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS study_group_discovery BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consent_version TEXT NOT NULL DEFAULT 'community-profile-consent-v1',
  ADD COLUMN IF NOT EXISTS consented_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE academy_public_profiles
  ALTER COLUMN visibility SET DEFAULT 'private';

UPDATE academy_public_profiles profile
   SET tenant_id = binding.tenant_id,
       workspace_id = binding.workspace_id,
       principal_type = 'student',
       public_profile_id = COALESCE(profile.public_profile_id, gen_random_uuid()),
       visibility = 'private',
       leaderboard_visible = FALSE,
       journal_sharing_enabled = FALSE,
       instructor_review_consent = FALSE,
       challenge_participation = FALSE,
       study_group_discovery = FALSE,
       revision = 0,
       consent_version = 'community-profile-consent-v1',
       consented_at = NULL,
       updated_at = NOW()
  FROM platform_principal_bindings binding
 WHERE binding.principal_type = 'student'
   AND binding.principal_id = profile.student_id::text
   AND binding.status = 'active';

INSERT INTO academy_public_profiles
  (student_id,
   tenant_id,
   workspace_id,
   principal_type,
   public_profile_id,
   visibility,
   leaderboard_visible,
   journal_sharing_enabled,
   instructor_review_consent,
   challenge_participation,
   study_group_discovery,
   revision,
   consent_version,
   consented_at,
   created_at,
   updated_at)
SELECT
  student.id,
  binding.tenant_id,
  binding.workspace_id,
  'student',
  gen_random_uuid(),
  'private',
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  0,
  'community-profile-consent-v1',
  NULL,
  NOW(),
  NOW()
FROM academy_students student
JOIN platform_principal_bindings binding
  ON binding.principal_type = 'student'
 AND binding.principal_id = student.id::text
 AND binding.status = 'active'
ON CONFLICT (student_id) DO NOTHING;

ALTER TABLE academy_public_profiles
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN workspace_id SET NOT NULL,
  ALTER COLUMN principal_type SET NOT NULL,
  ALTER COLUMN public_profile_id SET NOT NULL,
  ALTER COLUMN visibility SET NOT NULL;

ALTER TABLE academy_public_profiles
  DROP CONSTRAINT IF EXISTS academy_public_profiles_visibility_check,
  DROP CONSTRAINT IF EXISTS academy_public_profiles_principal_type_check,
  DROP CONSTRAINT IF EXISTS academy_public_profiles_student_fk,
  DROP CONSTRAINT IF EXISTS academy_public_profiles_principal_binding_fk;

ALTER TABLE academy_public_profiles
  ADD CONSTRAINT academy_public_profiles_visibility_check
    CHECK (visibility IN ('private', 'public')),
  ADD CONSTRAINT academy_public_profiles_principal_type_check
    CHECK (principal_type = 'student'),
  ADD CONSTRAINT academy_public_profiles_student_fk
    FOREIGN KEY (student_id)
    REFERENCES academy_students(id)
    ON DELETE CASCADE,
  ADD CONSTRAINT academy_public_profiles_principal_binding_fk
    FOREIGN KEY (tenant_id, workspace_id, principal_type, principal_id)
    REFERENCES platform_principal_bindings
      (tenant_id, workspace_id, principal_type, principal_id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX IF NOT EXISTS academy_public_profiles_public_id_unique
  ON academy_public_profiles (public_profile_id);

CREATE UNIQUE INDEX IF NOT EXISTS academy_public_profiles_tenant_principal_unique
  ON academy_public_profiles
    (tenant_id, workspace_id, principal_type, principal_id);

CREATE INDEX IF NOT EXISTS academy_public_profiles_public_lookup_idx
  ON academy_public_profiles
    (tenant_id, workspace_id, public_profile_id)
  WHERE visibility = 'public';

CREATE OR REPLACE FUNCTION tecpey_reject_community_profile_identity_change()
RETURNS TRIGGER AS $$
BEGIN
  -- principal_id is a stored generated projection of student_id. PostgreSQL
  -- finalizes generated columns after BEFORE triggers, so comparing NEW and OLD
  -- principal_id here would reject every legitimate consent-only update.
  IF NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.principal_type IS DISTINCT FROM OLD.principal_type
     OR NEW.public_profile_id IS DISTINCT FROM OLD.public_profile_id THEN
    RAISE EXCEPTION 'community profile identity is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_public_profiles_identity_immutable
  ON academy_public_profiles;
CREATE TRIGGER academy_public_profiles_identity_immutable
BEFORE UPDATE ON academy_public_profiles
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_community_profile_identity_change();

CREATE OR REPLACE FUNCTION tecpey_enforce_community_profile_revision()
RETURNS TRIGGER AS $$
DECLARE
  consent_changed BOOLEAN;
BEGIN
  consent_changed :=
    NEW.visibility IS DISTINCT FROM OLD.visibility
    OR NEW.leaderboard_visible IS DISTINCT FROM OLD.leaderboard_visible
    OR NEW.journal_sharing_enabled IS DISTINCT FROM OLD.journal_sharing_enabled
    OR NEW.instructor_review_consent IS DISTINCT FROM OLD.instructor_review_consent
    OR NEW.challenge_participation IS DISTINCT FROM OLD.challenge_participation
    OR NEW.study_group_discovery IS DISTINCT FROM OLD.study_group_discovery
    OR NEW.consent_version IS DISTINCT FROM OLD.consent_version;

  IF consent_changed AND NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'community profile consent revision must advance by one'
      USING ERRCODE = '55000';
  END IF;
  IF NOT consent_changed AND NEW.revision <> OLD.revision THEN
    RAISE EXCEPTION 'community profile revision cannot change without consent mutation'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_public_profiles_revision_guard
  ON academy_public_profiles;
CREATE TRIGGER academy_public_profiles_revision_guard
BEFORE UPDATE ON academy_public_profiles
FOR EACH ROW EXECUTE FUNCTION tecpey_enforce_community_profile_revision();

CREATE OR REPLACE FUNCTION tecpey_create_default_community_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO academy_public_profiles
    (student_id,
     tenant_id,
     workspace_id,
     principal_type,
     public_profile_id,
     visibility,
     leaderboard_visible,
     journal_sharing_enabled,
     instructor_review_consent,
     challenge_participation,
     study_group_discovery,
     revision,
     consent_version,
     consented_at,
     created_at,
     updated_at)
  SELECT
    NEW.id,
    binding.tenant_id,
    binding.workspace_id,
    'student',
    gen_random_uuid(),
    'private',
    FALSE,
    FALSE,
    FALSE,
    FALSE,
    FALSE,
    0,
    'community-profile-consent-v1',
    NULL,
    NOW(),
    NOW()
  FROM platform_principal_bindings binding
  WHERE binding.principal_type = 'student'
    AND binding.principal_id = NEW.id::text
    AND binding.status = 'active'
  ORDER BY binding.created_at ASC
  LIMIT 1
  ON CONFLICT (student_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS zzz_academy_students_default_community_profile
  ON academy_students;
CREATE TRIGGER zzz_academy_students_default_community_profile
AFTER INSERT ON academy_students
FOR EACH ROW EXECUTE FUNCTION tecpey_create_default_community_profile();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runCommunityProfileConsentMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(COMMUNITY_PROFILE_CONSENT_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-community-profile-consent] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(COMMUNITY_PROFILE_CONSENT_SQL);
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
