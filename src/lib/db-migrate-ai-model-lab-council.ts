import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0116_ai_model_lab_council_authority.sql";

export const MODEL_LAB_COUNCIL_TABLES = Object.freeze([
  "ai_model_lab_runs",
  "ai_model_lab_candidates",
  "ai_council_syntheses",
] as const);

export const MODEL_LAB_COUNCIL_AUTHORITY_SQL = `
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS ai_model_lab_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  task_id TEXT NOT NULL CHECK (task_id ~ '^[a-z][a-z0-9_]{2,80}$'),
  agent_id TEXT NOT NULL CHECK (agent_id IN (
    'mentor_coach','news_x_researcher','coin_tool_researcher','growth_hacker',
    'content_reviewer','executive_briefing','knowledge_curator','risk_compliance_reviewer'
  )),
  data_class TEXT NOT NULL CHECK (data_class IN (
    'public','aggregate_deidentified','approved_platform_content','private_user','restricted_admin'
  )),
  prompt_digest CHAR(64) NOT NULL CHECK (prompt_digest ~ '^[0-9a-f]{64}$'),
  decision_hash CHAR(64) NOT NULL CHECK (decision_hash ~ '^[0-9a-f]{64}$'),
  policy_version TEXT NOT NULL CHECK (char_length(policy_version) BETWEEN 8 AND 80),
  idempotency_key TEXT NOT NULL
    CHECK (char_length(idempotency_key) BETWEEN 16 AND 120 AND idempotency_key ~ '^[A-Za-z0-9._:-]+$'),
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('admitted','blocked')),
  candidate_count INTEGER NOT NULL CHECK (candidate_count BETWEEN 2 AND 6),
  entitlement_snapshot_version BIGINT NOT NULL CHECK (entitlement_snapshot_version >= 1),
  subscription_id UUID NOT NULL,
  subscription_state_version BIGINT NOT NULL CHECK (subscription_state_version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (id, tenant_id, workspace_id),
  UNIQUE (id, tenant_id, workspace_id, account_id),
  UNIQUE (tenant_id, workspace_id, account_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS ai_model_lab_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id UUID NOT NULL,
  provider_id TEXT NOT NULL CHECK (provider_id IN ('openai','anthropic','perplexity','xai','openrouter')),
  endpoint_id TEXT NOT NULL CHECK (endpoint_id IN (
    'openai_responses','anthropic_messages','xai_responses','perplexity_agent','openrouter_chat_completions'
  )),
  requested_model TEXT NOT NULL CHECK (
    char_length(requested_model) BETWEEN 1 AND 160
    AND requested_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
  ),
  canonical_model TEXT NOT NULL CHECK (
    char_length(canonical_model) BETWEEN 1 AND 160
    AND canonical_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
  ),
  eligibility TEXT NOT NULL CHECK (eligibility IN ('eligible','rejected')),
  rejection_codes JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(rejection_codes) = 'array' AND octet_length(rejection_codes::text) <= 8192),
  capability_observed_at TIMESTAMPTZ NOT NULL,
  eval_measured_at TIMESTAMPTZ,
  eval_sample_size INTEGER CHECK (eval_sample_size IS NULL OR eval_sample_size >= 0),
  quality_basis_points INTEGER CHECK (
    quality_basis_points IS NULL OR quality_basis_points BETWEEN 0 AND 10000
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (run_id, tenant_id, workspace_id)
    REFERENCES ai_model_lab_runs(id, tenant_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, run_id, provider_id, endpoint_id, canonical_model)
);

CREATE TABLE IF NOT EXISTS ai_council_syntheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  model_lab_run_id UUID,
  input_digest CHAR(64) NOT NULL CHECK (input_digest ~ '^[0-9a-f]{64}$'),
  synthesis_hash CHAR(64) NOT NULL CHECK (synthesis_hash ~ '^[0-9a-f]{64}$'),
  policy_version TEXT NOT NULL CHECK (char_length(policy_version) BETWEEN 8 AND 80),
  idempotency_key TEXT NOT NULL
    CHECK (char_length(idempotency_key) BETWEEN 16 AND 120 AND idempotency_key ~ '^[A-Za-z0-9._:-]+$'),
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  contributions JSONB NOT NULL CHECK (
    jsonb_typeof(contributions) = 'array' AND octet_length(contributions::text) <= 65536
  ),
  agreements JSONB NOT NULL CHECK (
    jsonb_typeof(agreements) = 'array' AND octet_length(agreements::text) <= 32768
  ),
  disagreements JSONB NOT NULL CHECK (
    jsonb_typeof(disagreements) = 'array' AND octet_length(disagreements::text) <= 32768
  ),
  unresolved JSONB NOT NULL CHECK (
    jsonb_typeof(unresolved) = 'array' AND octet_length(unresolved::text) <= 32768
  ),
  entitlement_snapshot_version BIGINT NOT NULL CHECK (entitlement_snapshot_version >= 1),
  subscription_id UUID NOT NULL,
  subscription_state_version BIGINT NOT NULL CHECK (subscription_state_version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (model_lab_run_id, tenant_id, workspace_id, account_id)
    REFERENCES ai_model_lab_runs(id, tenant_id, workspace_id, account_id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, account_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ai_model_lab_runs_scope_created_idx
  ON ai_model_lab_runs (tenant_id, workspace_id, account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_model_lab_candidates_run_idx
  ON ai_model_lab_candidates (tenant_id, workspace_id, run_id, provider_id, canonical_model);
CREATE INDEX IF NOT EXISTS ai_council_syntheses_scope_created_idx
  ON ai_council_syntheses (tenant_id, workspace_id, account_id, created_at DESC);

REVOKE ALL ON TABLE ai_model_lab_runs, ai_model_lab_candidates, ai_council_syntheses
FROM PUBLIC, tecpey_ai_tenant_runtime, tecpey_ai_worker;
GRANT SELECT, INSERT ON TABLE ai_model_lab_runs, ai_model_lab_candidates, ai_council_syntheses
TO tecpey_ai_tenant_runtime;

DO $model_lab_rls$
DECLARE relation_name TEXT;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'ai_model_lab_runs','ai_model_lab_candidates','ai_council_syntheses'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', relation_name || '_tenant_scope', relation_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO tecpey_ai_tenant_runtime USING (jsonb_build_array(tenant_id, workspace_id) = (SELECT tecpey_ai_authorized_context())) WITH CHECK (jsonb_build_array(tenant_id, workspace_id) = (SELECT tecpey_ai_authorized_context()))',
      relation_name || '_tenant_scope',
      relation_name
    );
  END LOOP;
END
$model_lab_rls$;

CREATE OR REPLACE FUNCTION tecpey_guard_model_lab_council_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $guard$
BEGIN
  RAISE EXCEPTION 'model lab and council evidence is append-only'
    USING ERRCODE = '55000';
END
$guard$;
REVOKE ALL ON FUNCTION tecpey_guard_model_lab_council_append_only() FROM PUBLIC;

DROP TRIGGER IF EXISTS ai_model_lab_runs_append_only ON ai_model_lab_runs;
CREATE TRIGGER ai_model_lab_runs_append_only
BEFORE UPDATE OR DELETE ON ai_model_lab_runs
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_model_lab_council_append_only();

DROP TRIGGER IF EXISTS ai_model_lab_candidates_append_only ON ai_model_lab_candidates;
CREATE TRIGGER ai_model_lab_candidates_append_only
BEFORE UPDATE OR DELETE ON ai_model_lab_candidates
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_model_lab_council_append_only();

DROP TRIGGER IF EXISTS ai_council_syntheses_append_only ON ai_council_syntheses;
CREATE TRIGGER ai_council_syntheses_append_only
BEFORE UPDATE OR DELETE ON ai_council_syntheses
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_model_lab_council_append_only();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runModelLabCouncilAuthorityMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(MODEL_LAB_COUNCIL_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-model-lab-council] checksum mismatch for ${FILENAME}`);
    }
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(MODEL_LAB_COUNCIL_AUTHORITY_SQL);
    await client.query(
      "INSERT INTO _migrations (filename, checksum) VALUES ($1,$2)",
      [FILENAME, cs],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
