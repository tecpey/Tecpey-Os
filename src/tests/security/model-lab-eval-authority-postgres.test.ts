import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import {
  closeAiDatabasePoolsForTest,
  withAiTenantTransaction,
} from "../../lib/ai/database-authority";
import { runAiModelEvaluationAuthorityMigrations } from "../../lib/db-migrate-ai-model-evaluation";

const ownerUrl = process.env.DATABASE_URL?.trim();
const tenantUrl = process.env.TECPEY_AI_TENANT_DATABASE_URL?.trim();
const contextKey = process.env.TECPEY_AI_CONTEXT_HMAC_KEY_B64?.trim();
const contextKeyVersion = process.env.TECPEY_AI_CONTEXT_HMAC_KEY_VERSION?.trim();
const configured = Boolean(
  ownerUrl &&
    tenantUrl &&
    contextKey &&
    contextKeyVersion &&
    ![ownerUrl, tenantUrl].some((value) => value?.includes("CHANGE_ME")),
);
if (process.env.CI === "true" && !configured) {
  throw new Error("model_lab_eval_postgres_ci_authority_missing");
}

type PgError = Error & { code?: string };
type Scope = Readonly<{ tenantId: string; workspaceId: string }>;

const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const scopeA: Scope = {
  tenantId: `model-eval-${suffix}-a`,
  workspaceId: `model-eval-${suffix}-wa`,
};
const scopeB: Scope = {
  tenantId: `model-eval-${suffix}-b`,
  workspaceId: `model-eval-${suffix}-wb`,
};
const capabilityA = randomUUID();
const capabilityB = randomUUID();
const runA = randomUUID();
const runB = randomUUID();

let ownerPool: Pool | null = null;

async function withClient<T>(
  pool: Pool,
  handler: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await handler(client);
  } finally {
    client.release();
  }
}

async function rejectsWithPgCode(
  action: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  await assert.rejects(action, (error: PgError) => {
    assert.equal(error.code, expectedCode);
    return true;
  });
}

