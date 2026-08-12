import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0065_academy_mastery_seasons.sql";

export const ACADEMY_MASTERY_SEASONS_SQL = `
CREATE TABLE IF NOT EXISTS academy_mastery_season_catalog (
  season_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL
    CHECK (kind IN ('repair', 'market-update', 'arena-discipline', 'cohort-league')),
  title_fa TEXT NOT NULL,
  title_en TEXT NOT NULL,
  summary_fa TEXT NOT NULL,
  summary_en TEXT NOT NULL,
  recommended_after_term SMALLINT NOT NULL CHECK (recommended_after_term BETWEEN 1 AND 7),
  signal_tags JSONB NOT NULL,
  missions JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  catalog_version INTEGER NOT NULL DEFAULT 1 CHECK (catalog_version >= 1),
  catalog_authority TEXT NOT NULL DEFAULT 'code-catalog-v1'
    CHECK (catalog_authority IN ('code-catalog-v1', 'mentor_governed_generated_v1')),
  published_draft_id UUID,
  publication_review_id BIGINT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (season_id ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  CHECK (char_length(title_fa) BETWEEN 3 AND 180),
  CHECK (char_length(title_en) BETWEEN 3 AND 180),
  CHECK (char_length(summary_fa) BETWEEN 20 AND 800),
  CHECK (char_length(summary_en) BETWEEN 20 AND 800),
  CHECK (jsonb_typeof(signal_tags) = 'array'),
  CHECK (jsonb_array_length(signal_tags) BETWEEN 2 AND 30),
  CHECK (jsonb_typeof(missions) = 'array'),
  CHECK (jsonb_array_length(missions) BETWEEN 3 AND 20),
  CHECK (
    catalog_authority = 'code-catalog-v1'
    OR (
      published_draft_id IS NOT NULL
      AND publication_review_id IS NOT NULL
      AND published_at IS NOT NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS academy_student_mastery_profiles (
  tenant_id TEXT NOT NULL DEFAULT 'tecpey',
  workspace_id TEXT NOT NULL DEFAULT 'main',
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  completed_terms SMALLINT NOT NULL DEFAULT 0 CHECK (completed_terms BETWEEN 0 AND 7),
  weak_concept_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  arena_risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  mentor_topic_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  market_interest_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ranking_consent BOOLEAN NOT NULL DEFAULT FALSE,
  progress_core_level SMALLINT NOT NULL DEFAULT 0 CHECK (progress_core_level BETWEEN 0 AND 100),
  profile_authority TEXT NOT NULL DEFAULT 'server_mastery_v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, workspace_id, student_id, locale),
  CHECK (tenant_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  CHECK (workspace_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  CHECK (jsonb_typeof(weak_concept_tags) = 'array'),
  CHECK (jsonb_array_length(weak_concept_tags) <= 80),
  CHECK (jsonb_typeof(arena_risk_flags) = 'array'),
  CHECK (jsonb_array_length(arena_risk_flags) <= 80),
  CHECK (jsonb_typeof(mentor_topic_tags) = 'array'),
  CHECK (jsonb_array_length(mentor_topic_tags) <= 80),
  CHECK (jsonb_typeof(market_interest_tags) = 'array'),
  CHECK (jsonb_array_length(market_interest_tags) <= 80),
  CHECK (profile_authority = 'server_mastery_v1')
);

CREATE TABLE IF NOT EXISTS academy_mastery_weakness_signals (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tecpey',
  workspace_id TEXT NOT NULL DEFAULT 'main',
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  source_type TEXT NOT NULL
    CHECK (source_type IN ('assessment', 'arena', 'mentor', 'market', 'manual', 'system')),
  source_id TEXT NOT NULL,
  concept_tag TEXT NOT NULL,
  strength SMALLINT NOT NULL CHECK (strength BETWEEN -100 AND 100),
  confidence SMALLINT NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (tenant_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  CHECK (workspace_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  CHECK (char_length(source_id) BETWEEN 1 AND 180),
  CHECK (concept_tag ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS academy_mastery_weakness_signals_student_idx
  ON academy_mastery_weakness_signals(tenant_id, workspace_id, student_id, locale, observed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS academy_mastery_weakness_signals_concept_idx
  ON academy_mastery_weakness_signals(tenant_id, workspace_id, locale, concept_tag, observed_at DESC);

CREATE TABLE IF NOT EXISTS academy_mastery_season_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'tecpey',
  workspace_id TEXT NOT NULL DEFAULT 'main',
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  season_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recommended'
    CHECK (status IN ('recommended', 'active', 'completed', 'dismissed', 'expired')),
  recommendation_score SMALLINT NOT NULL DEFAULT 0 CHECK (recommendation_score BETWEEN 0 AND 100),
  source_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_by TEXT NOT NULL DEFAULT 'server_mastery_v1',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (tenant_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  CHECK (workspace_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  CHECK (season_id ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  CHECK (jsonb_typeof(source_signals) = 'array'),
  CHECK (assigned_by IN ('server_mastery_v1', 'mentor_ai', 'student')),
  CHECK (completed_at IS NULL OR status = 'completed')
);

CREATE UNIQUE INDEX IF NOT EXISTS academy_mastery_season_open_assignment_idx
  ON academy_mastery_season_assignments(tenant_id, workspace_id, student_id, locale, season_id)
  WHERE status IN ('recommended', 'active');
CREATE INDEX IF NOT EXISTS academy_mastery_season_assignments_student_idx
  ON academy_mastery_season_assignments(tenant_id, workspace_id, student_id, locale, updated_at DESC);

CREATE TABLE IF NOT EXISTS academy_mastery_season_generation_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'tecpey',
  workspace_id TEXT NOT NULL DEFAULT 'main',
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  season_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'rejected', 'review_ready', 'approved', 'published', 'archived')),
  generated_by TEXT NOT NULL CHECK (generated_by IN ('mentor_ai', 'system', 'human')),
  model_name TEXT,
  policy_version TEXT NOT NULL,
  source_count SMALLINT NOT NULL DEFAULT 0 CHECK (source_count BETWEEN 0 AND 30),
  question_count SMALLINT NOT NULL DEFAULT 0 CHECK (question_count BETWEEN 0 AND 200),
  advanced_objective_count SMALLINT NOT NULL DEFAULT 0 CHECK (advanced_objective_count BETWEEN 0 AND 30),
  draft_payload JSONB NOT NULL,
  review_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (tenant_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  CHECK (workspace_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  CHECK (season_id ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  CHECK (model_name IS NULL OR char_length(model_name) BETWEEN 2 AND 120),
  CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$'),
  CHECK (jsonb_typeof(draft_payload) = 'object'),
  CHECK (jsonb_typeof(review_summary) = 'object'),
  CHECK (
    status NOT IN ('review_ready', 'approved', 'published')
    OR (
      source_count >= 2
      AND question_count >= 6
      AND advanced_objective_count >= 2
      AND COALESCE(jsonb_array_length(review_summary->'violations'), 1) = 0
    )
  ),
  CHECK (COALESCE(draft_payload->>'publishCapability', 'mentor_governed_automation') = 'mentor_governed_automation')
);

CREATE INDEX IF NOT EXISTS academy_mastery_generation_drafts_lookup_idx
  ON academy_mastery_season_generation_drafts
    (tenant_id, workspace_id, locale, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS academy_mastery_generation_drafts_season_idx
  ON academy_mastery_season_generation_drafts
    (tenant_id, workspace_id, season_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS academy_mastery_season_generation_reviews (
  id BIGSERIAL PRIMARY KEY,
  draft_id UUID NOT NULL REFERENCES academy_mastery_season_generation_drafts(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('reject', 'request_changes', 'approve_for_catalog', 'publish')),
  reviewer_type TEXT NOT NULL CHECK (reviewer_type IN ('system', 'mentor_ai', 'human')),
  reviewer_id TEXT,
  policy_version TEXT NOT NULL,
  decision_notes TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (tenant_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  CHECK (workspace_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  CHECK (reviewer_id IS NULL OR char_length(reviewer_id) BETWEEN 3 AND 160),
  CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$'),
  CHECK (char_length(decision_notes) BETWEEN 20 AND 2000),
  CHECK (jsonb_typeof(evidence) = 'object'),
  CHECK (decision IN ('reject', 'request_changes') OR reviewer_type = 'mentor_ai')
);

CREATE INDEX IF NOT EXISTS academy_mastery_generation_reviews_draft_idx
  ON academy_mastery_season_generation_reviews(draft_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS academy_mastery_generation_reviews_tenant_idx
  ON academy_mastery_season_generation_reviews(tenant_id, workspace_id, decided_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS academy_mastery_generation_reviews_publish_once_idx
  ON academy_mastery_season_generation_reviews(draft_id)
  WHERE decision = 'publish';

CREATE TABLE IF NOT EXISTS academy_mastery_season_progress_events (
  id BIGSERIAL PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES academy_mastery_season_assignments(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL DEFAULT 'tecpey',
  workspace_id TEXT NOT NULL DEFAULT 'main',
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  event_type TEXT NOT NULL
    CHECK (event_type IN ('assigned', 'started', 'mission_completed', 'reflection_added', 'mentor_reviewed', 'completed', 'dismissed')),
  mission_key TEXT,
  idempotency_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (tenant_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  CHECK (workspace_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  CHECK (mission_key IS NULL OR char_length(mission_key) BETWEEN 1 AND 120),
  CHECK (idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 8 AND 160),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS academy_mastery_season_progress_events_assignment_idx
  ON academy_mastery_season_progress_events(assignment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS academy_mastery_season_progress_events_student_idx
  ON academy_mastery_season_progress_events(tenant_id, workspace_id, student_id, locale, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS academy_mastery_season_progress_event_idempotency_idx
  ON academy_mastery_season_progress_events(assignment_id, event_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runAcademyMasterySeasonsMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(ACADEMY_MASTERY_SEASONS_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-academy-mastery-seasons] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-academy-mastery-seasons] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_MASTERY_SEASONS_SQL);
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
