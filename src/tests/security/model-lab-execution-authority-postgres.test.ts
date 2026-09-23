import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import {
  closeAiDatabasePoolsForTest,
  withAiTenantTransaction,
} from "../../lib/ai/database-authority";

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
  throw new Error("model_lab_execution_postgres_ci_authority_missing");
}

type PgError = Error & { code?: string };
type Scope = Readonly<{ tenantId: string; workspaceId: string }>;

const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const scopeA: Scope = {
  tenantId: `model-exec-${suffix}-a`,
  workspaceId: `model-exec-${suffix}-wa`,
};
const scopeB: Scope = {
  tenantId: `model-exec-${suffix}-b`,
  workspaceId: `model-exec-${suffix}-wb`,
};

const runA = randomUUID();
const runB = randomUUID();
const runBad = randomUUID();
const candidateA = randomUUID();
const candidateA2 = randomUUID();
const candidateB = randomUUID();
const candidateB2 = randomUUID();
const candidateBad = randomUUID();
const candidateBad2 = randomUUID();
const reservationA = randomUUID();
const reservationB = randomUUID();
const reservationBad = randomUUID();
const attemptA = randomUUID();
const attemptB = randomUUID();
const attemptBad = randomUUID();
const resultA = randomUUID();
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

async function seedRun(
  client: PoolClient,
  input: {
    scope: Scope;
    accountId: string;
    runId: string;
    candidateIds: [string, string];
    subscriptionId: string;
    modelPrefix: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO ai_model_lab_runs
      (id,tenant_id,workspace_id,account_id,task_id,agent_id,data_class,
       prompt_digest,decision_hash,policy_version,idempotency_key,request_hash,
       status,candidate_count,entitlement_snapshot_version,subscription_id,
       subscription_state_version)
     VALUES ($1,$2,$3,$4,'mentor_public_research','coin_tool_researcher',
             'public',$5,$6,'2026-09-24.1',$7,$8,'admitted',2,1,$9,1)`,
    [
      input.runId,
      input.scope.tenantId,
      input.scope.workspaceId,
      input.accountId,
      "a".repeat(64),
      "b".repeat(64),
      `model-lab-seed-${input.runId}`,
      "c".repeat(64),
      input.subscriptionId,
    ],
  );
  for (const [index, candidateId] of input.candidateIds.entries()) {
    const model = `${input.modelPrefix}-${index + 1}`;
    await client.query(
      `INSERT INTO ai_model_lab_candidates
        (id,tenant_id,workspace_id,run_id,provider_id,endpoint_id,requested_model,
         canonical_model,eligibility,rejection_codes,capability_observed_at,
         eval_measured_at,eval_sample_size,quality_basis_points)
       VALUES ($1,$2,$3,$4,'openai','openai_responses',$5,$5,'eligible',
               '[]'::jsonb,NOW(),NOW(),100,9600)`,
      [
        candidateId,
        input.scope.tenantId,
        input.scope.workspaceId,
        input.runId,
        model,
      ],
    );
  }
}

async function seedReservation(
  client: PoolClient,
  input: {
    scope: Scope;
    reservationId: string;
    idempotencyKey: string;
    attemptId?: string;
    settled?: boolean;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO ai_agent_spend_monthly
      (tenant_id,workspace_id,agent_id,budget_month,
       active_reserved_usd_micros,settled_usd_micros)
     VALUES ($1,$2,'coin_tool_researcher',
             date_trunc('month',CURRENT_DATE)::date,$3,$4)
     ON CONFLICT DO NOTHING`,
    [
      input.scope.tenantId,
      input.scope.workspaceId,
      input.settled ? 0 : 1000,
      input.settled ? 1000 : 0,
    ],
  );
  await client.query(
    `INSERT INTO ai_spend_reservations
      (id,tenant_id,workspace_id,agent_id,budget_month,idempotency_key,
       reserved_usd_micros,settled_usd_micros,egress_attempt_id,
       egress_started_at,status,expires_at,settled_at)
     VALUES ($1,$2,$3,'coin_tool_researcher',
             date_trunc('month',CURRENT_DATE)::date,$4,1000,$5,$6::uuid,$7,
             $8,NOW()+INTERVAL '15 minutes',$9)`,
    [
      input.reservationId,
      input.scope.tenantId,
      input.scope.workspaceId,
      input.idempotencyKey,
      input.settled ? 1000 : null,
      input.attemptId ?? null,
      input.attemptId ? new Date() : null,
      input.settled ? "settled" : "active",
      input.settled ? new Date() : null,
    ],
  );
}

