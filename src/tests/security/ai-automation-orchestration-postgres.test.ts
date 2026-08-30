import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import {
  AI_AUTOMATION_POLICY_VERSION,
  aiAutomationPolicy,
  type AiAutomationWorkflowId,
} from "../../lib/ai/automation-catalog";
import {
  aiAutomationExecutorBinding,
  isReadyAiAutomationExecutorBinding,
  matchesAiAutomationExecutorBinding,
} from "../../lib/ai/automation-executor-registry";
import {
  AI_AUTOMATION_ENQUEUE_INSERT_SQL,
  AI_AUTOMATION_EXECUTION_CLAIM_SELECT_SQL,
  AI_AUTOMATION_EXECUTION_CLAIM_UPDATE_SQL,
  AI_AUTOMATION_EXECUTION_POLICY_LOCK_SQL,
  automationCommandHash,
  recoverExpiredAiAutomationRuns,
} from "../../lib/ai/automation-store";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
const workflowId = "provider_budget_failover" as const;
let pool: Pool | null = null;

type Scope = {
  tenantId: string;
  workspaceId: string;
};

type Command = Parameters<typeof automationCommandHash>[0] & {
  inputText: string;
};

before(() => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 6,
    connectionTimeoutMillis: 5_000,
    query_timeout: 30_000,
    statement_timeout: 30_000,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
});

after(async () => {
  await pool?.end();
  pool = null;
});

function databasePool(): Pool {
  if (!pool) throw new Error("ai_automation_test_database_unavailable");
  return pool;
}

