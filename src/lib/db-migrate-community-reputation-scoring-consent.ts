import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0052_community_reputation_scoring_consent.sql";

export const COMMUNITY_REPUTATION_SCORING_CONSENT_SQL = `
CREATE TABLE IF NOT EXISTS academy_community_reputation_scoring_consents (
  public_profile_id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  student_id UUID NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  revision BIGINT NOT NULL DEFAULT 0,
  consent_version TEXT NOT NULL DEFAULT 'community-reputation-scoring-consent-v1',
  consented_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT academy_community_reputation_scoring_consent_principal_type_check
    CHECK (principal_type = 'student'),
  CONSTRAINT academy_community_reputation_scoring_consent_identity_check
    CHECK (principal_id = student_id::text),
  CONSTRAINT academy_community_reputation_scoring_consent_version_check
    CHECK (consent_version = 'community-reputation-scoring-consent-v1'),
  CONSTRAINT academy_community_reputation_scoring_consent_revision_check
    CHECK (revision >= 0),
  CONSTRAINT academy_community_reputation_scoring_consent_profile_fk
    FOREIGN KEY (public_profile_id)
    REFERENCES academy_public_profiles(public_profile_id)
    ON DELETE CASCADE,
  CONSTRAINT academy_community_reputation_scoring_consent_student_fk
    FOREIGN KEY (student_id)
    REFERENCES academy_students(id)
    ON DELETE CASCADE,
  CONSTRAINT academy_community_reputation_scoring_consent_binding_fk
    FOREIGN KEY (tenant_id, workspace_id, principal_type, principal_id)
    REFERENCES platform_principal_bindings
      (tenant_id, workspace_id, principal_type, principal_id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX IF NOT EXISTS academy_community_reputation_scoring_consent_principal_unique
  ON academy_community_reputation_scoring_consents
    (tenant_id, workspace_id, principal_type, principal_id);

CREATE INDEX IF NOT EXISTS academy_community_reputation_scoring_consent_enabled_idx
  ON academy_community_reputation_scoring_consents
    (tenant_id, workspace_id, updated_at DESC, public_profile_id)
  WHERE enabled = TRUE;

INSERT INTO academy_community_reputation_scoring_consents
  (public_profile_id,
   tenant_id,
   workspace_id,
   principal_type,
   principal_id,
   student_id,
   enabled,
   revision,
   consent_version,
   consented_at,
   created_at,
   updated_at)
SELECT
  profile.public_profile_id,
  profile.tenant_id,
  profile.workspace_id,
  profile.principal_type,
  profile.principal_id,
  profile.student_id,
  FALSE,
  0,
  'community-reputation-scoring-consent-v1',
  NULL,
  NOW(),
  NOW()
FROM academy_public_profiles profile
ON CONFLICT (public_profile_id) DO NOTHING;

CREATE OR REPLACE FUNCTION tecpey_reject_reputation_scoring_consent_identity_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.public_profile_id IS DISTINCT FROM OLD.public_profile_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.principal_type IS DISTINCT FROM OLD.principal_type
     OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'community reputation scoring consent identity is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_community_reputation_scoring_consent_identity_immutable
  ON academy_community_reputation_scoring_consents;
CREATE TRIGGER academy_community_reputation_scoring_consent_identity_immutable
BEFORE UPDATE ON academy_community_reputation_scoring_consents
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_reputation_scoring_consent_identity_change();

CREATE OR REPLACE FUNCTION tecpey_enforce_reputation_scoring_consent_revision()
RETURNS TRIGGER AS $$
DECLARE
  consent_changed BOOLEAN;
BEGIN
  consent_changed :=
    NEW.enabled IS DISTINCT FROM OLD.enabled
    OR NEW.consent_version IS DISTINCT FROM OLD.consent_version;

  IF consent_changed AND NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'community reputation scoring consent revision must advance by one'
      USING ERRCODE = '55000';
  END IF;
  IF NOT consent_changed AND NEW.revision <> OLD.revision THEN
    RAISE EXCEPTION 'community reputation scoring consent revision cannot change without consent mutation'
      USING ERRCODE = '55000';
  END IF;
  IF consent_changed AND NEW.consented_at IS NULL THEN
    RAISE EXCEPTION 'community reputation scoring consent mutation requires consented_at'
      USING ERRCODE = '55000';
  END IF;
  IF NOT consent_changed AND NEW.consented_at IS DISTINCT FROM OLD.consented_at THEN
    RAISE EXCEPTION 'community reputation scoring consent timestamp cannot change without consent mutation'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS academy_community_reputation_scoring_consent_revision_guard
  ON academy_community_reputation_scoring_consents;
CREATE TRIGGER academy_community_reputation_scoring_consent_revision_guard
BEFORE UPDATE ON academy_community_reputation_scoring_consents
FOR EACH ROW EXECUTE FUNCTION tecpey_enforce_reputation_scoring_consent_revision();

CREATE OR REPLACE FUNCTION tecpey_create_default_reputation_scoring_consent()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO academy_community_reputation_scoring_consents
    (public_profile_id,
     tenant_id,
     workspace_id,
     principal_type,
     principal_id,
     student_id,
     enabled,
     revision,
     consent_version,
     consented_at,
     created_at,
     updated_at)
  VALUES
    (NEW.public_profile_id,
     NEW.tenant_id,
     NEW.workspace_id,
     NEW.principal_type,
     NEW.principal_id,
     NEW.student_id,
     FALSE,
     0,
     'community-reputation-scoring-consent-v1',
     NULL,
     NOW(),
     NOW())
  ON CONFLICT (public_profile_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS zzz_academy_public_profiles_default_reputation_scoring_consent
  ON academy_public_profiles;
CREATE TRIGGER zzz_academy_public_profiles_default_reputation_scoring_consent
AFTER INSERT ON academy_public_profiles
FOR EACH ROW EXECUTE FUNCTION tecpey_create_default_reputation_scoring_consent();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runCommunityReputationScoringConsentMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(COMMUNITY_REPUTATION_SCORING_CONSENT_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-community-reputation-scoring-consent] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(COMMUNITY_REPUTATION_SCORING_CONSENT_SQL);
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
