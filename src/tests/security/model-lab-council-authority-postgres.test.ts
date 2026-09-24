import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import {
  closeAiDatabasePoolsForTest,
  withAiTenantTransaction,
} from "../../lib/ai/database-authority";
import { runModelLabCouncilAuthorityMigrations } from "../../lib/db-migrate-ai-model-lab-council";

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
  throw new Error("model_lab_council_postgres_ci_authority_missing");
}

type PgError = Error & { code?: string };
type Scope = Readonly<{ tenantId: string; workspaceId: string }>;

const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const scopeA: Scope = {
  tenantId: `model-lab-${suffix}-a`,
  workspaceId: `model-lab-${suffix}-wa`,
};
const scopeB: Scope = {
  tenantId: `model-lab-${suffix}-b`,
  workspaceId: `model-lab-${suffix}-wb`,
};

const runA = randomUUID();
const runB = randomUUID();
const candidateA = randomUUID();
const synthesisA = randomUUID();
const subscriptionA = randomUUID();
const subscriptionB = randomUUID();

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
    await runModelLabCouncilAuthorityMigrations(client);
    await seedScope(client, scopeA);
    await seedScope(client, scopeB);
    await client.query(
      `INSERT INTO ai_model_lab_runs
        (id,tenant_id,workspace_id,account_id,task_id,agent_id,data_class,
         prompt_digest,decision_hash,policy_version,idempotency_key,request_hash,
         status,candidate_count,entitlement_snapshot_version,subscription_id,
         subscription_state_version)
       VALUES
        ($1,$2,$3,'account-a','mentor_public_research','coin_tool_researcher','public',
         $4,$5,'2026-09-24.1','model-lab-runtime-a-0001',$6,'admitted',2,1,$7,1),
        ($8,$9,$10,'account-b','mentor_public_research','coin_tool_researcher','public',
         $11,$12,'2026-09-24.1','model-lab-runtime-b-0001',$13,'admitted',2,1,$14,1)`,
      [
        runA,
        scopeA.tenantId,
        scopeA.workspaceId,
        "a".repeat(64),
        "b".repeat(64),
        "c".repeat(64),
        subscriptionA,
        runB,
        scopeB.tenantId,
        scopeB.workspaceId,
        "d".repeat(64),
        "e".repeat(64),
        "f".repeat(64),
        subscriptionB,
      ],
    );
    await client.query(
      `INSERT INTO ai_model_lab_candidates
        (id,tenant_id,workspace_id,run_id,provider_id,endpoint_id,requested_model,
         canonical_model,eligibility,rejection_codes,capability_observed_at,
         eval_measured_at,eval_sample_size,quality_basis_points)
       VALUES ($1,$2,$3,$4,'openai','openai_responses','gpt-runtime-pinned',
               'gpt-runtime-pinned','eligible','[]'::jsonb,NOW(),NOW(),100,9600)`,
      [candidateA, scopeA.tenantId, scopeA.workspaceId, runA],
    );
    await client.query(
      `INSERT INTO ai_council_syntheses
        (id,tenant_id,workspace_id,account_id,model_lab_run_id,input_digest,
         synthesis_hash,policy_version,idempotency_key,request_hash,
         contributions,agreements,disagreements,unresolved,
         entitlement_snapshot_version,subscription_id,subscription_state_version)
       VALUES ($1,$2,$3,'account-a',$4,$5,$6,'2026-09-24.1',
               'ai-council-runtime-a-0001',$7,'[]'::jsonb,'[]'::jsonb,
               '[]'::jsonb,'[]'::jsonb,1,$8,1)`,
      [
        synthesisA,
        scopeA.tenantId,
        scopeA.workspaceId,
        runA,
        "1".repeat(64),
        "2".repeat(64),
        "3".repeat(64),
        subscriptionA,
      ],
    );
  });
});

after(async () => {
  if (configured) await closeAiDatabasePoolsForTest();
  await ownerPool?.end();
  ownerPool = null;
});