async function seedScope(client: PoolClient, scope: Scope): Promise<void> {
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
     VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
    [scope.tenantId],
  );
  await client.query(
    `INSERT INTO platform_workspaces
       (id, tenant_id, slug, display_name, products, settings)
     VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
    [scope.workspaceId, scope.tenantId],
  );
}

async function seedEvidence(
  client: PoolClient,
  scope: Scope,
  capabilityId: string,
  runId: string,
  marker: string,
): Promise<void> {
  await client.query(
    `INSERT INTO ai_model_capability_snapshots
      (id,tenant_id,workspace_id,provider_id,requested_model,canonical_model,
       observed_at,exact_model_identity,deprecated,zero_data_retention,
       supported_data_classes,capabilities,tools,cache_mode,evidence_hash)
     VALUES
      ($1,$2,$3,'openai',$4,$4,NOW(),TRUE,FALSE,TRUE,
       '["public"]'::jsonb,'["text","web_search","citations"]'::jsonb,
       '["web_search"]'::jsonb,'none',$5)`,
    [
      capabilityId,
      scope.tenantId,
      scope.workspaceId,
      `gpt-eval-${marker}`,
      marker.repeat(64).slice(0, 64),
    ],
  );
  await client.query(
    `INSERT INTO ai_model_eval_runs
      (id,tenant_id,workspace_id,task_id,eval_suite_id,provider_id,
       requested_model,canonical_model,measured_at,dataset_version,dataset_hash,
       evaluator_kind,evaluator_version,sample_size,quality_basis_points,passed,
       reasons,policy_version,evidence_hash)
     VALUES
      ($1,$2,$3,'mentor_public_research','mentor_public_research_v1','openai',
       $4,$4,NOW(),'dataset-v1',$5,'blind_pairwise','evaluator-v1',100,9600,TRUE,
       '[]'::jsonb,'2026-09-24.1',$6)`,
    [
      runId,
      scope.tenantId,
      scope.workspaceId,
      `gpt-eval-${marker}`,
      (marker === "a" ? "b" : "c").repeat(64),
      (marker === "a" ? "d" : "e").repeat(64),
    ],
  );
  await client.query(
    `INSERT INTO ai_model_eval_metric_results
      (tenant_id,workspace_id,run_id,metric,status,sample_count,
       score_basis_points,measured_value)
     VALUES ($1,$2,$3,'factuality','measured',100,9700,NULL)`,
    [scope.tenantId, scope.workspaceId, runId],
  );
}

before(async () => {
  if (!configured || !ownerUrl) return;
  process.env.TECPEY_AI_TENANT_DATABASE_POOL_MAX = "1";
  ownerPool = new Pool({
    connectionString: ownerUrl,
    max: 2,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
    allowExitOnIdle: true,
  });
  await withClient(ownerPool, async (client) => {
    await runAiModelEvaluationAuthorityMigrations(client);
    await seedScope(client, scopeA);
    await seedScope(client, scopeB);
    await seedEvidence(client, scopeA, capabilityA, runA, "a");
    await seedEvidence(client, scopeB, capabilityB, runB, "f");
  });
});

after(async () => {
  if (configured) await closeAiDatabasePoolsForTest();
  await ownerPool?.end();
  ownerPool = null;
});

describe("Model evaluation PostgreSQL authority", () => {
  it(
    "hides another tenant's capability and evaluation evidence",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const result = await withAiTenantTransaction(scopeA, async (client) => {
        const capabilities = await client.query<{ id: string }>(
          "SELECT id FROM ai_model_capability_snapshots WHERE id=$1::uuid",
          [capabilityB],
        );
        const evaluations = await client.query<{ id: string }>(
          "SELECT id FROM ai_model_eval_runs WHERE id=$1::uuid",
          [runB],
        );
        return { capabilities: capabilities.rows, evaluations: evaluations.rows };
      });
      assert.equal(result.enabled, true);
      assert.deepEqual(result.value, { capabilities: [], evaluations: [] });
    },
  );

  it(
    "rejects cross-tenant writes through the signed tenant runtime",
    { skip: !configured, timeout: 30_000 },
    async () => {
      await rejectsWithPgCode(
        () =>
          withAiTenantTransaction(scopeA, (client) =>
            client.query(
              `INSERT INTO ai_model_capability_snapshots
                (tenant_id,workspace_id,provider_id,requested_model,canonical_model,
                 observed_at,exact_model_identity,deprecated,zero_data_retention,
                 supported_data_classes,capabilities,tools,cache_mode,evidence_hash)
               VALUES ($1,$2,'openai','cross-model','cross-model',NOW(),TRUE,FALSE,
                       TRUE,'["public"]'::jsonb,'["text"]'::jsonb,'[]'::jsonb,
                       'none',$3)`,
              [scopeB.tenantId, scopeB.workspaceId, "1".repeat(64)],
            ),
          ),
        "42501",
      );
    },
  );

  it(
    "rejects cross-run metric binding even for the database owner",
    { skip: !configured, timeout: 30_000 },
    async () => {
      await rejectsWithPgCode(
        () =>
          ownerPool!.query(
            `INSERT INTO ai_model_eval_metric_results
              (tenant_id,workspace_id,run_id,metric,status,sample_count,
               score_basis_points,measured_value)
             VALUES ($1,$2,$3,'english_quality','measured',100,9800,NULL)`,
            [scopeA.tenantId, scopeA.workspaceId, runB],
          ),
        "23503",
      );
    },
  );

  it(
    "enforces metric shape at the database boundary",
    { skip: !configured, timeout: 30_000 },
    async () => {
      await rejectsWithPgCode(
        () =>
          ownerPool!.query(
            `INSERT INTO ai_model_eval_metric_results
              (tenant_id,workspace_id,run_id,metric,status,sample_count,
               score_basis_points,measured_value)
             VALUES ($1,$2,$3,'latency_p95_ms','measured',100,9900,1200)`,
            [scopeA.tenantId, scopeA.workspaceId, runA],
          ),
        "23514",
      );
    },
  );

  it(
    "keeps capability, run and metric evidence append-only",
    { skip: !configured, timeout: 30_000 },
    async () => {
      await rejectsWithPgCode(
        () =>
          ownerPool!.query(
            "UPDATE ai_model_capability_snapshots SET deprecated=TRUE WHERE id=$1::uuid",
            [capabilityA],
          ),
        "55000",
      );
      await rejectsWithPgCode(
        () =>
          ownerPool!.query(
            "DELETE FROM ai_model_eval_runs WHERE id=$1::uuid",
            [runA],
          ),
        "55000",
      );
      await rejectsWithPgCode(
        () =>
          ownerPool!.query(
            `UPDATE ai_model_eval_metric_results
                SET score_basis_points=9000
              WHERE tenant_id=$1 AND workspace_id=$2 AND run_id=$3::uuid
                AND metric='factuality'`,
            [scopeA.tenantId, scopeA.workspaceId, runA],
          ),
        "55000",
      );
    },
  );
});
