import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0092_ai_automation_orchestration.sql";

export const AI_AUTOMATION_ORCHESTRATION_SQL = `
INSERT INTO admin_roles (id, name, description) VALUES
  ('chief_executive_officer', 'Chief Executive Officer', 'Final executive governance authority'),
  ('chief_technology_officer', 'Chief Technology Officer', 'Technology and AI architecture governance authority'),
  ('chief_operating_officer', 'Chief Operating Officer', 'Operating workflow governance authority'),
  ('chief_risk_compliance_officer', 'Chief Risk and Compliance Officer', 'Risk, compliance and policy governance authority'),
  ('chief_content_officer', 'Chief Content Officer', 'Content quality and publication governance authority')
ON CONFLICT (id) DO NOTHING;

INSERT INTO admin_permissions (id, description, risk_level) VALUES
  ('ai.automation.manage', 'Configure and enqueue governed AI automation workflows', 'critical'),
  ('ai.automation.review', 'Review governed AI automation workflow runs', 'critical'),
  ('ai.automation.execute', 'Claim an approved AI automation run for a bounded executor', 'critical')
ON CONFLICT (id) DO NOTHING;

INSERT INTO admin_role_permissions (role_id, permission_id) VALUES
  ('ai_governance_admin', 'ai.automation.manage'),
  ('ai_governance_admin', 'ai.automation.review'),
  ('ai_governance_admin', 'ai.automation.execute'),
  ('academy_admin', 'ai.automation.review'),
  ('marketing_operator', 'ai.automation.review'),
  ('compliance_approver', 'ai.automation.review'),
  ('chief_executive_officer', 'ai.automation.review'),
  ('chief_technology_officer', 'ai.automation.review'),
  ('chief_operating_officer', 'ai.automation.review'),
  ('chief_risk_compliance_officer', 'ai.automation.review'),
  ('chief_content_officer', 'ai.automation.review'),
  ('super_admin', 'ai.automation.manage'),
  ('super_admin', 'ai.automation.review'),
  ('super_admin', 'ai.automation.execute')
ON CONFLICT DO NOTHING;

ALTER TABLE ai_provider_configs
  DROP CONSTRAINT IF EXISTS ai_provider_configs_provider_id_check;
ALTER TABLE ai_provider_configs
  ADD CONSTRAINT ai_provider_configs_provider_id_check
  CHECK (provider_id IN ('openai', 'anthropic', 'perplexity', 'xai', 'openrouter', 'x_api'));

ALTER TABLE ai_provider_config_events
  DROP CONSTRAINT IF EXISTS ai_provider_config_events_provider_id_check;
ALTER TABLE ai_provider_config_events
  ADD CONSTRAINT ai_provider_config_events_provider_id_check
  CHECK (provider_id IN ('openai', 'anthropic', 'perplexity', 'xai', 'openrouter', 'x_api'));

ALTER TABLE ai_agent_bindings
  DROP CONSTRAINT IF EXISTS ai_agent_bindings_provider_id_check;
ALTER TABLE ai_agent_bindings
  ADD CONSTRAINT ai_agent_bindings_provider_id_check
  CHECK (provider_id IN ('openai', 'anthropic', 'perplexity', 'xai', 'openrouter'));

ALTER TABLE ai_agent_binding_events
  DROP CONSTRAINT IF EXISTS ai_agent_binding_events_provider_id_check;
ALTER TABLE ai_agent_binding_events
  ADD CONSTRAINT ai_agent_binding_events_provider_id_check
  CHECK (provider_id IN ('openai', 'anthropic', 'perplexity', 'xai', 'openrouter'));

ALTER TABLE ai_workflow_run_evidence
  DROP CONSTRAINT IF EXISTS ai_workflow_run_evidence_provider_id_check;
ALTER TABLE ai_workflow_run_evidence
  ADD CONSTRAINT ai_workflow_run_evidence_provider_id_check
  CHECK (provider_id IN ('openai', 'anthropic', 'perplexity', 'xai', 'openrouter'));

ALTER TABLE ai_agent_bindings
  ADD COLUMN IF NOT EXISTS openrouter_fallback_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS openrouter_model TEXT,
  ADD COLUMN IF NOT EXISTS free_fallback_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS openrouter_credit_floor_usd_micros BIGINT NOT NULL DEFAULT 0;

ALTER TABLE ai_agent_bindings
  DROP CONSTRAINT IF EXISTS ai_agent_bindings_openrouter_model_check,
  DROP CONSTRAINT IF EXISTS ai_agent_bindings_openrouter_credit_floor_check,
  DROP CONSTRAINT IF EXISTS ai_agent_bindings_openrouter_routing_check;
ALTER TABLE ai_agent_bindings
  ADD CONSTRAINT ai_agent_bindings_openrouter_model_check
    CHECK (
      openrouter_model IS NULL OR (
        length(openrouter_model) BETWEEN 1 AND 160
        AND lower(openrouter_model) <> 'openrouter/free'
        AND lower(openrouter_model) NOT LIKE '%:free'
      )
    ),
  ADD CONSTRAINT ai_agent_bindings_openrouter_credit_floor_check
    CHECK (
      openrouter_credit_floor_usd_micros BETWEEN 0 AND 1000000000000
      AND openrouter_credit_floor_usd_micros <= monthly_budget_usd_micros
    ),
  ADD CONSTRAINT ai_agent_bindings_openrouter_routing_check
    CHECK (
      (
        openrouter_fallback_enabled
        AND provider_id <> 'openrouter'
        AND openrouter_model IS NOT NULL
      )
      OR (
        NOT openrouter_fallback_enabled
        AND openrouter_model IS NULL
        AND (
          (
            provider_id = 'openrouter'
            AND (free_fallback_enabled OR openrouter_credit_floor_usd_micros = 0)
          )
          OR (
            provider_id <> 'openrouter'
            AND NOT free_fallback_enabled
            AND openrouter_credit_floor_usd_micros = 0
          )
        )
      )
    );

CREATE TABLE IF NOT EXISTS ai_provider_quota_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  provider_id TEXT NOT NULL CHECK (provider_id = 'openrouter'),
  status TEXT NOT NULL CHECK (status IN (
    'healthy', 'low', 'exhausted', 'rate_limited', 'unavailable'
  )),
  limit_usd_micros BIGINT CHECK (limit_usd_micros IS NULL OR limit_usd_micros >= 0),
  remaining_usd_micros BIGINT CHECK (remaining_usd_micros IS NULL OR remaining_usd_micros >= 0),
  usage_usd_micros BIGINT CHECK (usage_usd_micros IS NULL OR usage_usd_micros >= 0),
  is_free_tier BOOLEAN,
  source TEXT NOT NULL CHECK (source IN ('provider_api', 'request_failure', 'worker_probe')),
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ai_provider_quota_snapshots_latest_idx
  ON ai_provider_quota_snapshots
    (tenant_id, workspace_id, provider_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS ai_automation_policies (
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL CHECK (workflow_id IN (
    'public_intelligence_digest',
    'content_publication',
    'knowledge_promotion',
    'executive_operating_review',
    'provider_budget_failover'
  )),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  interval_minutes INTEGER CHECK (interval_minutes IS NULL OR interval_minutes BETWEEN 5 AND 10080),
  max_concurrency INTEGER NOT NULL DEFAULT 1 CHECK (max_concurrency BETWEEN 1 AND 20),
  policy_version TEXT NOT NULL CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$'),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  next_run_at TIMESTAMPTZ,
  last_enqueued_at TIMESTAMPTZ,
  updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, workspace_id, workflow_id),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE CASCADE,
  CHECK (NOT enabled OR interval_minutes IS NOT NULL OR workflow_id IN (
    'content_publication', 'knowledge_promotion', 'provider_budget_failover'
  ))
);

CREATE INDEX IF NOT EXISTS ai_automation_policies_due_idx
  ON ai_automation_policies (next_run_at, tenant_id, workspace_id)
  WHERE enabled AND next_run_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS ai_automation_policy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('configured', 'enabled', 'disabled')),
  enabled BOOLEAN NOT NULL,
  interval_minutes INTEGER,
  max_concurrency INTEGER NOT NULL,
  policy_version TEXT NOT NULL,
  revision BIGINT NOT NULL CHECK (revision > 0),
  actor_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id, workflow_id)
    REFERENCES ai_automation_policies(tenant_id, workspace_id, workflow_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ai_automation_policy_events_scope_idx
  ON ai_automation_policy_events
    (tenant_id, workspace_id, workflow_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL CHECK (workflow_id IN (
    'public_intelligence_digest',
    'content_publication',
    'knowledge_promotion',
    'executive_operating_review',
    'provider_budget_failover'
  )),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'ai_review', 'manager_review', 'c_level_review', 'approved',
    'executing', 'completed', 'rejected', 'blocked', 'failed', 'cancelled'
  )),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'event', 'scheduled')),
  data_class TEXT NOT NULL CHECK (data_class IN (
    'public', 'aggregate_deidentified', 'approved_platform_content'
  )),
  criticality TEXT NOT NULL CHECK (criticality IN ('noncritical', 'standard', 'critical')),
  resource_type TEXT NOT NULL CHECK (length(resource_type) BETWEEN 2 AND 80),
  resource_id TEXT CHECK (resource_id IS NULL OR length(resource_id) BETWEEN 1 AND 200),
  input_text TEXT NOT NULL CHECK (length(input_text) BETWEEN 8 AND 12000),
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  command_hash TEXT NOT NULL CHECK (command_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  policy_version TEXT NOT NULL CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$'),
  ai_reviewer_ids TEXT[] NOT NULL DEFAULT '{}',
  ai_quorum SMALLINT NOT NULL CHECK (ai_quorum BETWEEN 0 AND 10),
  manager_role_ids TEXT[] NOT NULL DEFAULT '{}',
  manager_quorum SMALLINT NOT NULL CHECK (manager_quorum BETWEEN 0 AND 10),
  c_level_role_ids TEXT[] NOT NULL DEFAULT '{}',
  c_level_quorum SMALLINT NOT NULL CHECK (c_level_quorum BETWEEN 0 AND 10),
  external_effect TEXT NOT NULL CHECK (external_effect IN (
    'none', 'publish', 'knowledge_promotion'
  )),
  free_fallback_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  max_attempts SMALLINT NOT NULL CHECK (max_attempts BETWEEN 1 AND 5),
  lease_owner TEXT CHECK (lease_owner IS NULL OR length(lease_owner) BETWEEN 8 AND 200),
  lease_expires_at TIMESTAMPTZ,
  requested_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  execution_started_at TIMESTAMPTZ,
  execution_connector_id TEXT CHECK (
    execution_connector_id IS NULL OR
    execution_connector_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'
  ),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  failure_code TEXT CHECK (failure_code IS NULL OR failure_code ~ '^[a-z0-9_:-]{2,120}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (id, tenant_id, workspace_id),
  UNIQUE (tenant_id, workspace_id, idempotency_key),
  CHECK (cardinality(ai_reviewer_ids) <= 10 AND ai_quorum <= cardinality(ai_reviewer_ids)),
  CHECK (cardinality(manager_role_ids) <= 20),
  CHECK (cardinality(c_level_role_ids) <= 20),
  CHECK (manager_quorum <= cardinality(manager_role_ids)),
  CHECK (c_level_quorum <= cardinality(c_level_role_ids)),
  CHECK (external_effect = 'none' OR (manager_quorum > 0 AND c_level_quorum > 0)),
  CHECK (NOT free_fallback_allowed OR (data_class = 'public' AND external_effect = 'none')),
  CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL)),
  CHECK (expires_at > created_at),
  CHECK (approved_at IS NULL OR status IN (
    'approved', 'executing', 'completed', 'failed', 'blocked', 'cancelled'
  )),
  CHECK (execution_started_at IS NULL OR (
    execution_connector_id IS NOT NULL AND
    status IN ('executing', 'completed', 'failed', 'blocked')
  )),
  CHECK (completed_at IS NULL OR status IN ('completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS ai_automation_runs_queue_idx
  ON ai_automation_runs (status, created_at, id)
  WHERE status IN ('queued', 'ai_review');

CREATE INDEX IF NOT EXISTS ai_automation_runs_scope_idx
  ON ai_automation_runs
    (tenant_id, workspace_id, status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS ai_automation_runs_lease_idx
  ON ai_automation_runs (lease_expires_at)
  WHERE lease_expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS ai_automation_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id UUID NOT NULL REFERENCES ai_automation_runs(id) ON DELETE RESTRICT,
  review_kind TEXT NOT NULL CHECK (review_kind IN ('ai_agent', 'manager', 'c_level')),
  reviewer_agent_id TEXT CHECK (reviewer_agent_id IS NULL OR reviewer_agent_id IN (
    'mentor_coach', 'news_x_researcher', 'coin_tool_researcher',
    'content_reviewer', 'executive_briefing', 'knowledge_curator',
    'risk_compliance_reviewer'
  )),
  reviewer_worker_id TEXT CHECK (
    reviewer_worker_id IS NULL OR length(reviewer_worker_id) BETWEEN 8 AND 200
  ),
  reviewer_admin_id UUID REFERENCES admin_users(id) ON DELETE RESTRICT,
  reviewer_roles TEXT[] NOT NULL DEFAULT '{}',
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject', 'abstain')),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 8 AND 2000),
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  provider_id TEXT CHECK (provider_id IS NULL OR provider_id IN (
    'openai', 'anthropic', 'perplexity', 'xai', 'openrouter'
  )),
  model TEXT CHECK (model IS NULL OR length(model) BETWEEN 1 AND 160),
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (run_id, tenant_id, workspace_id)
    REFERENCES ai_automation_runs(id, tenant_id, workspace_id) ON DELETE RESTRICT,
  CHECK (jsonb_typeof(source_refs) = 'array'),
  CHECK (octet_length(source_refs::text) <= 32768),
  CHECK (
    (review_kind = 'ai_agent' AND reviewer_agent_id IS NOT NULL
      AND reviewer_worker_id IS NOT NULL AND reviewer_admin_id IS NULL
      AND cardinality(reviewer_roles) = 0 AND provider_id IS NOT NULL AND model IS NOT NULL)
    OR
    (review_kind IN ('manager', 'c_level') AND reviewer_agent_id IS NULL
      AND reviewer_worker_id IS NULL
      AND reviewer_admin_id IS NOT NULL AND cardinality(reviewer_roles) > 0
      AND provider_id IS NULL AND model IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_automation_reviews_agent_once_idx
  ON ai_automation_reviews (run_id, reviewer_agent_id)
  WHERE reviewer_agent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_automation_reviews_human_once_idx
  ON ai_automation_reviews (run_id, reviewer_admin_id)
  WHERE reviewer_admin_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_automation_reviews_scope_idx
  ON ai_automation_reviews
    (tenant_id, workspace_id, run_id, review_kind, created_at ASC);

CREATE TABLE IF NOT EXISTS ai_automation_run_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id UUID NOT NULL REFERENCES ai_automation_runs(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'queued', 'claimed', 'review_recorded', 'status_changed', 'execution_claimed',
    'completed', 'failed', 'blocked', 'cancelled', 'lease_recovered'
  )),
  from_status TEXT,
  to_status TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'worker', 'admin')),
  actor_id TEXT CHECK (actor_id IS NULL OR length(actor_id) BETWEEN 1 AND 200),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (run_id, tenant_id, workspace_id)
    REFERENCES ai_automation_runs(id, tenant_id, workspace_id) ON DELETE RESTRICT,
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (octet_length(metadata::text) <= 8192),
  CHECK (NOT (metadata ?| ARRAY[
    'apiKey', 'api_key', 'secret', 'token', 'password', 'credential',
    'authorization', 'cookie', 'message', 'prompt', 'input', 'output'
  ]))
);

CREATE INDEX IF NOT EXISTS ai_automation_run_events_scope_idx
  ON ai_automation_run_events
    (tenant_id, workspace_id, run_id, created_at ASC, id ASC);

CREATE OR REPLACE FUNCTION tecpey_validate_ai_automation_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target ai_automation_runs%ROWTYPE;
  actual_roles TEXT[];
BEGIN
  SELECT * INTO target
    FROM ai_automation_runs
   WHERE id = NEW.run_id
     AND tenant_id = NEW.tenant_id
     AND workspace_id = NEW.workspace_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI automation review scope mismatch'
      USING ERRCODE = '23503';
  END IF;
  IF target.status IN ('approved', 'executing', 'completed', 'rejected', 'blocked', 'failed', 'cancelled')
     OR target.expires_at <= NOW() THEN
    RAISE EXCEPTION 'AI automation run is not reviewable'
      USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM ai_automation_policies policy
     WHERE policy.tenant_id = target.tenant_id
       AND policy.workspace_id = target.workspace_id
       AND policy.workflow_id = target.workflow_id
       AND policy.enabled
       AND policy.policy_version = target.policy_version
  ) THEN
    RAISE EXCEPTION 'AI automation policy is disabled or superseded'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.review_kind = 'ai_agent' AND (
       target.status <> 'ai_review'
       OR target.lease_owner IS DISTINCT FROM NEW.reviewer_worker_id
       OR target.lease_expires_at IS NULL
       OR target.lease_expires_at <= NOW()
     ) THEN
    RAISE EXCEPTION 'AI automation review lease is invalid'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.review_kind = 'manager' AND target.status <> 'manager_review' THEN
    RAISE EXCEPTION 'AI automation manager review is outside its gate'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.review_kind = 'c_level' AND target.status <> 'c_level_review' THEN
    RAISE EXCEPTION 'AI automation C-level review is outside its gate'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.reviewer_admin_id IS NOT NULL AND NEW.reviewer_admin_id = target.requested_by THEN
    RAISE EXCEPTION 'AI automation requester cannot approve own run'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.reviewer_admin_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT user_role.role_id ORDER BY user_role.role_id), '{}'::text[])
      INTO actual_roles
      FROM admin_users admin_user
      JOIN admin_user_roles user_role
        ON user_role.admin_id = admin_user.id AND user_role.revoked_at IS NULL
     WHERE admin_user.id = NEW.reviewer_admin_id
       AND admin_user.tenant_id = NEW.tenant_id
       AND admin_user.workspace_id = NEW.workspace_id
       AND admin_user.status = 'active';
    IF cardinality(actual_roles) = 0 THEN
      RAISE EXCEPTION 'AI automation human reviewer is not active in scope'
        USING ERRCODE = '42501';
    END IF;
    NEW.reviewer_roles := actual_roles;
  END IF;
  IF NEW.review_kind = 'ai_agent' AND NOT (NEW.reviewer_agent_id = ANY(target.ai_reviewer_ids)) THEN
    RAISE EXCEPTION 'AI reviewer is outside policy snapshot'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.review_kind = 'manager' AND NOT (NEW.reviewer_roles && target.manager_role_ids) THEN
    RAISE EXCEPTION 'Manager reviewer role is outside policy snapshot'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.review_kind = 'c_level' AND NOT (NEW.reviewer_roles && target.c_level_role_ids) THEN
    RAISE EXCEPTION 'C-level reviewer role is outside policy snapshot'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION tecpey_guard_ai_automation_run_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ai_approvals INTEGER;
  manager_approvals INTEGER;
  c_level_approvals INTEGER;
  rejection_count INTEGER;
  transition_allowed BOOLEAN;
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id
     OR NEW.workspace_id <> OLD.workspace_id
     OR NEW.workflow_id <> OLD.workflow_id
     OR NEW.trigger_type <> OLD.trigger_type
     OR NEW.data_class <> OLD.data_class
     OR NEW.criticality <> OLD.criticality
     OR NEW.resource_type <> OLD.resource_type
     OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
     OR NEW.input_text <> OLD.input_text
     OR NEW.input_hash <> OLD.input_hash
     OR NEW.command_hash <> OLD.command_hash
     OR NEW.idempotency_key <> OLD.idempotency_key
     OR NEW.policy_version <> OLD.policy_version
     OR NEW.ai_reviewer_ids <> OLD.ai_reviewer_ids
     OR NEW.ai_quorum <> OLD.ai_quorum
     OR NEW.manager_role_ids <> OLD.manager_role_ids
     OR NEW.manager_quorum <> OLD.manager_quorum
     OR NEW.c_level_role_ids <> OLD.c_level_role_ids
     OR NEW.c_level_quorum <> OLD.c_level_quorum
     OR NEW.external_effect <> OLD.external_effect
     OR NEW.free_fallback_allowed <> OLD.free_fallback_allowed
     OR NEW.max_attempts <> OLD.max_attempts
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.expires_at <> OLD.expires_at
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'AI automation immutable run fields cannot change'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.execution_connector_id IS DISTINCT FROM OLD.execution_connector_id
     AND NOT (
       OLD.status = 'approved'
       AND NEW.status = 'executing'
       AND OLD.execution_connector_id IS NULL
       AND NEW.execution_connector_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'AI automation execution connector binding cannot change'
      USING ERRCODE = '55000';
  END IF;

  transition_allowed := NEW.status = OLD.status OR CASE OLD.status
    WHEN 'queued' THEN NEW.status IN ('ai_review', 'manager_review', 'c_level_review', 'approved', 'blocked', 'failed', 'cancelled')
    WHEN 'ai_review' THEN NEW.status IN ('manager_review', 'c_level_review', 'approved', 'rejected', 'blocked', 'failed', 'cancelled')
    WHEN 'manager_review' THEN NEW.status IN ('c_level_review', 'approved', 'rejected', 'blocked', 'failed', 'cancelled')
    WHEN 'c_level_review' THEN NEW.status IN ('approved', 'rejected', 'blocked', 'failed', 'cancelled')
    WHEN 'approved' THEN NEW.status IN ('executing', 'blocked', 'cancelled')
    WHEN 'executing' THEN NEW.status IN ('completed', 'failed', 'blocked')
    ELSE FALSE
  END;
  IF NOT transition_allowed THEN
    RAISE EXCEPTION 'Invalid AI automation state transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '55000';
  END IF;
  IF NEW.status = 'executing' AND OLD.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Expired AI automation approval cannot execute'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.status = 'executing' AND NOT EXISTS (
    SELECT 1
      FROM ai_automation_policies policy
     WHERE policy.tenant_id = OLD.tenant_id
       AND policy.workspace_id = OLD.workspace_id
       AND policy.workflow_id = OLD.workflow_id
       AND policy.enabled
       AND policy.policy_version = OLD.policy_version
  ) THEN
    RAISE EXCEPTION 'Disabled or superseded AI automation policy cannot execute'
      USING ERRCODE = '55000';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE review_kind = 'ai_agent' AND decision = 'approve'),
    COUNT(*) FILTER (WHERE review_kind = 'manager' AND decision = 'approve'),
    COUNT(*) FILTER (WHERE review_kind = 'c_level' AND decision = 'approve'),
    COUNT(*) FILTER (WHERE decision = 'reject')
  INTO ai_approvals, manager_approvals, c_level_approvals, rejection_count
  FROM ai_automation_reviews
  WHERE run_id = OLD.id;

  IF NEW.status IN ('manager_review', 'c_level_review', 'approved', 'executing', 'completed')
     AND (rejection_count > 0 OR ai_approvals < OLD.ai_quorum) THEN
    RAISE EXCEPTION 'AI automation AI quorum is not satisfied'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status IN ('c_level_review', 'approved', 'executing', 'completed')
     AND manager_approvals < OLD.manager_quorum THEN
    RAISE EXCEPTION 'AI automation manager quorum is not satisfied'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status IN ('approved', 'executing', 'completed')
     AND c_level_approvals < OLD.c_level_quorum THEN
    RAISE EXCEPTION 'AI automation C-level quorum is not satisfied'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'approved' AND NEW.approved_at IS NULL THEN
    NEW.approved_at := NOW();
  END IF;
  IF NEW.status = 'executing' AND NEW.execution_started_at IS NULL THEN
    NEW.execution_started_at := NOW();
  END IF;
  IF NEW.status IN ('completed', 'failed') AND NEW.completed_at IS NULL THEN
    NEW.completed_at := NOW();
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_automation_reviews_validate ON ai_automation_reviews;
CREATE TRIGGER ai_automation_reviews_validate
BEFORE INSERT ON ai_automation_reviews
FOR EACH ROW EXECUTE FUNCTION tecpey_validate_ai_automation_review();

DROP TRIGGER IF EXISTS ai_automation_runs_guard_transition ON ai_automation_runs;
CREATE TRIGGER ai_automation_runs_guard_transition
BEFORE UPDATE ON ai_automation_runs
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_ai_automation_run_transition();

DROP TRIGGER IF EXISTS ai_automation_policy_events_no_update ON ai_automation_policy_events;
CREATE TRIGGER ai_automation_policy_events_no_update
BEFORE UPDATE ON ai_automation_policy_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();
DROP TRIGGER IF EXISTS ai_automation_policy_events_no_delete ON ai_automation_policy_events;
CREATE TRIGGER ai_automation_policy_events_no_delete
BEFORE DELETE ON ai_automation_policy_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();

DROP TRIGGER IF EXISTS ai_provider_quota_snapshots_no_update ON ai_provider_quota_snapshots;
CREATE TRIGGER ai_provider_quota_snapshots_no_update
BEFORE UPDATE ON ai_provider_quota_snapshots
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();
DROP TRIGGER IF EXISTS ai_provider_quota_snapshots_no_delete ON ai_provider_quota_snapshots;
CREATE TRIGGER ai_provider_quota_snapshots_no_delete
BEFORE DELETE ON ai_provider_quota_snapshots
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();

DROP TRIGGER IF EXISTS ai_automation_reviews_no_update ON ai_automation_reviews;
CREATE TRIGGER ai_automation_reviews_no_update
BEFORE UPDATE ON ai_automation_reviews
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();
DROP TRIGGER IF EXISTS ai_automation_reviews_no_delete ON ai_automation_reviews;
CREATE TRIGGER ai_automation_reviews_no_delete
BEFORE DELETE ON ai_automation_reviews
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();

DROP TRIGGER IF EXISTS ai_automation_run_events_no_update ON ai_automation_run_events;
CREATE TRIGGER ai_automation_run_events_no_update
BEFORE UPDATE ON ai_automation_run_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();
DROP TRIGGER IF EXISTS ai_automation_run_events_no_delete ON ai_automation_run_events;
CREATE TRIGGER ai_automation_run_events_no_delete
BEFORE DELETE ON ai_automation_run_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();

INSERT INTO ai_automation_policies (
  tenant_id, workspace_id, workflow_id, enabled, interval_minutes,
  max_concurrency, policy_version, next_run_at
)
SELECT workspace.tenant_id,
       workspace.id,
       seed.workflow_id,
       FALSE,
       seed.interval_minutes,
       1,
       '2026-08-28.1',
       NULL
  FROM platform_workspaces workspace
 CROSS JOIN (VALUES
   ('public_intelligence_digest', 30),
   ('content_publication', NULL),
   ('knowledge_promotion', NULL),
   ('executive_operating_review', 1440),
   ('provider_budget_failover', NULL)
 ) AS seed(workflow_id, interval_minutes)
ON CONFLICT (tenant_id, workspace_id, workflow_id) DO NOTHING;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runAiAutomationOrchestrationMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(AI_AUTOMATION_ORCHESTRATION_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-ai-automation] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-ai-automation] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(AI_AUTOMATION_ORCHESTRATION_SQL);
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