describe("Model Lab + Council PostgreSQL authority", () => {
  it(
    "hides another tenant's evidence and rejects cross-tenant insertion",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const hidden = await withAiTenantTransaction(scopeA, (client) =>
        client.query<{ id: string }>(
          "SELECT id FROM ai_model_lab_runs WHERE id=$1::uuid",
          [runB],
        ),
      );
      assert.equal(hidden.enabled, true);
      assert.deepEqual(hidden.value.rows, []);

      await rejectsWithPgCode(
        () =>
          withAiTenantTransaction(scopeA, (client) =>
            client.query(
              `INSERT INTO ai_model_lab_runs
                (tenant_id,workspace_id,account_id,task_id,agent_id,data_class,
                 prompt_digest,decision_hash,policy_version,idempotency_key,
                 request_hash,status,candidate_count,entitlement_snapshot_version,
                 subscription_id,subscription_state_version)
               VALUES ($1,$2,'cross-account','mentor_public_research',
                       'coin_tool_researcher','public',$3,$4,'2026-09-24.1',
                       'model-lab-cross-tenant-0001',$5,'blocked',2,1,$6,1)`,
              [
                scopeB.tenantId,
                scopeB.workspaceId,
                "4".repeat(64),
                "5".repeat(64),
                "6".repeat(64),
                subscriptionB,
              ],
            ),
          ),
        "42501",
      );
    },
  );

  it(
    "rejects cross-run candidate binding even for the database owner",
    { skip: !configured, timeout: 30_000 },
    async () => {
      await rejectsWithPgCode(
        () =>
          ownerPool!.query(
            `INSERT INTO ai_model_lab_candidates
              (tenant_id,workspace_id,run_id,provider_id,endpoint_id,requested_model,
               canonical_model,eligibility,rejection_codes,capability_observed_at)
             VALUES ($1,$2,$3,'openai','openai_responses','cross-run-model',
                     'cross-run-model','eligible','[]'::jsonb,NOW())`,
            [scopeA.tenantId, scopeA.workspaceId, runB],
          ),
        "23503",
      );
    },
  );

  it(
    "binds Council evidence to the exact account-owned Model Lab run",
    { skip: !configured, timeout: 30_000 },
    async () => {
      await rejectsWithPgCode(
        () =>
          ownerPool!.query(
            `INSERT INTO ai_council_syntheses
              (tenant_id,workspace_id,account_id,model_lab_run_id,input_digest,
               synthesis_hash,policy_version,idempotency_key,request_hash,
               contributions,agreements,disagreements,unresolved,
               entitlement_snapshot_version,subscription_id,subscription_state_version)
             VALUES ($1,$2,'other-account',$3,$4,$5,'2026-09-24.1',
                     'ai-council-account-mismatch-0001',$6,'[]'::jsonb,'[]'::jsonb,
                     '[]'::jsonb,'[]'::jsonb,1,$7,1)`,
            [
              scopeA.tenantId,
              scopeA.workspaceId,
              runA,
              "7".repeat(64),
              "8".repeat(64),
              "9".repeat(64),
              subscriptionA,
            ],
          ),
        "23503",
      );
    },
  );

  it(
    "makes admitted run, candidate and synthesis evidence append-only",
    { skip: !configured, timeout: 30_000 },
    async () => {
      await rejectsWithPgCode(
        () =>
          ownerPool!.query(
            "UPDATE ai_model_lab_runs SET status='blocked' WHERE id=$1::uuid",
            [runA],
          ),
        "55000",
      );
      await rejectsWithPgCode(
        () =>
          ownerPool!.query(
            "DELETE FROM ai_model_lab_candidates WHERE id=$1::uuid",
            [candidateA],
          ),
        "55000",
      );
      await rejectsWithPgCode(
        () =>
          ownerPool!.query(
            "UPDATE ai_council_syntheses SET agreements='[]'::jsonb WHERE id=$1::uuid",
            [synthesisA],
          ),
        "55000",
      );
    },
  );
});
