import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0120_arena_league_season_authority.sql";

export const ARENA_LEAGUE_SEASON_AUTHORITY_SQL = `
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS academy_arena_league_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  season_key TEXT NOT NULL CHECK (
    char_length(season_key) BETWEEN 3 AND 80
    AND season_key ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'
  ),
  policy_version TEXT NOT NULL CHECK (policy_version = 'arena-league-season-v1'),
  scoring_policy_version TEXT NOT NULL CHECK (
    char_length(scoring_policy_version) BETWEEN 8 AND 80
    AND scoring_policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$'
  ),
  timezone TEXT NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 80),
  enrollment_opens_at TIMESTAMPTZ NOT NULL,
  enrollment_closes_at TIMESTAMPTZ NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  initial_balance NUMERIC(30,8) NOT NULL CHECK (initial_balance > 0 AND initial_balance <= 1000000000),
  attempts_per_cycle SMALLINT NOT NULL CHECK (attempts_per_cycle BETWEEN 1 AND 10),
  ranking_visibility TEXT NOT NULL CHECK (ranking_visibility = 'opt-in'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft','enrollment','active','closing','finalized')
  ),
  config_digest CHAR(64) NOT NULL CHECK (config_digest ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enrollment_opened_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  closing_started_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  CONSTRAINT academy_arena_season_timeline_check CHECK (
    enrollment_opens_at < enrollment_closes_at
    AND enrollment_closes_at <= starts_at
    AND starts_at < ends_at
    AND ends_at - starts_at >= INTERVAL '1 hour'
    AND ends_at - starts_at <= INTERVAL '366 days'
  ),
  CONSTRAINT academy_arena_season_lifecycle_time_check CHECK (
    (status = 'draft' AND enrollment_opened_at IS NULL AND activated_at IS NULL
      AND closing_started_at IS NULL AND finalized_at IS NULL)
    OR
    (status = 'enrollment' AND enrollment_opened_at IS NOT NULL AND activated_at IS NULL
      AND closing_started_at IS NULL AND finalized_at IS NULL)
    OR
    (status = 'active' AND enrollment_opened_at IS NOT NULL AND activated_at IS NOT NULL
      AND closing_started_at IS NULL AND finalized_at IS NULL)
    OR
    (status = 'closing' AND enrollment_opened_at IS NOT NULL AND activated_at IS NOT NULL
      AND closing_started_at IS NOT NULL AND finalized_at IS NULL)
    OR
    (status = 'finalized' AND enrollment_opened_at IS NOT NULL AND activated_at IS NOT NULL
      AND closing_started_at IS NOT NULL AND finalized_at IS NOT NULL)
  ),
  CONSTRAINT academy_arena_season_activation_time_check CHECK (
    activated_at IS NULL OR activated_at >= starts_at
  ),
  CONSTRAINT academy_arena_season_closing_time_check CHECK (
    closing_started_at IS NULL OR closing_started_at >= ends_at
  ),
  CONSTRAINT academy_arena_season_finalized_time_check CHECK (
    finalized_at IS NULL OR finalized_at >= ends_at
  ),
  CONSTRAINT academy_arena_season_workspace_fk
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT academy_arena_season_scope_unique UNIQUE (id, tenant_id, workspace_id),
  CONSTRAINT academy_arena_season_key_unique UNIQUE (tenant_id, workspace_id, season_key),
  CONSTRAINT academy_arena_season_digest_unique UNIQUE (tenant_id, workspace_id, config_digest)
);

CREATE INDEX IF NOT EXISTS academy_arena_season_status_idx
  ON academy_arena_league_seasons
    (tenant_id, workspace_id, status, starts_at, id);
CREATE INDEX IF NOT EXISTS academy_arena_season_finalize_due_idx
  ON academy_arena_league_seasons
    (tenant_id, workspace_id, ends_at, id)
  WHERE status IN ('active','closing');

CREATE TABLE IF NOT EXISTS academy_arena_league_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  principal_type TEXT NOT NULL DEFAULT 'student' CHECK (principal_type = 'student'),
  principal_id TEXT NOT NULL,
  student_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'enrolled' CHECK (
    status IN ('enrolled','withdrawn','disqualified')
  ),
  enrolled_at TIMESTAMPTZ NOT NULL,
  status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason_code TEXT CHECK (
    reason_code IS NULL OR (
      char_length(reason_code) BETWEEN 3 AND 80
      AND reason_code ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (principal_id = student_id::text),
  CONSTRAINT academy_arena_enrollment_season_scope_fk
    FOREIGN KEY (season_id, tenant_id, workspace_id)
    REFERENCES academy_arena_league_seasons(id, tenant_id, workspace_id)
    ON DELETE RESTRICT,
  CONSTRAINT academy_arena_enrollment_binding_fk
    FOREIGN KEY (tenant_id, workspace_id, principal_type, principal_id)
    REFERENCES platform_principal_bindings(tenant_id, workspace_id, principal_type, principal_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT academy_arena_enrollment_unique
    UNIQUE (tenant_id, workspace_id, season_id, student_id)
);

CREATE INDEX IF NOT EXISTS academy_arena_enrollment_student_idx
  ON academy_arena_league_enrollments
    (tenant_id, workspace_id, student_id, enrolled_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS academy_arena_enrollment_season_idx
  ON academy_arena_league_enrollments
    (tenant_id, workspace_id, season_id, status, student_id);

REVOKE ALL ON TABLE academy_arena_league_seasons, academy_arena_league_enrollments FROM PUBLIC;
ALTER TABLE academy_arena_league_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_arena_league_seasons FORCE ROW LEVEL SECURITY;
ALTER TABLE academy_arena_league_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_arena_league_enrollments FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION tecpey_guard_arena_league_season_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'arena league seasons cannot be deleted' USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'finalized' THEN
    RAISE EXCEPTION 'finalized arena league season is immutable' USING ERRCODE = '55000';
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'arena league season identity is immutable' USING ERRCODE = '55000';
  END IF;

  IF OLD.status <> 'draft' OR NEW.status <> 'draft' THEN
    IF OLD.season_key IS DISTINCT FROM NEW.season_key
      OR OLD.policy_version IS DISTINCT FROM NEW.policy_version
      OR OLD.scoring_policy_version IS DISTINCT FROM NEW.scoring_policy_version
      OR OLD.timezone IS DISTINCT FROM NEW.timezone
      OR OLD.enrollment_opens_at IS DISTINCT FROM NEW.enrollment_opens_at
      OR OLD.enrollment_closes_at IS DISTINCT FROM NEW.enrollment_closes_at
      OR OLD.starts_at IS DISTINCT FROM NEW.starts_at
      OR OLD.ends_at IS DISTINCT FROM NEW.ends_at
      OR OLD.initial_balance IS DISTINCT FROM NEW.initial_balance
      OR OLD.attempts_per_cycle IS DISTINCT FROM NEW.attempts_per_cycle
      OR OLD.ranking_visibility IS DISTINCT FROM NEW.ranking_visibility
      OR OLD.config_digest IS DISTINCT FROM NEW.config_digest THEN
      RAISE EXCEPTION 'arena league season configuration is frozen' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status AND NOT (
    (OLD.status = 'draft' AND NEW.status = 'enrollment')
    OR (OLD.status = 'enrollment' AND NEW.status = 'active')
    OR (OLD.status = 'active' AND NEW.status = 'closing')
    OR (OLD.status = 'closing' AND NEW.status = 'finalized')
  ) THEN
    RAISE EXCEPTION 'arena league season lifecycle transition is invalid' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION tecpey_guard_arena_league_season_mutation() FROM PUBLIC;

DROP TRIGGER IF EXISTS academy_arena_league_season_mutation_guard
  ON academy_arena_league_seasons;
CREATE TRIGGER academy_arena_league_season_mutation_guard
BEFORE UPDATE OR DELETE ON academy_arena_league_seasons
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_arena_league_season_mutation();

CREATE OR REPLACE FUNCTION tecpey_guard_arena_league_enrollment_mutation()
RETURNS TRIGGER AS $$
DECLARE
  season_row academy_arena_league_seasons%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'arena league enrollment evidence cannot be deleted' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT * INTO season_row
      FROM academy_arena_league_seasons
     WHERE id = NEW.season_id
       AND tenant_id = NEW.tenant_id
       AND workspace_id = NEW.workspace_id
     FOR KEY SHARE;

    IF NOT FOUND OR season_row.status <> 'enrollment' THEN
      RAISE EXCEPTION 'arena league season is not accepting enrollment' USING ERRCODE = '55000';
    END IF;
    IF NEW.status <> 'enrolled' THEN
      RAISE EXCEPTION 'arena league enrollment must begin enrolled' USING ERRCODE = '55000';
    END IF;
    IF NEW.enrolled_at < season_row.enrollment_opens_at
      OR NEW.enrolled_at >= season_row.enrollment_closes_at THEN
      RAISE EXCEPTION 'arena league enrollment is outside configured window' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.season_id IS DISTINCT FROM NEW.season_id
    OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
    OR OLD.principal_type IS DISTINCT FROM NEW.principal_type
    OR OLD.principal_id IS DISTINCT FROM NEW.principal_id
    OR OLD.student_id IS DISTINCT FROM NEW.student_id
    OR OLD.enrolled_at IS DISTINCT FROM NEW.enrolled_at
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'arena league enrollment identity is immutable' USING ERRCODE = '55000';
  END IF;

  IF OLD.status <> 'enrolled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'terminal arena league enrollment is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'enrolled' AND NEW.status NOT IN ('enrolled','withdrawn','disqualified') THEN
    RAISE EXCEPTION 'arena league enrollment transition is invalid' USING ERRCODE = '55000';
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('withdrawn','disqualified')
    AND NEW.reason_code IS NULL THEN
    RAISE EXCEPTION 'arena league enrollment terminal transition requires reason' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION tecpey_guard_arena_league_enrollment_mutation() FROM PUBLIC;

DROP TRIGGER IF EXISTS academy_arena_league_enrollment_mutation_guard
  ON academy_arena_league_enrollments;
CREATE TRIGGER academy_arena_league_enrollment_mutation_guard
BEFORE INSERT OR UPDATE OR DELETE ON academy_arena_league_enrollments
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_arena_league_enrollment_mutation();

DROP TRIGGER IF EXISTS tecpey_active_binding_guard ON academy_arena_league_enrollments;
CREATE CONSTRAINT TRIGGER tecpey_active_binding_guard
AFTER INSERT OR UPDATE ON academy_arena_league_enrollments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION tecpey_require_active_principal_binding();

ALTER TABLE academy_arena_league_snapshots
  ADD COLUMN IF NOT EXISTS season_id UUID;

ALTER TABLE academy_arena_league_snapshots
  ADD CONSTRAINT academy_arena_snapshot_season_scope_fk
  FOREIGN KEY (season_id, tenant_id, workspace_id)
  REFERENCES academy_arena_league_seasons(id, tenant_id, workspace_id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS academy_arena_snapshot_season_idx
  ON academy_arena_league_snapshots
    (tenant_id, workspace_id, season_id, version DESC)
  WHERE season_id IS NOT NULL;

CREATE OR REPLACE FUNCTION tecpey_guard_arena_season_snapshot_finalization()
RETURNS TRIGGER AS $$
DECLARE
  season_status TEXT;
  season_end TIMESTAMPTZ;
BEGIN
  IF NEW.season_id IS NULL OR NEW.status <> 'finalized' OR OLD.status = 'finalized' THEN
    RETURN NEW;
  END IF;

  SELECT status, ends_at INTO season_status, season_end
    FROM academy_arena_league_seasons
   WHERE id = NEW.season_id
     AND tenant_id = NEW.tenant_id
     AND workspace_id = NEW.workspace_id
   FOR KEY SHARE;

  IF NOT FOUND OR season_status NOT IN ('closing','finalized') THEN
    RAISE EXCEPTION 'arena league season snapshot cannot finalize before season closing' USING ERRCODE = '55000';
  END IF;
  IF NEW.source_cutoff_at < season_end THEN
    RAISE EXCEPTION 'arena league season snapshot cutoff precedes season end' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION tecpey_guard_arena_season_snapshot_finalization() FROM PUBLIC;

DROP TRIGGER IF EXISTS academy_arena_season_snapshot_finalization_guard
  ON academy_arena_league_snapshots;
CREATE TRIGGER academy_arena_season_snapshot_finalization_guard
BEFORE UPDATE OF status ON academy_arena_league_snapshots
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_arena_season_snapshot_finalization();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runArenaLeagueSeasonAuthorityMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ARENA_LEAGUE_SEASON_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-arena-league-seasons] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(ARENA_LEAGUE_SEASON_AUTHORITY_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