async function seedAdmission(
  client: PoolClient,
  input: {
    scope: Scope;
    accountId: string;
    runId: string;
    candidateId: string;
    reservationId: string;
    attemptId: string;
    model: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO ai_model_lab_egress_admissions
      (attempt_id,tenant_id,workspace_id,account_id,run_id,candidate_id,
       agent_id,provider_id,endpoint_id,requested_model,canonical_model,
       reservation_id,reserved_usd_micros,input_digest)
     VALUES ($1,$2,$3,$4,$5,$6,'coin_tool_researcher','openai',
             'openai_responses',$7,$7,$8,1000,$9)`,
    [
      input.attemptId,
      input.scope.tenantId,
      input.scope.workspaceId,
      input.accountId,
      input.runId,
      input.candidateId,
      input.model,
      input.reservationId,
      "a".repeat(64),
    ],
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
    await seedScope(client, scopeA);
    await seedScope(client, scopeB);
    await seedRun(client, {
      scope: scopeA,
      accountId: "account-a",
      runId: runA,
      candidateIds: [candidateA, candidateA2],
      subscriptionId: subscriptionA,
      modelPrefix: "model-a",
    });
    await seedRun(client, {
      scope: scopeB,
      accountId: "account-b",
      runId: runB,
      candidateIds: [candidateB, candidateB2],
      subscriptionId: subscriptionB,
      modelPrefix: "model-b",
    });
    await seedRun(client, {
      scope: scopeA,
      accountId: "account-bad",
      runId: runBad,
      candidateIds: [candidateBad, candidateBad2],
      subscriptionId: randomUUID(),
      modelPrefix: "model-bad",
    });

    await seedReservation(client, {
      scope: scopeA,
      reservationId: reservationA,
      idempotencyKey: `model-lab-exec-a-${suffix}`,
      attemptId: attemptA,
      settled: true,
    });
    await seedReservation(client, {
      scope: scopeB,
      reservationId: reservationB,
      idempotencyKey: `model-lab-exec-b-${suffix}`,
    });
    await seedReservation(client, {
      scope: scopeA,
      reservationId: reservationBad,
      idempotencyKey: `model-lab-exec-bad-${suffix}`,
    });

    await seedAdmission(client, {
      scope: scopeA,
      accountId: "account-a",
      runId: runA,
      candidateId: candidateA,
      reservationId: reservationA,
      attemptId: attemptA,
      model: "model-a-1",
    });
    await seedAdmission(client, {
      scope: scopeB,
      accountId: "account-b",
      runId: runB,
      candidateId: candidateB,
      reservationId: reservationB,
      attemptId: attemptB,
      model: "model-b-1",
    });
    await seedAdmission(client, {
      scope: scopeA,
      accountId: "account-bad",
      runId: runBad,
      candidateId: candidateBad,
      reservationId: reservationBad,
      attemptId: attemptBad,
      model: "model-bad-1",
    });

    await client.query(
      `INSERT INTO ai_model_lab_execution_results
        (id,attempt_id,tenant_id,workspace_id,account_id,run_id,candidate_id,
         provider_id,requested_model,actual_model,model_identity_verified,status,
         failure_reason,output_hash,source_refs,input_tokens,output_tokens,
         reported_cost_usd_micros,charged_cost_usd_micros,duration_ms,
         reconciliation_required)
       VALUES ($1,$2,$3,$4,'account-a',$5,$6,'openai','model-a-1','model-a-1',
               TRUE,'succeeded',NULL,$7,'[]'::jsonb,10,5,1000,1000,500,FALSE)`,
      [
        resultA,
        attemptA,
        scopeA.tenantId,
        scopeA.workspaceId,
        runA,
        candidateA,
        "d".repeat(64),
      ],
    );
  });
});

after(async () => {
  if (configured) await closeAiDatabasePoolsForTest();
  await ownerPool?.end();
  ownerPool = null;
});

describe("Model Lab execution PostgreSQL authority", () => {
  it(
    "hides another tenant's egress evidence and rejects cross-tenant insertion",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const hidden = await withAiTenantTransaction(scopeA, (client) =>
        client.query<{ attempt_id: string }>(
          "SELECT attempt_id FROM ai_model_lab_egress_admissions WHERE attempt_id=$1::uuid",
          [attemptB],
        ),
      );
      assert.equal(hidden.enabled, true);
      assert.deepEqual(hidden.value.rows, []);

      await rejectsWithPgCode(
        () =>
          withAiTenantTransaction(scopeA, (client) =>
            client.query(
              `INSERT INTO ai_model_lab_egress_admissions
                (attempt_id,tenant_id,workspace_id,account_id,run_id,candidate_id,
                 agent_id,provider_id,endpoint_id,requested_model,canonical_model,
                 reservation_id,reserved_usd_micros,input_digest)
               VALUES ($1,$2,$3,'account-b',$4,$5,'coin_tool_researcher','openai',
                       'openai_responses','model-b-2','model-b-2',$6,1000,$7)`,
              [
                randomUUID(),
                scopeB.tenantId,
                scopeB.workspaceId,
                runB,
                candidateB2,
                reservationB,
                "e".repeat(64),
              ],
            ),
          ),
        "42501",
      );
    },
  );

  it(
    "rejects cross-run candidates and foreign-scope spend reservations",
    { skip: !configured, timeout: 30_000 },
    async () => {
      await rejectsWithPgCode(
        () =>
          ownerPool!.query(
            `INSERT INTO ai_model_lab_egress_admissions
              (attempt_id,tenant_id,workspace_id,account_id,run_id,candidate_id,
               agent_id,provider_id,endpoint_id,requested_model,canonical_model,
               reservation_id,reserved_usd_micros,input_digest)
             VALUES ($1,$2,$3,'account-a',$4,$5,'coin_tool_researcher','openai',
                     'openai_responses','cross-run','cross-run',$6,1000,$7)`,
            [
              randomUUID(),
              scopeA.tenantId,
              scopeA.workspaceId,
              runA,
              candidateB,
              reservationA,
              "f".repeat(64),
            ],
          ),
        "23503",
      );

      await rejectsWithPgCode(
        () =>
          ownerPool!.query(
            `INSERT INTO ai_model_lab_egress_admissions
              (attempt_id,tenant_id,workspace_id,account_id,run_id,candidate_id,
               agent_id,provider_id,endpoint_id,requested_model,canonical_model,
               reservation_id,reserved_usd_micros,input_digest)
             VALUES ($1,$2,$3,'account-a',$4,$5,'coin_tool_researcher','openai',
                     'openai_responses','model-a-2','model-a-2',$6,1000,$7)`,
            [
              randomUUID(),
              scopeA.tenantId,
              scopeA.workspaceId,
              runA,
              candidateA2,
              reservationB,
              "1".repeat(64),
            ],
          ),
        "23503",
      );
    },
  );

  it(
    "requires terminal results to match the exact admission identity",
    { skip: !configured, timeout: 30_000 },
    async () => {
      await rejectsWithPgCode(
        () =>
          ownerPool!.query(
            `INSERT INTO ai_model_lab_execution_results
              (attempt_id,tenant_id,workspace_id,account_id,run_id,candidate_id,
               provider_id,requested_model,actual_model,model_identity_verified,
               status,output_hash,source_refs,input_tokens,output_tokens,
               charged_cost_usd_micros,duration_ms,reconciliation_required)
             VALUES ($1,$2,$3,'other-account',$4,$5,'openai','model-a-1',
                     'model-a-1',TRUE,'succeeded',$6,'[]'::jsonb,1,1,1000,10,FALSE)`,
            [
              attemptA,
              scopeA.tenantId,
              scopeA.workspaceId,
              runA,
              candidateA,
              "2".repeat(64),
            ],
          ),
        "23503",
      );
    },
  );

  it(
    "rejects a succeeded result unless the provider model was exactly verified",
    { skip: !configured, timeout: 30_000 },
    async () => {
      await rejectsWithPgCode(
        () =>
          ownerPool!.query(
            `INSERT INTO ai_model_lab_execution_results
              (attempt_id,tenant_id,workspace_id,account_id,run_id,candidate_id,
               provider_id,requested_model,actual_model,model_identity_verified,
               status,output_hash,source_refs,input_tokens,output_tokens,
               charged_cost_usd_micros,duration_ms,reconciliation_required)
             VALUES ($1,$2,$3,'account-bad',$4,$5,'openai','model-bad-1',
                     'different-model',FALSE,'succeeded',$6,'[]'::jsonb,1,1,0,10,FALSE)`,
            [
              attemptBad,
              scopeA.tenantId,
              scopeA.workspaceId,
              runBad,
              candidateBad,
              "3".repeat(64),
            ],
          ),
        "23514",
      );
    },
  );

  it(
    "makes admissions and terminal results append-only",
    { skip: !configured, timeout: 30_000 },
    async () => {
      await rejectsWithPgCode(
        () =>
          ownerPool!.query(
            "UPDATE ai_model_lab_egress_admissions SET requested_model='tampered' WHERE attempt_id=$1::uuid",
            [attemptA],
          ),
        "55000",
      );
      await rejectsWithPgCode(
        () =>
          ownerPool!.query(
            "DELETE FROM ai_model_lab_execution_results WHERE id=$1::uuid",
            [resultA],
          ),
        "55000",
      );
    },
  );

  it(
    "grants tenant runtime only select/insert and grants the worker nothing",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const privileges = await ownerPool!.query<{
        tenant_select: boolean;
        tenant_insert: boolean;
        tenant_update: boolean;
        tenant_delete: boolean;
        worker_select: boolean;
        worker_insert: boolean;
      }>(
        `SELECT
          has_table_privilege('tecpey_ai_tenant_runtime','public.ai_model_lab_egress_admissions','SELECT') AS tenant_select,
          has_table_privilege('tecpey_ai_tenant_runtime','public.ai_model_lab_egress_admissions','INSERT') AS tenant_insert,
          has_table_privilege('tecpey_ai_tenant_runtime','public.ai_model_lab_egress_admissions','UPDATE') AS tenant_update,
          has_table_privilege('tecpey_ai_tenant_runtime','public.ai_model_lab_egress_admissions','DELETE') AS tenant_delete,
          has_table_privilege('tecpey_ai_worker','public.ai_model_lab_egress_admissions','SELECT') AS worker_select,
          has_table_privilege('tecpey_ai_worker','public.ai_model_lab_egress_admissions','INSERT') AS worker_insert`,
      );
      assert.deepEqual(privileges.rows[0], {
        tenant_select: true,
        tenant_insert: true,
        tenant_update: false,
        tenant_delete: false,
        worker_select: false,
        worker_insert: false,
      });
    },
  );
});
