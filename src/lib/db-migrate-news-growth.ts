import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0098_news_archive_and_growth_intelligence.sql";

export const NEWS_ARCHIVE_AND_GROWTH_SQL = `
CREATE TABLE IF NOT EXISTS platform_news_archive_items (
  archive_id UUID PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  article_url TEXT NOT NULL,
  source_language TEXT NOT NULL CHECK (source_language ~ '^[a-z]{2,3}$'),
  source_title TEXT NOT NULL,
  source_lead TEXT NOT NULL,
  source_body TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  published_day_tehran DATE NOT NULL,
  content_hash CHAR(64) NOT NULL,
  taxonomy JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_news_archive_source_name_check CHECK (char_length(source_name) BETWEEN 2 AND 160),
  CONSTRAINT platform_news_archive_source_domain_check CHECK (source_domain ~ '^[a-z0-9.-]{3,253}$'),
  CONSTRAINT platform_news_archive_feed_url_check CHECK (feed_url ~ '^https://'),
  CONSTRAINT platform_news_archive_article_url_check CHECK (article_url ~ '^https://'),
  CONSTRAINT platform_news_archive_title_check CHECK (char_length(source_title) BETWEEN 4 AND 500),
  CONSTRAINT platform_news_archive_lead_check CHECK (char_length(source_lead) BETWEEN 1 AND 4000),
  CONSTRAINT platform_news_archive_body_check CHECK (char_length(source_body) BETWEEN 1 AND 20000),
  CONSTRAINT platform_news_archive_time_check CHECK (fetched_at >= published_at - INTERVAL '10 minutes'),
  CONSTRAINT platform_news_archive_content_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT platform_news_archive_taxonomy_check CHECK (jsonb_typeof(taxonomy) = 'object'),
  UNIQUE (article_url, content_hash)
);

CREATE INDEX IF NOT EXISTS platform_news_archive_day_idx
  ON platform_news_archive_items (published_day_tehran DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS platform_news_archive_source_idx
  ON platform_news_archive_items (source_domain, published_at DESC);
CREATE INDEX IF NOT EXISTS platform_news_archive_taxonomy_idx
  ON platform_news_archive_items USING GIN (taxonomy);

CREATE TABLE IF NOT EXISTS platform_news_archive_translations (
  translation_id UUID PRIMARY KEY,
  archive_id UUID NOT NULL REFERENCES platform_news_archive_items(archive_id) ON DELETE RESTRICT,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'not_required')),
  provider_id TEXT,
  model TEXT,
  translated_title TEXT,
  translated_lead TEXT,
  translated_body TEXT,
  source_content_hash CHAR(64) NOT NULL,
  translation_hash CHAR(64),
  generated_at TIMESTAMPTZ NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_news_archive_translation_provider_check
    CHECK (provider_id IS NULL OR provider_id ~ '^[a-z0-9_-]{2,40}$'),
  CONSTRAINT platform_news_archive_translation_source_hash_check
    CHECK (source_content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT platform_news_archive_translation_hash_check
    CHECK (translation_hash IS NULL OR translation_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT platform_news_archive_translation_content_check
    CHECK (
      (status = 'completed' AND translated_title IS NOT NULL AND translated_lead IS NOT NULL AND translated_body IS NOT NULL AND translation_hash IS NOT NULL)
      OR status IN ('failed', 'not_required')
    ),
  CONSTRAINT platform_news_archive_translation_evidence_check CHECK (jsonb_typeof(evidence) = 'object')
);

CREATE INDEX IF NOT EXISTS platform_news_archive_translation_lookup_idx
  ON platform_news_archive_translations (archive_id, locale, generated_at DESC);

CREATE TABLE IF NOT EXISTS platform_growth_trend_signals (
  signal_id UUID PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('coin', 'tool', 'topic')),
  entity_id TEXT NOT NULL,
  label TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('global', 'fa', 'en')),
  source_family TEXT NOT NULL CHECK (source_family IN ('official', 'market', 'news', 'social', 'web', 'search', 'editorial')),
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  trend_window TEXT NOT NULL CHECK (trend_window IN ('24h', '7d', '30d')),
  magnitude DOUBLE PRECISION NOT NULL CHECK (magnitude BETWEEN 0 AND 1),
  velocity DOUBLE PRECISION NOT NULL CHECK (velocity BETWEEN 0 AND 1),
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  authority DOUBLE PRECISION NOT NULL CHECK (authority BETWEEN 0 AND 1),
  manipulation_risk DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (manipulation_risk BETWEEN 0 AND 1),
  evidence_label TEXT,
  evidence_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_growth_trend_entity_id_check CHECK (entity_id ~ '^[a-z0-9][a-z0-9._:-]{1,100}$'),
  CONSTRAINT platform_growth_trend_source_url_check CHECK (source_url ~ '^https://'),
  CONSTRAINT platform_growth_trend_evidence_hash_check CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  UNIQUE (entity_type, entity_id, source_family, source_url, observed_at, trend_window, evidence_hash)
);

CREATE INDEX IF NOT EXISTS platform_growth_trend_window_idx
  ON platform_growth_trend_signals (trend_window, observed_at DESC, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS platform_growth_trend_entity_idx
  ON platform_growth_trend_signals (entity_type, entity_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS platform_news_impact_history_source_url_idx
  ON platform_news_impact_history_items (locale, source_url, recorded_at DESC);


-- Expand the governed AI catalog for the no-publish Organic Growth Hacker persona.
ALTER TABLE ai_agent_bindings DROP CONSTRAINT IF EXISTS ai_agent_bindings_agent_id_check;
ALTER TABLE ai_agent_bindings ADD CONSTRAINT ai_agent_bindings_agent_id_check CHECK (agent_id IN (
  'mentor_coach','news_x_researcher','coin_tool_researcher','growth_hacker','content_reviewer','executive_briefing','knowledge_curator','risk_compliance_reviewer'
));
ALTER TABLE ai_agent_usage_daily DROP CONSTRAINT IF EXISTS ai_agent_usage_daily_agent_id_check;
ALTER TABLE ai_agent_usage_daily ADD CONSTRAINT ai_agent_usage_daily_agent_id_check CHECK (agent_id IN (
  'mentor_coach','news_x_researcher','coin_tool_researcher','growth_hacker','content_reviewer','executive_briefing','knowledge_curator','risk_compliance_reviewer'
));
ALTER TABLE ai_agent_binding_events DROP CONSTRAINT IF EXISTS ai_agent_binding_events_agent_id_check;
ALTER TABLE ai_agent_binding_events ADD CONSTRAINT ai_agent_binding_events_agent_id_check CHECK (agent_id IN (
  'mentor_coach','news_x_researcher','coin_tool_researcher','growth_hacker','content_reviewer','executive_briefing','knowledge_curator','risk_compliance_reviewer'
));
ALTER TABLE ai_workflow_run_evidence DROP CONSTRAINT IF EXISTS ai_workflow_run_evidence_agent_id_check;
ALTER TABLE ai_workflow_run_evidence ADD CONSTRAINT ai_workflow_run_evidence_agent_id_check CHECK (agent_id IN (
  'mentor_coach','news_x_researcher','coin_tool_researcher','growth_hacker','content_reviewer','executive_briefing','knowledge_curator','risk_compliance_reviewer'
));
ALTER TABLE ai_workflow_run_evidence DROP CONSTRAINT IF EXISTS ai_workflow_run_evidence_workflow_id_check;
ALTER TABLE ai_workflow_run_evidence ADD CONSTRAINT ai_workflow_run_evidence_workflow_id_check CHECK (workflow_id IN (
  'mentor_response','mentor_public_research','news_x_intelligence','coin_tool_research','organic_growth_acceleration','governed_pattern_learning','admin_research_preview'
));
ALTER TABLE ai_agent_spend_monthly DROP CONSTRAINT IF EXISTS ai_agent_spend_monthly_agent_id_check;
ALTER TABLE ai_agent_spend_monthly ADD CONSTRAINT ai_agent_spend_monthly_agent_id_check CHECK (agent_id IN (
  'mentor_coach','news_x_researcher','coin_tool_researcher','growth_hacker','content_reviewer','executive_briefing','knowledge_curator','risk_compliance_reviewer'
));
ALTER TABLE ai_spend_reservations DROP CONSTRAINT IF EXISTS ai_spend_reservations_agent_id_check;
ALTER TABLE ai_spend_reservations ADD CONSTRAINT ai_spend_reservations_agent_id_check CHECK (agent_id IN (
  'mentor_coach','news_x_researcher','coin_tool_researcher','growth_hacker','content_reviewer','executive_briefing','knowledge_curator','risk_compliance_reviewer'
));
ALTER TABLE ai_routing_decision_events DROP CONSTRAINT IF EXISTS ai_routing_decision_events_agent_id_check;
ALTER TABLE ai_routing_decision_events ADD CONSTRAINT ai_routing_decision_events_agent_id_check CHECK (agent_id IN (
  'mentor_coach','news_x_researcher','coin_tool_researcher','growth_hacker','content_reviewer','executive_briefing','knowledge_curator','risk_compliance_reviewer'
));
ALTER TABLE ai_agent_route_candidates DROP CONSTRAINT IF EXISTS ai_agent_route_candidates_agent_id_check;
ALTER TABLE ai_agent_route_candidates ADD CONSTRAINT ai_agent_route_candidates_agent_id_check CHECK (agent_id IN (
  'mentor_coach','news_x_researcher','coin_tool_researcher','growth_hacker','content_reviewer','executive_briefing','knowledge_curator','risk_compliance_reviewer'
));
ALTER TABLE ai_agent_route_candidate_events DROP CONSTRAINT IF EXISTS ai_agent_route_candidate_events_agent_id_check;
ALTER TABLE ai_agent_route_candidate_events ADD CONSTRAINT ai_agent_route_candidate_events_agent_id_check CHECK (agent_id IN (
  'mentor_coach','news_x_researcher','coin_tool_researcher','growth_hacker','content_reviewer','executive_briefing','knowledge_curator','risk_compliance_reviewer'
));
ALTER TABLE ai_automation_reviews DROP CONSTRAINT IF EXISTS ai_automation_reviews_reviewer_agent_id_check;
ALTER TABLE ai_automation_reviews ADD CONSTRAINT ai_automation_reviews_reviewer_agent_id_check CHECK (
  reviewer_agent_id IS NULL OR reviewer_agent_id IN (
    'mentor_coach','news_x_researcher','coin_tool_researcher','growth_hacker','content_reviewer','executive_briefing','knowledge_curator','risk_compliance_reviewer'
  )
);
ALTER TABLE ai_automation_policies DROP CONSTRAINT IF EXISTS ai_automation_policies_workflow_id_check;
ALTER TABLE ai_automation_policies ADD CONSTRAINT ai_automation_policies_workflow_id_check CHECK (workflow_id IN (
  'public_intelligence_digest','organic_growth_intelligence','content_publication','knowledge_promotion','executive_operating_review','provider_budget_failover'
));
ALTER TABLE ai_automation_runs DROP CONSTRAINT IF EXISTS ai_automation_runs_workflow_id_check;
ALTER TABLE ai_automation_runs ADD CONSTRAINT ai_automation_runs_workflow_id_check CHECK (workflow_id IN (
  'public_intelligence_digest','organic_growth_intelligence','content_publication','knowledge_promotion','executive_operating_review','provider_budget_failover'
));

CREATE OR REPLACE FUNCTION tecpey_reject_news_growth_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'news archive and growth evidence are append-only'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS platform_news_archive_items_immutable ON platform_news_archive_items;
CREATE TRIGGER platform_news_archive_items_immutable
BEFORE UPDATE OR DELETE ON platform_news_archive_items
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_news_growth_mutation();

DROP TRIGGER IF EXISTS platform_news_archive_translations_immutable ON platform_news_archive_translations;
CREATE TRIGGER platform_news_archive_translations_immutable
BEFORE UPDATE OR DELETE ON platform_news_archive_translations
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_news_growth_mutation();

DROP TRIGGER IF EXISTS platform_growth_trend_signals_immutable ON platform_growth_trend_signals;
CREATE TRIGGER platform_growth_trend_signals_immutable
BEFORE UPDATE OR DELETE ON platform_growth_trend_signals
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_news_growth_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runNewsArchiveAndGrowthMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(NEWS_ARCHIVE_AND_GROWTH_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-news-growth] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(NEWS_ARCHIVE_AND_GROWTH_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