async function createScope(maxConcurrency = 1): Promise<Scope> {
  const suffix = randomUUID();
  const scope = {
    tenantId: `automation-test-${suffix}`,
    workspaceId: `automation-workspace-${suffix}`,
  };
  const db = databasePool();
  await db.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
     VALUES ($1, $1, 'AI automation PostgreSQL contract', 'enterprise', '{}'::text[])`,
    [scope.tenantId],
  );
  await db.query(
    `INSERT INTO platform_workspaces
       (id, tenant_id, slug, display_name, products, settings)
     VALUES ($1, $2, $1, 'AI automation PostgreSQL contract', '{}'::text[], '{}'::jsonb)`,
    [scope.workspaceId, scope.tenantId],
  );
  await db.query(
    `INSERT INTO ai_automation_policies
       (tenant_id, workspace_id, workflow_id, enabled, interval_minutes,
        max_concurrency, policy_version, revision)
     VALUES ($1, $2, $3, TRUE, NULL, $4, $5, 1)`,
    [
      scope.tenantId,
      scope.workspaceId,
      workflowId,
      maxConcurrency,
      AI_AUTOMATION_POLICY_VERSION,
    ],
  );
  return scope;
}

function commandFor(scope: Scope, suffix: string = randomUUID()): Command {
  const inputText = `public routing budget evidence ${suffix}`;
  return {
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    workflowId,
    triggerType: "event",
    dataClass: "public",
    resourceType: "provider_budget_snapshot",
    resourceId: `snapshot:${suffix}`,
    inputText,
    inputHash: createHash("sha256").update(inputText).digest("hex"),
    idempotencyKey: `automation:${suffix}`,
    requestedBy: null,
  };
}

function enqueueParameters(command: Command): unknown[] {
  const definition = aiAutomationPolicy(command.workflowId);
  return [
    randomUUID(),
    command.tenantId,
    command.workspaceId,
    command.workflowId,
    command.triggerType,
    command.dataClass,
    definition.criticality,
    command.resourceType,
    command.resourceId,
    command.inputText,
    command.inputHash,
    automationCommandHash(command),
    command.idempotencyKey,
    AI_AUTOMATION_POLICY_VERSION,
    [...definition.aiReviewers],
    definition.aiQuorum,
    [...definition.managerRoles],
    definition.managerQuorum,
    [...definition.cLevelRoles],
    definition.cLevelQuorum,
    definition.externalEffect,
    definition.freeFallbackAllowed,
    definition.maxAttempts,
    command.requestedBy,
    definition.approvalTtlMinutes,
  ];
}

async function enqueueOnce(command: Command): Promise<{
  id: string;
  command_hash: string;
} | null> {
  const result = await databasePool().query<{
    id: string;
    command_hash: string;
  }>(AI_AUTOMATION_ENQUEUE_INSERT_SQL, enqueueParameters(command));
  return result.rows[0] ?? null;
}

async function seedApprovedRun(scope: Scope): Promise<string> {
  const inserted = await enqueueOnce(commandFor(scope));
  assert.ok(inserted);
  const approved = await databasePool().query<{ id: string }>(
    `UPDATE ai_automation_runs
        SET status = 'approved'
      WHERE id = $1::uuid
      RETURNING id`,
    [inserted.id],
  );
  assert.equal(approved.rowCount, 1);
  return inserted.id;
}

type ClaimInput = {
  scope: Scope;
  runId: string;
  expectedWorkflowId: AiAutomationWorkflowId;
  expectedExternalEffect: "none" | "publish" | "knowledge_promotion";
  connectorId: string;
};

async function claimSqlTuple(input: ClaimInput): Promise<boolean> {
  // The registry remains fail-closed in production. This test harness exercises
  // the exact post-readiness SQL exported and used by the production claimant.
  const client: PoolClient = await databasePool().connect();
  try {
    await client.query("BEGIN");
    await client.query(AI_AUTOMATION_EXECUTION_POLICY_LOCK_SQL, [
      `ai-automation-execution:${input.scope.tenantId}:${input.scope.workspaceId}:${input.expectedWorkflowId}`,
    ]);
    const selected = await client.query<{ id: string }>(
      AI_AUTOMATION_EXECUTION_CLAIM_SELECT_SQL,
      [
        input.runId,
        input.scope.tenantId,
        input.scope.workspaceId,
        input.expectedWorkflowId,
        input.expectedExternalEffect,
      ],
    );
    if (!selected.rows[0]) {
      await client.query("COMMIT");
      return false;
    }
    const executorId = `pg-contract:${randomUUID()}`;
    const updated = await client.query<{ id: string }>(
      AI_AUTOMATION_EXECUTION_CLAIM_UPDATE_SQL,
      [
        input.runId,
        executorId,
        300,
        input.connectorId,
        input.expectedWorkflowId,
        input.expectedExternalEffect,
      ],
    );
    await client.query("COMMIT");
    return updated.rowCount === 1;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function claimReadyTuple(input: ClaimInput): Promise<boolean> {
  if (!matchesAiAutomationExecutorBinding({
    workflowId: input.expectedWorkflowId,
    connectorId: input.connectorId,
    externalEffect: input.expectedExternalEffect,
  })) {
    return false;
  }
  return claimSqlTuple(input);
}

describe("AI automation command and executor contracts", () => {
  it("hashes the complete immutable command and matches only the exact executor tuple", () => {
    const scope = {
      tenantId: "hash-tenant",
      workspaceId: "hash-workspace",
    };
    const command = commandFor(scope, "fixed");
    const definition = aiAutomationPolicy(command.workflowId);
    const expected = createHash("sha256")
      .update("tecpey-ai-automation-command:v1\0")
      .update(JSON.stringify({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        workflowId: command.workflowId,
        triggerType: command.triggerType,
        dataClass: command.dataClass,
        criticality: definition.criticality,
        resourceType: command.resourceType,
        resourceId: command.resourceId,
        inputHash: command.inputHash,
        idempotencyKey: command.idempotencyKey,
        policyVersion: AI_AUTOMATION_POLICY_VERSION,
        aiReviewerIds: [...definition.aiReviewers],
        aiQuorum: definition.aiQuorum,
        managerRoleIds: [...definition.managerRoles],
        managerQuorum: definition.managerQuorum,
        cLevelRoleIds: [...definition.cLevelRoles],
        cLevelQuorum: definition.cLevelQuorum,
        externalEffect: definition.externalEffect,
        freeFallbackAllowed: definition.freeFallbackAllowed,
        maxAttempts: definition.maxAttempts,
        approvalTtlMinutes: definition.approvalTtlMinutes,
        requestedBy: command.requestedBy,
      }))
      .digest("hex");
    assert.equal(automationCommandHash(command), expected);

    const distinctCommands: Command[] = [
      { ...command, tenantId: "hash-tenant-2" },
      { ...command, workspaceId: "hash-workspace-2" },
      { ...command, triggerType: "manual" },
      { ...command, dataClass: "aggregate_deidentified" },
      { ...command, resourceType: "different_resource" },
      { ...command, resourceId: null },
      { ...command, inputHash: "f".repeat(64) },
      { ...command, idempotencyKey: "automation:different" },
      { ...command, requestedBy: randomUUID() },
    ];
    for (const distinct of distinctCommands) {
      assert.notEqual(automationCommandHash(distinct), expected);
    }

    const binding = aiAutomationExecutorBinding(workflowId);
    assert.equal(Object.isFrozen(binding), true);
    assert.equal(matchesAiAutomationExecutorBinding({
      workflowId,
      connectorId: binding.connectorId,
      externalEffect: binding.externalEffect,
    }), true);
    assert.equal(matchesAiAutomationExecutorBinding({
      workflowId,
      connectorId: "tecpey.routing.wrong.v1",
      externalEffect: binding.externalEffect,
    }), false);
    assert.equal(matchesAiAutomationExecutorBinding({
      workflowId,
      connectorId: binding.connectorId,
      externalEffect: "publish",
    }), false);
    assert.equal(isReadyAiAutomationExecutorBinding({
      workflowId,
      connectorId: binding.connectorId,
      externalEffect: binding.externalEffect,
    }), false);
  });

  it(
    "deduplicates concurrent enqueue and detects a different full command hash",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const scope = await createScope();
      const command = commandFor(scope);
      const [first, second] = await Promise.all([
        enqueueOnce(command),
        enqueueOnce(command),
      ]);
      assert.equal([first, second].filter(Boolean).length, 1);

      const stored = await databasePool().query<{
        id: string;
        command_hash: string;
      }>(
        `SELECT id, command_hash
           FROM ai_automation_runs
          WHERE tenant_id = $1 AND workspace_id = $2 AND idempotency_key = $3`,
        [scope.tenantId, scope.workspaceId, command.idempotencyKey],
      );
      assert.equal(stored.rowCount, 1);
      assert.equal(stored.rows[0].command_hash, automationCommandHash(command));

      const conflicting = {
        ...command,
        resourceType: "different_resource_type",
      };
      assert.notEqual(
        automationCommandHash(conflicting),
        stored.rows[0].command_hash,
      );
      assert.equal(await enqueueOnce(conflicting), null);
      const replay = await databasePool().query<{ command_hash: string }>(
        `SELECT command_hash
           FROM ai_automation_runs
          WHERE tenant_id = $1 AND workspace_id = $2 AND idempotency_key = $3`,
        [scope.tenantId, scope.workspaceId, command.idempotencyKey],
      );
      assert.notEqual(
        replay.rows[0].command_hash,
        automationCommandHash(conflicting),
      );
      await assert.rejects(
        databasePool().query(
          "UPDATE ai_automation_runs SET command_hash = $2 WHERE id = $1::uuid",
          [stored.rows[0].id, automationCommandHash(conflicting)],
        ),
        /immutable run fields/,
      );
    },
  );

  it(
    "serializes execution claims at maxConcurrency and persists the exact connector tuple",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const tupleScope = await createScope();
      const tupleRunId = await seedApprovedRun(tupleScope);
      const binding = aiAutomationExecutorBinding(workflowId);
      assert.equal(await claimSqlTuple({
        scope: tupleScope,
        runId: tupleRunId,
        expectedWorkflowId: workflowId,
        expectedExternalEffect: "publish",
        connectorId: binding.connectorId,
      }), false);
      assert.equal(await claimSqlTuple({
        scope: tupleScope,
        runId: tupleRunId,
        expectedWorkflowId: "executive_operating_review",
        expectedExternalEffect: "none",
        connectorId: aiAutomationExecutorBinding(
          "executive_operating_review",
        ).connectorId,
      }), false);
      assert.equal(await claimReadyTuple({
        scope: tupleScope,
        runId: tupleRunId,
        expectedWorkflowId: workflowId,
        expectedExternalEffect: binding.externalEffect,
        connectorId: "tecpey.routing.wrong.v1",
      }), false);
      assert.equal(await claimReadyTuple({
        scope: tupleScope,
        runId: tupleRunId,
        expectedWorkflowId: workflowId,
        expectedExternalEffect: binding.externalEffect,
        connectorId: binding.connectorId,
      }), true);
      const bound = await databasePool().query<{
        status: string;
        execution_connector_id: string | null;
      }>("SELECT status, execution_connector_id FROM ai_automation_runs WHERE id = $1", [tupleRunId]);
      assert.deepEqual(bound.rows[0], {
        status: "executing",
        execution_connector_id: binding.connectorId,
      });

      const concurrencyScope = await createScope(1);
      const runIds = await Promise.all([
        seedApprovedRun(concurrencyScope),
        seedApprovedRun(concurrencyScope),
      ]);
      const claims = await Promise.all(runIds.map((runId) => claimReadyTuple({
        scope: concurrencyScope,
        runId,
        expectedWorkflowId: workflowId,
        expectedExternalEffect: binding.externalEffect,
        connectorId: binding.connectorId,
      })));
      assert.equal(claims.filter(Boolean).length, 1);
      const statuses = await databasePool().query<{ status: string }>(
        `SELECT status FROM ai_automation_runs
          WHERE tenant_id = $1 AND workspace_id = $2
          ORDER BY id`,
        [concurrencyScope.tenantId, concurrencyScope.workspaceId],
      );
      assert.deepEqual(
        statuses.rows.map((row) => row.status).sort(),
        ["approved", "executing"],
      );
    },
  );

  it(
    "turns an expired execution into terminal reconciliation debt and blocks blind retry",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const scope = await createScope(2);
      const binding = aiAutomationExecutorBinding(workflowId);
      const expiredRunId = await seedApprovedRun(scope);
      assert.equal(await claimReadyTuple({
        scope,
        runId: expiredRunId,
        expectedWorkflowId: workflowId,
        expectedExternalEffect: binding.externalEffect,
        connectorId: binding.connectorId,
      }), true);
      await databasePool().query(
        `UPDATE ai_automation_runs
            SET lease_expires_at = NOW() - INTERVAL '1 second'
          WHERE id = $1::uuid`,
        [expiredRunId],
      );
      const waitingRunId = await seedApprovedRun(scope);

      assert.equal(
        await recoverExpiredAiAutomationRuns(scope),
        1,
      );
      const recovered = await databasePool().query<{
        status: string;
        failure_code: string | null;
        lease_owner: string | null;
        lease_expires_at: Date | null;
        execution_connector_id: string | null;
      }>(
        `SELECT status, failure_code, lease_owner, lease_expires_at,
                execution_connector_id
           FROM ai_automation_runs
          WHERE id = $1::uuid`,
        [expiredRunId],
      );
      assert.deepEqual(recovered.rows[0], {
        status: "blocked",
        failure_code: "execution_reconciliation_required",
        lease_owner: null,
        lease_expires_at: null,
        execution_connector_id: binding.connectorId,
      });
      const event = await databasePool().query<{
        id: string;
        event_type: string;
        metadata: Record<string, unknown>;
      }>(
        `SELECT id, event_type, metadata
           FROM ai_automation_run_events
          WHERE run_id = $1::uuid AND event_type = 'blocked'
          ORDER BY created_at DESC
          LIMIT 1`,
        [expiredRunId],
      );
      assert.equal(event.rows[0].metadata.reconciliation_required, true);
      assert.equal(event.rows[0].metadata.connector_id, binding.connectorId);
      assert.equal(await claimReadyTuple({
        scope,
        runId: waitingRunId,
        expectedWorkflowId: workflowId,
        expectedExternalEffect: binding.externalEffect,
        connectorId: binding.connectorId,
      }), false);
      await assert.rejects(
        databasePool().query(
          "UPDATE ai_automation_runs SET status = 'approved' WHERE id = $1::uuid",
          [expiredRunId],
        ),
        /Invalid AI automation state transition/,
      );
      await assert.rejects(
        databasePool().query(
          "UPDATE ai_automation_run_events SET event_type = 'completed' WHERE id = $1::uuid",
          [event.rows[0].id],
        ),
        /append-only|mutation/i,
      );
    },
  );
});
