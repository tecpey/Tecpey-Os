import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0118_ai_model_evaluation_authority.sql";

export const AI_MODEL_EVALUATION_TABLES = Object.freeze([
  "ai_model_capability_snapshots",
  "ai_model_eval_runs",
  "ai_model_eval_metric_results",
] as const);

export const AI_MODEL_EVALUATION_AUTHORITY_SQL = `
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS ai_model_capability_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  provider_id TEXT NOT NULL CHECK (
    provider_id IN ('openai','anthropic','perplexity','xai','openrouter')
  ),
  requested_model TEXT NOT NULL CHECK (
    char_length(requested_model) BETWEEN 1 AND 160
    AND requested_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
  ),
  canonical_model TEXT NOT NULL CHECK (
    char_length(canonical_model) BETWEEN 1 AND 160
    AND canonical_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
  ),
  observed_at TIMESTAMPTZ NOT NULL,
  exact_model_identity BOOLEAN NOT NULL,
  deprecated BOOLEAN NOT NULL,
  zero_data_retention BOOLEAN NOT NULL,
  supported_data_classes JSONB NOT NULL CHECK (
    jsonb_typeof(supported_data_classes) = 'array'
    AND jsonb_array_length(supported_data_classes) BETWEEN 1 AND 5
    AND octet_length(supported_data_classes::text) <= 2048
  ),
  capabilities JSONB NOT NULL CHECK (
    jsonb_typeof(capabilities) = 'array'
    AND jsonb_array_length(capabilities) BETWEEN 1 AND 32
    AND octet_length(capabilities::text) <= 4096
  ),
  tools JSONB NOT NULL CHECK (
    jsonb_typeof(tools) = 'array'
    AND jsonb_array_length(tools) <= 32
    AND octet_length(tools::text) <= 4096
  ),
  cache_mode TEXT NOT NULL CHECK (
    cache_mode IN ('none','implicit','explicit','provider_specific')
  ),
  evidence_hash CHAR(64) NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (id, tenant_id, workspace_id),
  UNIQUE (tenant_id, workspace_id, evidence_hash)
);

CREATE INDEX IF NOT EXISTS ai_model_capability_latest_idx
  ON ai_model_capability_snapshots
    (tenant_id, workspace_id, provider_id, requested_model, observed_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS ai_model_eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL CHECK (task_id IN (
    'news_translate','news_validate','growth_scan','growth_deep_research',
    'knowledge_curate','mentor_coach','mentor_public_research','content_review',
    'executive_synthesis'
  )),
  eval_suite_id TEXT NOT NULL CHECK (
    char_length(eval_suite_id) BETWEEN 3 AND 120
    AND eval_suite_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{2,119}$'
  ),
  provider_id TEXT NOT NULL CHECK (
    provider_id IN ('openai','anthropic','perplexity','xai','openrouter')
  ),
  requested_model TEXT NOT NULL CHECK (
    char_length(requested_model) BETWEEN 1 AND 160
    AND requested_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
  ),
  canonical_model TEXT NOT NULL CHECK (
    char_length(canonical_model) BETWEEN 1 AND 160
    AND canonical_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
  ),
  measured_at TIMESTAMPTZ NOT NULL,
  dataset_version TEXT NOT NULL CHECK (
    char_length(dataset_version) BETWEEN 1 AND 120
    AND dataset_version ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$'
  ),
  dataset_hash CHAR(64) NOT NULL CHECK (dataset_hash ~ '^[0-9a-f]{64}$'),
  evaluator_kind TEXT NOT NULL CHECK (
    evaluator_kind IN ('deterministic','human_review','blind_pairwise')
  ),
  evaluator_version TEXT NOT NULL CHECK (
    char_length(evaluator_version) BETWEEN 1 AND 120
    AND evaluator_version ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$'
  ),
  sample_size INTEGER NOT NULL CHECK (sample_size BETWEEN 0 AND 10000000),
  quality_basis_points INTEGER NOT NULL CHECK (
    quality_basis_points BETWEEN 0 AND 10000
  ),
  passed BOOLEAN NOT NULL,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(reasons) = 'array' AND octet_length(reasons::text) <= 16384
  ),
  policy_version TEXT NOT NULL CHECK (char_length(policy_version) BETWEEN 8 AND 80),
  evidence_hash CHAR(64) NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (id, tenant_id, workspace_id),
  UNIQUE (tenant_id, workspace_id, evidence_hash)
);

CREATE INDEX IF NOT EXISTS ai_model_eval_latest_idx
  ON ai_model_eval_runs
    (tenant_id, workspace_id, task_id, provider_id, canonical_model, measured_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS ai_model_eval_metric_results (
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id UUID NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN (
    'factuality','citation_coverage','structured_output_validity',
    'safety_refusal_consistency','persian_quality','english_quality',
    'latency_p95_ms','cost_per_sample_usd_micros'
  )),
  status TEXT NOT NULL CHECK (status IN ('measured','not_applicable')),
  sample_count INTEGER NOT NULL CHECK (sample_count BETWEEN 0 AND 10000000),
  score_basis_points INTEGER CHECK (
    score_basis_points IS NULL OR score_basis_points BETWEEN 0 AND 10000
  ),
  measured_value NUMERIC(24,6) CHECK (
    measured_value IS NULL OR measured_value >= 0
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, workspace_id, run_id, metric),
  FOREIGN KEY (run_id, tenant_id, workspace_id)
    REFERENCES ai_model_eval_runs(id, tenant_id, workspace_id) ON DELETE RESTRICT,
  CHECK (
    (status = 'not_applicable' AND sample_count = 0
      AND score_basis_points IS NULL AND measured_value IS NULL)
    OR
    (status = 'measured' AND sample_count > 0 AND (
      (metric IN (
        'factuality','citation_coverage','structured_output_validity',
        'safety_refusal_consistency','persian_quality','english_quality'
      ) AND score_basis_points IS NOT NULL AND measured_value IS NULL)
      OR
      (metric IN ('latency_p95_ms','cost_per_sample_usd_micros')
        AND score_basis_points IS NULL AND measured_value IS NOT NULL)
    ))
  )
);

CREATE INDEX IF NOT EXISTS ai_model_eval_metric_run_idx
  ON ai_model_eval_metric_results (tenant_id, workspace_id, run_id, metric);

REVOKE ALL ON TABLE
  ai_model_capability_snapshots,
  ai_model_eval_runs,
  ai_model_eval_metric_results
FROM PUBLIC, tecpey_ai_tenant_runtime, tecpey_ai_worker;

GRANT SELECT, INSERT ON TABLE
  ai_model_capability_snapshots,
  ai_model_eval_runs,
  ai_model_eval_metric_results
TO tecpey_ai_tenant_runtime;

DO $model_eval_rls$
DECLARE relation_name TEXT;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'ai_model_capability_snapshots',
    'ai_model_eval_runs',
    'ai_model_eval_metric_results'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      relation_name || '_tenant_scope',
      relation_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO tecpey_ai_tenant_runtime USING (jsonb_build_array(tenant_id, workspace_id) = (SELECT tecpey_ai_authorized_context())) WITH CHECK (jsonb_build_array(tenant_id, workspace_id) = (SELECT tecpey_ai_authorized_context()))',
      relation_name || '_tenant_scope',
      relation_name
    );
  END LOOP;
END
$model_eval_rls$;

CREATE OR REPLACE FUNCTION tecpey_guard_model_eval_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $guard$
BEGIN
  RAISE EXCEPTION 'model evaluation evidence is append-only'
    USING ERRCODE = '55000';
END
$guard$;
REVOKE ALL ON FUNCTION tecpey_guard_model_eval_append_only() FROM PUBLIC;

DROP TRIGGER IF EXISTS ai_model_capability_snapshots_append_only
  ON ai_model_capability_snapshots;
CREATE TRIGGER ai_model_capability_snapshots_append_only
BEFORE UPDATE OR DELETE ON ai_model_capability_snapshots
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_model_eval_append_only();

DROP TRIGGER IF EXISTS ai_model_eval_runs_append_only ON ai_model_eval_runs;
CREATE TRIGGER ai_model_eval_runs_append_only
BEFORE UPDATE OR DELETE ON ai_model_eval_runs
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_model_eval_append_only();

DROP TRIGGER IF EXISTS ai_model_eval_metric_results_append_only
  ON ai_model_eval_metric_results;
CREATE TRIGGER ai_model_eval_metric_results_append_only
BEFORE UPDATE OR DELETE ON ai_model_eval_metric_results
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_model_eval_append_only();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runAiModelEvaluationAuthorityMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(AI_MODEL_EVALUATION_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-ai-model-evaluation] checksum mismatch for ${FILENAME}`);
    }
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(AI_MODEL_EVALUATION_AUTHORITY_SQL);
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
