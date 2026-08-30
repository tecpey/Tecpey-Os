import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const source = (path: string) => readFile(path, "utf8");

describe("AI automation source authority", () => {
  it("separates signed tenant transactions from bounded cross-tenant worker claims", async () => {
    const store = await source("src/lib/ai/automation-store.ts");
    assert.match(store, /withAiTenantTransaction/);
    assert.match(store, /withAiWorkerTransaction/);
    assert.match(store, /writeAiAdminAuditEvent/);
    assert.doesNotMatch(store, /from ["']@\/lib\/db["']/);
    assert.doesNotMatch(store, /\bwith(?:Db|Tx)\b/);
    assert.doesNotMatch(store, /\bwriteAdminAuditEvent\b/);
  });
  it("enforces quorum, real admin roles, lease ownership and append-only evidence in PostgreSQL", async () => {
    const migration = await source("src/lib/db-migrate-ai-automation.ts");
    assert.match(migration, /tecpey_guard_ai_automation_run_transition/);
    assert.match(migration, /AI automation C-level quorum is not satisfied/);
    assert.match(migration, /admin_user_roles user_role/);
    assert.match(migration, /NEW\.reviewer_roles := actual_roles/);
    assert.match(migration, /target\.lease_owner IS DISTINCT FROM NEW\.reviewer_worker_id/);
    assert.match(migration, /requester cannot approve own run/);
    assert.match(migration, /ai_automation_reviews_human_once_idx/);
    assert.match(migration, /FOREIGN KEY \(run_id, tenant_id, workspace_id\)/);
    assert.match(migration, /'approved', 'executing', 'completed', 'failed', 'blocked', 'cancelled'/);
    assert.match(migration, /policy is disabled or superseded/);
    assert.match(migration, /Expired AI automation approval cannot execute/);
    assert.match(migration, /tecpey_reject_ai_control_event_mutation/);
    assert.match(migration, /command_hash TEXT NOT NULL/);
    assert.match(migration, /execution_connector_id TEXT CHECK/);
    assert.match(migration, /execution connector binding cannot change/);
    assert.match(migration, /WHEN 'executing' THEN NEW\.status IN \('completed', 'failed', 'blocked'\)/);
  });

  it("keeps admin mutations bounded, permissioned and step-up protected", async () => {
    const route = await source("src/app/api/command-center/ai-automation/route.ts");
    assert.match(route, /"ai\.automation\.manage"/);
    assert.match(route, /"ai\.automation\.review"/);
    assert.match(route, /stepUpWithinSeconds: 300/);
    assert.match(route, /readBoundedJsonRequest\(request, \{ maxBytes: 16_384 \}\)/);
    assert.match(route, /verifyCsrfOrigin/);
    assert.match(route, /ai_automation_executor_not_ready/);
    assert.match(route, /idempotency_conflict/);
    assert.doesNotMatch(route, /claimApprovedAiAutomationExecution/);
  });

  it("repairs the polymorphic JSON trigger without dereferencing absent record fields", async () => {
    const repair = await source("src/lib/db-migrate-ai-control-json-trigger-repair.ts");
    assert.match(repair, /row_document := to_jsonb\(NEW\)/);
    assert.match(repair, /row_document -> 'settings'/);
    assert.match(repair, /row_document -> 'settings_snapshot'/);
    assert.match(repair, /row_document -> 'limits_snapshot'/);
    assert.match(repair, /row_document -> 'metadata'/);
    assert.doesNotMatch(repair, /NEW\.(?:settings|settings_snapshot|limits_snapshot|metadata)/);
  });

  it("starts the worker only behind an explicit feature gate and leaves effects to domain executors", async () => {
    const [worker, internalExecutor, store, registry, panel] = await Promise.all([
      source("scripts/run-ai-automation-worker.ts"),
      source("scripts/run-ai-automation-internal-executor.ts"),
      source("src/lib/ai/automation-store.ts"),
      source("src/lib/ai/automation-executor-registry.ts"),
      source("src/components/admin/AiAutomationPanel.tsx"),
    ]);
    assert.match(worker, /AI_AUTOMATION_WORKER_ENABLED/);
    assert.match(internalExecutor, /AI_AUTOMATION_INTERNAL_EXECUTOR_ENABLED/);
    assert.match(internalExecutor, /completeNextApprovedNoEffectAiAutomationRun/);
    assert.match(internalExecutor, /ai_automation_internal_executor_not_launch_ready/);
    assert.match(store, /FOR UPDATE OF run SKIP LOCKED/);
    assert.match(store, /pg_advisory_xact_lock/);
    assert.match(store, /claimApprovedAiAutomationExecution/);
    assert.match(store, /status = 'executing'/);
    assert.match(store, /policy_superseded/);
    assert.match(store, /execution_lease_expired/);
    assert.match(store, /execution_reconciliation_required/);
    assert.match(store, /separation_of_duties/);
    assert.match(store, /expectedWorkflowId/);
    assert.match(store, /expectedExternalEffect/);
    assert.match(store, /execution_connector_id = \$4/);
    assert.match(store, /active\.status = 'executing'/);
    assert.match(store, /ON CONFLICT \(tenant_id, workspace_id, idempotency_key\) DO NOTHING/);
    assert.match(store, /replay\.command_hash !== commandHash/);
    assert.match(store, /must never manufacture a completion/);
    assert.match(registry, /launchReady: false/g);
    assert.match(panel, /enqueueCommandRef/);
    assert.match(panel, /data\?\.ok === true/);
    assert.match(panel, /ai_automation_idempotency_conflict/);
    assert.match(panel, /Controlled launch/);
  });

  it("uses a fresh spend idempotency key for every durable lease attempt", async () => {
    const worker = await source("src/lib/ai/automation-worker.ts");
    assert.match(
      worker,
      /automation:\$\{input\.run\.id\}:\$\{input\.agentId\}:\$\{input\.run\.attemptCount\}/,
    );
  });
});
