import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0091_ai_control_plane.sql";

export const AI_CONTROL_PLANE_SQL = `
INSERT INTO admin_roles (id, name, description) VALUES
  ('ai_governance_admin', 'AI Governance Administrator', 'Provider, agent, workflow and governed AI knowledge control')
ON CONFLICT (id) DO NOTHING;

INSERT INTO admin_permissions (id, description, risk_level) VALUES
  ('ai.research.run', 'Run bounded source-grounded AI research previews', 'sensitive'),
  ('ai.knowledge.review', 'Verify or reject AI knowledge candidates', 'critical')
ON CONFLICT (id) DO NOTHING;

INSERT INTO admin_role_permissions (role_id, permission_id) VALUES
  ('ai_governance_admin', 'mentor.read'),
  ('ai_governance_admin', 'mentor.policy.manage'),
  ('ai_governance_admin', 'academy.read'),
  ('ai_governance_admin', 'academy.content.manage'),
  ('ai_governance_admin', 'audit.read'),
  ('ai_governance_admin', 'ai.research.run'),
  ('ai_governance_admin', 'ai.knowledge.review'),
  ('academy_admin', 'mentor.read'),
  ('academy_admin', 'ai.research.run'),
  ('academy_admin', 'ai.knowledge.review'),
  ('compliance_analyst', 'mentor.read'),
  ('compliance_analyst', 'ai.research.run'),
  ('compliance_approver', 'mentor.read'),
  ('compliance_approver', 'ai.knowledge.review'),
  ('security_admin', 'mentor.read')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_provider_configs (
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  provider_id TEXT NOT NULL
    CHECK (provider_id IN ('openai', 'anthropic', 'perplexity', 'xai', 'x_api')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  encrypted_api_key TEXT,
  api_key_fingerprint TEXT,
  key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version > 0),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  rotated_at TIMESTAMPTZ,
  last_test_status TEXT CHECK (last_test_status IN ('passed', 'failed')),
  last_tested_at TIMESTAMPTZ,
  updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, workspace_id, provider_id),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE CASCADE,
  CHECK ((encrypted_api_key IS NULL) = (api_key_fingerprint IS NULL)),
  CHECK (api_key_fingerprint IS NULL OR api_key_fingerprint ~ '^[0-9a-f]{12}$'),
  CHECK (jsonb_typeof(settings) = 'object'),
  CHECK (octet_length(settings::text) <= 8192),
  CHECK (NOT (settings ?| ARRAY['apiKey', 'api_key', 'secret', 'token', 'password', 'credential', 'authorization']))
);

CREATE INDEX IF NOT EXISTS ai_provider_configs_scope_idx
  ON ai_provider_configs (tenant_id, workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_provider_config_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  provider_id TEXT NOT NULL
    CHECK (provider_id IN ('openai', 'anthropic', 'perplexity', 'xai', 'x_api')),
  event_type TEXT NOT NULL
    CHECK (event_type IN ('configured', 'rotated', 'enabled', 'disabled', 'test_passed', 'test_failed')),
  revision BIGINT NOT NULL CHECK (revision > 0),
  api_key_fingerprint TEXT,
  settings_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE CASCADE,
  CHECK (api_key_fingerprint IS NULL OR api_key_fingerprint ~ '^[0-9a-f]{12}$'),
  CHECK (jsonb_typeof(settings_snapshot) = 'object'),
  CHECK (octet_length(settings_snapshot::text) <= 8192),
  CHECK (NOT (settings_snapshot ?| ARRAY['apiKey', 'api_key', 'secret', 'token', 'password', 'credential', 'authorization']))
);

CREATE INDEX IF NOT EXISTS ai_provider_config_events_scope_idx
  ON ai_provider_config_events
    (tenant_id, workspace_id, provider_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_agent_bindings (
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL CHECK (agent_id IN (
    'mentor_coach',
    'news_x_researcher',
    'coin_tool_researcher',
    'content_reviewer',
    'executive_briefing',
    'knowledge_curator',
    'risk_compliance_reviewer'
  )),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  provider_id TEXT NOT NULL
    CHECK (provider_id IN ('openai', 'anthropic', 'perplexity', 'xai')),
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 160),
  fallback_model TEXT CHECK (fallback_model IS NULL OR length(fallback_model) BETWEEN 1 AND 160),
  daily_request_limit INTEGER NOT NULL CHECK (daily_request_limit BETWEEN 1 AND 1000000),
  daily_token_limit BIGINT NOT NULL CHECK (daily_token_limit BETWEEN 1000 AND 100000000000),
  max_input_tokens INTEGER NOT NULL CHECK (max_input_tokens BETWEEN 256 AND 1000000),
  max_output_tokens INTEGER NOT NULL CHECK (max_output_tokens BETWEEN 64 AND 100000),
  monthly_budget_usd_micros BIGINT NOT NULL
    CHECK (monthly_budget_usd_micros BETWEEN 1000000 AND 1000000000000),
  approval_mode TEXT NOT NULL CHECK (approval_mode IN (
    'none', 'before_publish', 'before_knowledge_promotion', 'before_external_effect'
  )),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, workspace_id, agent_id),
  FOREIGN KEY (tenant_id, workspace_id, provider_id)
    REFERENCES ai_provider_configs(tenant_id, workspace_id, provider_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ai_agent_bindings_scope_idx
  ON ai_agent_bindings (tenant_id, workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_agent_usage_daily (
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL CHECK (agent_id IN (
    'mentor_coach',
    'news_x_researcher',
    'coin_tool_researcher',
    'content_reviewer',
    'executive_briefing',
    'knowledge_curator',
    'risk_compliance_reviewer'
  )),
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  reserved_tokens BIGINT NOT NULL DEFAULT 0 CHECK (reserved_tokens >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, workspace_id, agent_id, usage_date),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ai_agent_usage_daily_scope_idx
  ON ai_agent_usage_daily (tenant_id, workspace_id, usage_date DESC, agent_id);

CREATE TABLE IF NOT EXISTS ai_agent_binding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL CHECK (agent_id IN (
    'mentor_coach',
    'news_x_researcher',
    'coin_tool_researcher',
    'content_reviewer',
    'executive_briefing',
    'knowledge_curator',
    'risk_compliance_reviewer'
  )),
  event_type TEXT NOT NULL CHECK (event_type IN ('configured', 'enabled', 'disabled')),
  provider_id TEXT NOT NULL CHECK (provider_id IN ('openai', 'anthropic', 'perplexity', 'xai')),
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 160),
  limits_snapshot JSONB NOT NULL,
  approval_mode TEXT NOT NULL CHECK (approval_mode IN (
    'none', 'before_publish', 'before_knowledge_promotion', 'before_external_effect'
  )),
  revision BIGINT NOT NULL CHECK (revision > 0),
  actor_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(limits_snapshot) = 'object'),
  CHECK (octet_length(limits_snapshot::text) <= 8192)
);

CREATE INDEX IF NOT EXISTS ai_agent_binding_events_scope_idx
  ON ai_agent_binding_events
    (tenant_id, workspace_id, agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  knowledge_type TEXT NOT NULL
    CHECK (knowledge_type IN ('recurring_pattern', 'research_claim', 'operating_rule')),
  subject_type TEXT NOT NULL CHECK (length(subject_type) BETWEEN 2 AND 80),
  subject_id TEXT CHECK (subject_id IS NULL OR length(subject_id) BETWEEN 1 AND 160),
  statement TEXT NOT NULL CHECK (length(statement) BETWEEN 8 AND 8000),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence SMALLINT NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  data_class TEXT NOT NULL CHECK (data_class IN (
    'public', 'aggregate_deidentified', 'approved_platform_content'
  )),
  status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate', 'verified', 'rejected', 'superseded')),
  derived_by_agent TEXT CHECK (derived_by_agent IS NULL OR derived_by_agent IN (
    'mentor_coach',
    'news_x_researcher',
    'coin_tool_researcher',
    'content_reviewer',
    'executive_briefing',
    'knowledge_curator',
    'risk_compliance_reviewer'
  )),
  reviewed_by UUID REFERENCES admin_users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT CHECK (review_note IS NULL OR length(review_note) <= 2000),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, workspace_id, content_hash),
  CHECK (jsonb_typeof(evidence_refs) = 'array'),
  CHECK (octet_length(evidence_refs::text) <= 32768),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (status <> 'verified' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS ai_knowledge_items_retrieval_idx
  ON ai_knowledge_items
    (tenant_id, workspace_id, status, knowledge_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_knowledge_item_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  knowledge_item_id UUID NOT NULL REFERENCES ai_knowledge_items(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('candidate_created', 'verified', 'rejected', 'superseded')),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  actor_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (octet_length(metadata::text) <= 8192),
  CHECK (NOT (metadata ?| ARRAY['apiKey', 'api_key', 'secret', 'token', 'password', 'credential', 'authorization', 'message', 'prompt']))
);

CREATE INDEX IF NOT EXISTS ai_knowledge_item_events_scope_idx
  ON ai_knowledge_item_events
    (tenant_id, workspace_id, knowledge_item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_workflow_run_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id UUID NOT NULL,
  workflow_id TEXT NOT NULL CHECK (workflow_id IN (
    'mentor_response', 'mentor_public_research', 'news_x_intelligence', 'coin_tool_research', 'governed_pattern_learning', 'admin_research_preview'
  )),
  agent_id TEXT NOT NULL CHECK (agent_id IN (
    'mentor_coach',
    'news_x_researcher',
    'coin_tool_researcher',
    'content_reviewer',
    'executive_briefing',
    'knowledge_curator',
    'risk_compliance_reviewer'
  )),
  provider_id TEXT NOT NULL CHECK (provider_id IN ('openai', 'anthropic', 'perplexity', 'xai')),
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 160),
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  output_hash TEXT CHECK (output_hash IS NULL OR output_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status IN (
    'admitted', 'completed', 'blocked', 'failed', 'timeout', 'output_rejected'
  )),
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (estimated_input_tokens >= 0),
  estimated_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (estimated_output_tokens >= 0),
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  approval_mode TEXT NOT NULL CHECK (approval_mode IN (
    'none', 'before_publish', 'before_knowledge_promotion', 'before_external_effect'
  )),
  actor_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, run_id, status),
  CHECK (jsonb_typeof(source_refs) = 'array'),
  CHECK (octet_length(source_refs::text) <= 32768)
);

CREATE INDEX IF NOT EXISTS ai_workflow_run_evidence_scope_idx
  ON ai_workflow_run_evidence
    (tenant_id, workspace_id, agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mentor_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'گفت‌وگوی جدید' CHECK (length(title) BETWEEN 1 AND 120),
  locale TEXT NOT NULL DEFAULT 'fa' CHECK (locale IN ('fa', 'en')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  origin TEXT NOT NULL DEFAULT 'user' CHECK (origin IN ('user', 'legacy')),
  summary TEXT CHECK (summary IS NULL OR length(summary) <= 4000),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, student_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS mentor_threads_one_legacy_per_student_idx
  ON mentor_threads (student_id) WHERE origin = 'legacy';

CREATE INDEX IF NOT EXISTS mentor_threads_student_recent_idx
  ON mentor_threads (student_id, status, last_message_at DESC, id DESC);

ALTER TABLE mentor_conversations
  ADD COLUMN IF NOT EXISTS thread_id UUID;

INSERT INTO mentor_threads (student_id, title, locale, status, origin, last_message_at)
SELECT student_id,
       CASE WHEN (ARRAY_AGG(locale ORDER BY created_at DESC))[1] = 'en'
            THEN 'Previous conversation'
            ELSE 'گفت‌وگوی پیشین'
       END,
       CASE WHEN (ARRAY_AGG(locale ORDER BY created_at DESC))[1] = 'en' THEN 'en' ELSE 'fa' END,
       'active',
       'legacy',
       MAX(created_at)
  FROM mentor_conversations
 GROUP BY student_id
ON CONFLICT (student_id) WHERE origin = 'legacy' DO NOTHING;

UPDATE mentor_conversations conversation
   SET thread_id = thread.id
  FROM mentor_threads thread
 WHERE conversation.thread_id IS NULL
   AND thread.student_id = conversation.student_id
   AND thread.origin = 'legacy';

ALTER TABLE mentor_conversations
  DROP CONSTRAINT IF EXISTS mentor_conversations_thread_student_fk;

ALTER TABLE mentor_conversations
  ADD CONSTRAINT mentor_conversations_thread_student_fk
  FOREIGN KEY (thread_id, student_id)
  REFERENCES mentor_threads(id, student_id) ON DELETE CASCADE;

ALTER TABLE mentor_conversations
  ALTER COLUMN thread_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS mentor_conversations_thread_recent_idx
  ON mentor_conversations (student_id, thread_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION tecpey_reject_ai_control_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AI control plane evidence is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION tecpey_validate_ai_control_json()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  candidate JSONB;
BEGIN
  candidate := CASE TG_TABLE_NAME
    WHEN 'ai_provider_configs' THEN NEW.settings
    WHEN 'ai_provider_config_events' THEN NEW.settings_snapshot
    WHEN 'ai_agent_binding_events' THEN NEW.limits_snapshot
    WHEN 'ai_knowledge_item_events' THEN NEW.metadata
    ELSE '{}'::jsonb
  END;
  IF tecpey_sensitive_audit_has_forbidden_key(candidate) THEN
    RAISE EXCEPTION 'AI control plane JSON contains forbidden keys'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_provider_configs_validate_json ON ai_provider_configs;
CREATE TRIGGER ai_provider_configs_validate_json
BEFORE INSERT OR UPDATE ON ai_provider_configs
FOR EACH ROW EXECUTE FUNCTION tecpey_validate_ai_control_json();

DROP TRIGGER IF EXISTS ai_provider_config_events_validate_json ON ai_provider_config_events;
CREATE TRIGGER ai_provider_config_events_validate_json
BEFORE INSERT ON ai_provider_config_events
FOR EACH ROW EXECUTE FUNCTION tecpey_validate_ai_control_json();

DROP TRIGGER IF EXISTS ai_agent_binding_events_validate_json ON ai_agent_binding_events;
CREATE TRIGGER ai_agent_binding_events_validate_json
BEFORE INSERT ON ai_agent_binding_events
FOR EACH ROW EXECUTE FUNCTION tecpey_validate_ai_control_json();

DROP TRIGGER IF EXISTS ai_knowledge_item_events_validate_json ON ai_knowledge_item_events;
CREATE TRIGGER ai_knowledge_item_events_validate_json
BEFORE INSERT ON ai_knowledge_item_events
FOR EACH ROW EXECUTE FUNCTION tecpey_validate_ai_control_json();

DROP TRIGGER IF EXISTS ai_provider_config_events_no_update ON ai_provider_config_events;
CREATE TRIGGER ai_provider_config_events_no_update
BEFORE UPDATE ON ai_provider_config_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();

DROP TRIGGER IF EXISTS ai_provider_config_events_no_delete ON ai_provider_config_events;
CREATE TRIGGER ai_provider_config_events_no_delete
BEFORE DELETE ON ai_provider_config_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();

DROP TRIGGER IF EXISTS ai_agent_binding_events_no_update ON ai_agent_binding_events;
CREATE TRIGGER ai_agent_binding_events_no_update
BEFORE UPDATE ON ai_agent_binding_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();

DROP TRIGGER IF EXISTS ai_agent_binding_events_no_delete ON ai_agent_binding_events;
CREATE TRIGGER ai_agent_binding_events_no_delete
BEFORE DELETE ON ai_agent_binding_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();

DROP TRIGGER IF EXISTS ai_knowledge_item_events_no_update ON ai_knowledge_item_events;
CREATE TRIGGER ai_knowledge_item_events_no_update
BEFORE UPDATE ON ai_knowledge_item_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();

DROP TRIGGER IF EXISTS ai_knowledge_item_events_no_delete ON ai_knowledge_item_events;
CREATE TRIGGER ai_knowledge_item_events_no_delete
BEFORE DELETE ON ai_knowledge_item_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();

DROP TRIGGER IF EXISTS ai_workflow_run_evidence_no_update ON ai_workflow_run_evidence;
CREATE TRIGGER ai_workflow_run_evidence_no_update
BEFORE UPDATE ON ai_workflow_run_evidence
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();

DROP TRIGGER IF EXISTS ai_workflow_run_evidence_no_delete ON ai_workflow_run_evidence;
CREATE TRIGGER ai_workflow_run_evidence_no_delete
BEFORE DELETE ON ai_workflow_run_evidence
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runAiControlPlaneMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(AI_CONTROL_PLANE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-ai-control-plane] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-ai-control-plane] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(AI_CONTROL_PLANE_SQL);
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
