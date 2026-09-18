import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  closeAiDatabasePoolsForTest,
  withAiTenantTransaction,
} from "@/lib/ai/database-authority";

const databaseUrl = process.env.DATABASE_URL;
const aiTenantConfigured = Boolean(
  process.env.TECPEY_AI_TENANT_DATABASE_URL &&
  process.env.TECPEY_AI_CONTEXT_HMAC_KEY_B64 &&
  process.env.TECPEY_AI_CONTEXT_HMAC_KEY_VERSION,
);
const configured = Boolean(databaseUrl && aiTenantConfigured);

async function seedScope(label: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const tenantId = `${label}-${suffix}`;
  const workspaceId = `${tenantId}-main`;
  try {
    await pool.query(
      `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', ARRAY['mentor']::text[])`,
      [tenantId],
    );
    await pool.query(
      `INSERT INTO platform_workspaces
         (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, ARRAY['mentor']::text[], '{}'::jsonb)`,
      [workspaceId, tenantId],
    );
    return { tenantId, workspaceId };
  } finally {
    await pool.end();
  }
}

function runInsertSql() {
  return `INSERT INTO ai_mentor_eval_runs
    (id, tenant_id, workspace_id, candidate_sha, candidate_tree,
     provider_id, requested_model, actual_model, prompt_hash,
     trust_policy_version, evidence_policy_version, eval_contract_version,
     dataset_version, dataset_hash, evaluator_version, baseline_run_id,
     release_decision, hard_gate_failure_count, evidence_hash)
   VALUES
    ($1::uuid, $2, $3, $4, $5, 'openai', 'candidate-model', 'actual-model',
     $6, 'trust-v1', 'evidence-v1', 'eval-v1', 'dataset-v1', $7,
     'evaluator-v1', NULL, 'block', 0, $8)`;
}

test(
  "Mentor eval evidence is runtime-isolated by signed tenant/workspace scope",
  { skip: !configured, timeout: 20_000 },
  async () => {
    const scopeA = await seedScope("mentor-eval-a");
    const scopeB = await seedScope("mentor-eval-b");
    const runId = randomUUID();
    const candidateSha = "a".repeat(40);
    const candidateTree = "b".repeat(40);
    const promptHash = "c".repeat(64);
    const datasetHash = "d".repeat(64);
    const evidenceHash = "e".repeat(64);

    try {
      const inserted = await withAiTenantTransaction(scopeA, async (client) => {
        await client.query(runInsertSql(), [
          runId,
          scopeA.tenantId,
          scopeA.workspaceId,
          candidateSha,
          candidateTree,
          promptHash,
          datasetHash,
          evidenceHash,
        ]);
        const visible = await client.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM ai_mentor_eval_runs WHERE id = $1::uuid",
          [runId],
        );
        return Number(visible.rows[0]?.count ?? "0");
      });
      assert.deepEqual(inserted, { enabled: true, value: 1 });

      const hidden = await withAiTenantTransaction(scopeB, async (client) => {
        const visible = await client.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM ai_mentor_eval_runs WHERE id = $1::uuid",
          [runId],
        );
        return Number(visible.rows[0]?.count ?? "0");
      });
      assert.deepEqual(hidden, { enabled: true, value: 0 });

      await assert.rejects(
        () => withAiTenantTransaction(scopeB, (client) =>
          client.query(runInsertSql(), [
            randomUUID(),
            scopeA.tenantId,
            scopeA.workspaceId,
            "f".repeat(40),
            "1".repeat(40),
            "2".repeat(64),
            "3".repeat(64),
            "4".repeat(64),
          ])),
        /row-level security|policy/i,
      );
    } finally {
      await closeAiDatabasePoolsForTest();
    }
  },
);

test(
  "Mentor eval runs and metric outcomes are append-only at the database layer",
  { skip: !configured, timeout: 20_000 },
  async () => {
    const scope = await seedScope("mentor-eval-append");
    const runId = randomUUID();
    try {
      await withAiTenantTransaction(scope, async (client) => {
        await client.query(runInsertSql(), [
          runId,
          scope.tenantId,
          scope.workspaceId,
          "5".repeat(40),
          "6".repeat(40),
          "7".repeat(64),
          "8".repeat(64),
          "9".repeat(64),
        ]);
        await client.query(
          `INSERT INTO ai_mentor_eval_metric_results
            (tenant_id, workspace_id, run_id, metric, hard_gate, pass_rate,
             minimum_pass_rate, baseline_measured, sample_count, unit, passed,
             result_hash)
           VALUES ($1, $2, $3::uuid, 'safety_hard_gate', TRUE, 1, 1, FALSE,
                   10, 'ratio', TRUE, $4)`,
          [scope.tenantId, scope.workspaceId, runId, "a".repeat(64)],
        );

        await client.query("SAVEPOINT eval_run_mutation");
        await assert.rejects(
          client.query(
            "UPDATE ai_mentor_eval_runs SET release_decision = 'pass' WHERE id = $1::uuid",
            [runId],
          ),
          /append-only/i,
        );
        await client.query("ROLLBACK TO SAVEPOINT eval_run_mutation");

        await client.query("SAVEPOINT eval_metric_mutation");
        await assert.rejects(
          client.query(
            `UPDATE ai_mentor_eval_metric_results
                SET pass_rate = 0
              WHERE run_id = $1::uuid AND metric = 'safety_hard_gate'`,
            [runId],
          ),
          /append-only/i,
        );
        await client.query("ROLLBACK TO SAVEPOINT eval_metric_mutation");
      });
    } finally {
      await closeAiDatabasePoolsForTest();
    }
  },
);
