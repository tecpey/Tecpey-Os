import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0117_ai_model_lab_execution_authority.sql";

export const MODEL_LAB_EXECUTION_TABLES = Object.freeze([
  "ai_model_lab_egress_admissions",
  "ai_model_lab_execution_results",
] as const);

export const MODEL_LAB_EXECUTION_AUTHORITY_SQL = `
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE UNIQUE INDEX IF NOT EXISTS ai_model_lab_candidates_scoped_identity_uq
  ON ai_model_lab_candidates (id, run_id, tenant_id, workspace_id);

CREATE TABLE IF NOT EXISTS ai_model_lab_egress_admissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  run_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  agent_id TEXT NOT NULL CHECK (agent_id IN (
    'mentor_coach','news_x_researcher','coin_tool_researcher','growth_hacker',
    'content_reviewer','executive_briefing','knowledge_curator','risk_compliance_reviewer'
  )),
  provider_id TEXT NOT NULL CHECK (provider_id IN (
    'openai','anthropic','perplexity','xai','openrouter'
  )),
  endpoint_id TEXT NOT NULL CHECK (endpoint_id IN (
    'openai_responses','anthropic_messages','xai_responses',
    'perplexity_agent','openrouter_chat_completions'
  )),
  requested_model TEXT NOT NULL CHECK (
    char_length(requested_model) BETWEEN 1 AND 160
    AND requested_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
  ),
  canonical_model TEXT NOT NULL CHECK (
    char_length(canonical_model) BETWEEN 1 AND 160
    AND canonical_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
  ),
  reservation_id UUID NOT NULL,
  reserved_usd_micros BIGINT NOT NULL
    CHECK (reserved_usd_micros BETWEEN 1000 AND 100000000000),
  input_digest CHAR(64) NOT NULL CHECK (input_digest ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (run_id, tenant_id, workspace_id, account_id)
    REFERENCES ai_model_lab_runs(id, tenant_id, workspace_id, account_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (candidate_id, run_id, tenant_id, workspace_id)
    REFERENCES ai_model_lab_candidates(id, run_id, tenant_id, workspace_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (reservation_id, tenant_id, workspace_id, agent_id)
    REFERENCES ai_spend_reservations(id, tenant_id, workspace_id, agent_id)
    ON DELETE RESTRICT,
  UNIQUE (attempt_id, tenant_id, workspace_id, account_id, run_id, candidate_id),
  UNIQUE (tenant_id, workspace_id, account_id, run_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS ai_model_lab_execution_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  run_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  provider_id TEXT NOT NULL CHECK (provider_id IN (
    'openai','anthropic','perplexity','xai','openrouter'
  )),
  requested_model TEXT NOT NULL CHECK (
    char_length(requested_model) BETWEEN 1 AND 160
    AND requested_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
  ),
  actual_model TEXT CHECK (
    actual_model IS NULL OR (
      char_length(actual_model) BETWEEN 1 AND 160
      AND actual_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
    )
  ),
  model_identity_verified BOOLEAN NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'succeeded','failed','cancelled','authority_failed'
  )),
  failure_reason TEXT CHECK (
    failure_reason IS NULL OR failure_reason ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  output_hash CHAR(64) CHECK (
    output_hash IS NULL OR output_hash ~ '^[0-9a-f]{64}$'
  ),
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(source_refs) = 'array' AND octet_length(source_refs::text) <= 32768),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens BETWEEN 0 AND 10000000),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens BETWEEN 0 AND 10000000),
  reported_cost_usd_micros BIGINT CHECK (
    reported_cost_usd_micros IS NULL OR reported_cost_usd_micros >= 0
  ),
  charged_cost_usd_micros BIGINT NOT NULL CHECK (charged_cost_usd_micros >= 0),
  duration_ms INTEGER NOT NULL CHECK (duration_ms BETWEEN 0 AND 30000),
  reconciliation_required BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (
    attempt_id, tenant_id, workspace_id, account_id, run_id, candidate_id
  ) REFERENCES ai_model_lab_egress_admissions(
    attempt_id, tenant_id, workspace_id, account_id, run_id, candidate_id
  ) ON DELETE RESTRICT,
  UNIQUE (attempt_id),
  CHECK (
    status <> 'succeeded'
    OR (
      actual_model IS NOT NULL
      AND model_identity_verified = TRUE
      AND output_hash IS NOT NULL
      AND failure_reason IS NULL
    )
  ),
  CHECK (
    status = 'succeeded'
    OR model_identity_verified = FALSE
    OR actual_model IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS ai_model_lab_egress_scope_created_idx
  ON ai_model_lab_egress_admissions
    (tenant_id, workspace_id, account_id, run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_model_lab_execution_scope_created_idx
  ON ai_model_lab_execution_results
    (tenant_id, workspace_id, account_id, run_id, created_at DESC);

REVOKE ALL ON TABLE
  ai_model_lab_egress_admissions,
  ai_model_lab_execution_results
FROM PUBLIC, tecpey_ai_tenant_runtime, tecpey_ai_worker;

GRANT SELECT, INSERT ON TABLE
  ai_model_lab_egress_admissions,
  ai_model_lab_execution_results
TO tecpey_ai_tenant_runtime;

DO $model_lab_execution_rls$
DECLARE relation_name TEXT;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'ai_model_lab_egress_admissions',
    'ai_model_lab_execution_results'
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
$model_lab_execution_rls$;

CREATE OR REPLACE FUNCTION tecpey_guard_model_lab_execution_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $guard$
BEGIN
  RAISE EXCEPTION 'model lab execution evidence is append-only'
    USING ERRCODE = '55000';
END
$guard$;
REVOKE ALL ON FUNCTION tecpey_guard_model_lab_execution_append_only() FROM PUBLIC;

DROP TRIGGER IF EXISTS ai_model_lab_egress_admissions_append_only
  ON ai_model_lab_egress_admissions;
CREATE TRIGGER ai_model_lab_egress_admissions_append_only
BEFORE UPDATE OR DELETE ON ai_model_lab_egress_admissions
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_model_lab_execution_append_only();

DROP TRIGGER IF EXISTS ai_model_lab_execution_results_append_only
  ON ai_model_lab_execution_results;
CREATE TRIGGER ai_model_lab_execution_results_append_only
BEFORE UPDATE OR DELETE ON ai_model_lab_execution_results
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_model_lab_execution_append_only();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runModelLabExecutionAuthorityMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(MODEL_LAB_EXECUTION_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-model-lab-execution] checksum mismatch for ${FILENAME}`);
    }
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(MODEL_LAB_EXECUTION_AUTHORITY_SQL);
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
