import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const source = (path: string) => readFile(path, "utf8");

describe("AI automation source authority", () => {
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
  });

  it("keeps admin mutations bounded, permissioned and step-up protected", async () => {
    const route = await source("src/app/api/command-center/ai-automation/route.ts");
    assert.match(route, /"ai\.automation\.manage"/);
    assert.match(route, /"ai\.automation\.review"/);
    assert.match(route, /stepUpWithinSeconds: 300/);
    assert.match(route, /readBoundedJsonRequest\(request, \{ maxBytes: 16_384 \}\)/);
    assert.match(route, /verifyCsrfOrigin/);
    assert.doesNotMatch(route, /claimApprovedAiAutomationExecution/);
  });

  it("starts the worker only behind an explicit feature gate and leaves effects to domain executors", async () => {
    const [worker, internalExecutor, store] = await Promise.all([
      source("scripts/run-ai-automation-worker.ts"),
      source("scripts/run-ai-automation-internal-executor.ts"),
      source("src/lib/ai/automation-store.ts"),
    ]);
    assert.match(worker, /AI_AUTOMATION_WORKER_ENABLED/);
    assert.match(internalExecutor, /AI_AUTOMATION_INTERNAL_EXECUTOR_ENABLED/);
    assert.match(internalExecutor, /completeNextApprovedNoEffectAiAutomationRun/);
    assert.match(store, /FOR UPDATE OF run SKIP LOCKED/);
    assert.match(store, /pg_advisory_xact_lock/);
    assert.match(store, /claimApprovedAiAutomationExecution/);
    assert.match(store, /status = 'executing'/);
    assert.match(store, /policy_superseded/);
    assert.match(store, /execution_lease_expired/);
    assert.match(store, /separation_of_duties/);
    assert.match(store, /run\.external_effect = 'none'/);
  });
});
