import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0106_mentor_eval_promotion_authority.sql";

export const MENTOR_EVAL_PROMOTION_AUTHORITY_SQL = `
CREATE TABLE IF NOT EXISTS ai_mentor_eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  candidate_sha TEXT NOT NULL,
  candidate_tree TEXT NOT NULL,
  provider_id TEXT NOT NULL CHECK (provider_id IN (
    'openai', 'anthropic', 'perplexity', 'xai', 'openrouter'
  )),
  requested_model TEXT NOT NULL,
  actual_model TEXT NOT NULL,
  prompt_hash CHAR(64) NOT NULL,
  trust_policy_version TEXT NOT NULL,
  evidence_policy_version TEXT NOT NULL,
  eval_contract_version TEXT NOT NULL,
  dataset_version TEXT NOT NULL,
  dataset_hash CHAR(64) NOT NULL,
  evaluator_version TEXT NOT NULL,
  baseline_run_id UUID,
  release_decision TEXT NOT NULL CHECK (release_decision IN ('pass', 'block')),
  hard_gate_failure_count INTEGER NOT NULL CHECK (hard_gate_failure_count >= 0),
  evidence_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_mentor_eval_runs_workspace_fk
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT ai_mentor_eval_runs_scope_key
    UNIQUE (tenant_id, workspace_id, id),
  CONSTRAINT ai_mentor_eval_runs_baseline_scope_fk
    FOREIGN KEY (tenant_id, workspace_id, baseline_run_id)
    REFERENCES ai_mentor_eval_runs(tenant_id, workspace_id, id) ON DELETE RESTRICT,
  CHECK (candidate_sha ~ '^[a-f0-9]{40,64}$'),
  CHECK (candidate_tree ~ '^[a-f0-9]{40,64}$'),
  CHECK (length(requested_model) BETWEEN 1 AND 160),
  CHECK (length(actual_model) BETWEEN 1 AND 160),
  CHECK (prompt_hash ~ '^[a-f0-9]{64}$'),
  CHECK (dataset_hash ~ '^[a-f0-9]{64}$'),
  CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  CHECK (length(trust_policy_version) BETWEEN 1 AND 80),
  CHECK (length(evidence_policy_version) BETWEEN 1 AND 80),
  CHECK (length(eval_contract_version) BETWEEN 1 AND 80),
  CHECK (length(dataset_version) BETWEEN 1 AND 120),
  CHECK (length(evaluator_version) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS ai_mentor_eval_runs_candidate_idx
  ON ai_mentor_eval_runs
    (tenant_id, workspace_id, candidate_sha, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_mentor_eval_runs_decision_idx
  ON ai_mentor_eval_runs
    (tenant_id, workspace_id, release_decision, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_mentor_eval_metric_results (
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id UUID NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN (
    'safety_hard_gate',
    'privacy_egress',
    'research_citation',
    'curriculum_grounding',
    'pedagogy_helpfulness',
    'locale_parity',
    'next_item_correctness',
    'response_latency'
  )),
  hard_gate BOOLEAN NOT NULL,
  pass_rate NUMERIC(7,6),
  minimum_pass_rate NUMERIC(7,6),
  baseline_measured BOOLEAN NOT NULL DEFAULT FALSE,
  sample_count INTEGER NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  candidate_value NUMERIC(20,6),
  baseline_value NUMERIC(20,6),
  unit TEXT NOT NULL CHECK (unit IN ('ratio', 'milliseconds', 'count')),
  passed BOOLEAN NOT NULL,
  result_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, workspace_id, run_id, metric),
  CONSTRAINT ai_mentor_eval_metric_results_run_scope_fk
    FOREIGN KEY (tenant_id, workspace_id, run_id)
    REFERENCES ai_mentor_eval_runs(tenant_id, workspace_id, id) ON DELETE RESTRICT,
  CHECK (pass_rate IS NULL OR (pass_rate >= 0 AND pass_rate <= 1)),
  CHECK (minimum_pass_rate IS NULL OR
    (minimum_pass_rate >= 0 AND minimum_pass_rate <= 1)),
  CHECK (candidate_value IS NULL OR candidate_value >= 0),
  CHECK (baseline_value IS NULL OR baseline_value >= 0),
  CHECK (result_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS ai_mentor_eval_metric_results_run_idx
  ON ai_mentor_eval_metric_results
    (tenant_id, workspace_id, run_id, metric);

CREATE OR REPLACE FUNCTION tecpey_block_mentor_eval_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Mentor eval promotion evidence is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS ai_mentor_eval_runs_no_update ON ai_mentor_eval_runs;
CREATE TRIGGER ai_mentor_eval_runs_no_update
BEFORE UPDATE ON ai_mentor_eval_runs
FOR EACH ROW EXECUTE FUNCTION tecpey_block_mentor_eval_evidence_mutation();

DROP TRIGGER IF EXISTS ai_mentor_eval_runs_no_delete ON ai_mentor_eval_runs;
CREATE TRIGGER ai_mentor_eval_runs_no_delete
BEFORE DELETE ON ai_mentor_eval_runs
FOR EACH ROW EXECUTE FUNCTION tecpey_block_mentor_eval_evidence_mutation();

DROP TRIGGER IF EXISTS ai_mentor_eval_metric_results_no_update
  ON ai_mentor_eval_metric_results;
CREATE TRIGGER ai_mentor_eval_metric_results_no_update
BEFORE UPDATE ON ai_mentor_eval_metric_results
FOR EACH ROW EXECUTE FUNCTION tecpey_block_mentor_eval_evidence_mutation();

DROP TRIGGER IF EXISTS ai_mentor_eval_metric_results_no_delete
  ON ai_mentor_eval_metric_results;
CREATE TRIGGER ai_mentor_eval_metric_results_no_delete
BEFORE DELETE ON ai_mentor_eval_metric_results
FOR EACH ROW EXECUTE FUNCTION tecpey_block_mentor_eval_evidence_mutation();

REVOKE ALL ON TABLE ai_mentor_eval_runs, ai_mentor_eval_metric_results
  FROM PUBLIC, tecpey_ai_tenant_runtime, tecpey_ai_worker;
GRANT SELECT, INSERT ON TABLE ai_mentor_eval_runs, ai_mentor_eval_metric_results
  TO tecpey_ai_tenant_runtime;

ALTER TABLE ai_mentor_eval_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_mentor_eval_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_mentor_eval_runs_tenant_scope ON ai_mentor_eval_runs;
CREATE POLICY ai_mentor_eval_runs_tenant_scope ON ai_mentor_eval_runs
  FOR ALL TO tecpey_ai_tenant_runtime
  USING (
    jsonb_build_array(tenant_id, workspace_id) =
      (SELECT tecpey_ai_authorized_context())
  )
  WITH CHECK (
    jsonb_build_array(tenant_id, workspace_id) =
      (SELECT tecpey_ai_authorized_context())
  );

ALTER TABLE ai_mentor_eval_metric_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_mentor_eval_metric_results FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_mentor_eval_metric_results_tenant_scope
  ON ai_mentor_eval_metric_results;
CREATE POLICY ai_mentor_eval_metric_results_tenant_scope
  ON ai_mentor_eval_metric_results
  FOR ALL TO tecpey_ai_tenant_runtime
  USING (
    jsonb_build_array(tenant_id, workspace_id) =
      (SELECT tecpey_ai_authorized_context())
  )
  WITH CHECK (
    jsonb_build_array(tenant_id, workspace_id) =
      (SELECT tecpey_ai_authorized_context())
  );
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runMentorEvalPromotionAuthorityMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(MENTOR_EVAL_PROMOTION_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-mentor-eval-promotion-authority] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(MENTOR_EVAL_PROMOTION_AUTHORITY_SQL);
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
