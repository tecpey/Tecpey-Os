import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_AUTOMATION_POLICIES,
  evaluateAiAutomationGate,
  validateAiAutomationCatalog,
} from "../../lib/ai/automation-catalog";
import {
  AI_AUTOMATION_EXECUTOR_BINDINGS,
  validateAiAutomationExecutorRegistry,
} from "../../lib/ai/automation-executor-registry";

describe("AI automation governance catalog", () => {
  it("keeps every workflow fail-closed until its exact executor binding is launch-ready", () => {
    assert.doesNotThrow(() => validateAiAutomationExecutorRegistry());
    assert.equal(
      AI_AUTOMATION_EXECUTOR_BINDINGS.length,
      AI_AUTOMATION_POLICIES.length,
    );
    for (const binding of AI_AUTOMATION_EXECUTOR_BINDINGS) {
      const policy = AI_AUTOMATION_POLICIES.find(
        (item) => item.id === binding.workflowId,
      );
      assert.ok(policy);
      assert.equal(binding.externalEffect, policy.externalEffect);
      assert.equal(binding.launchReady, false);
    }
  });

  it("requires independent human gates for every external effect", () => {
    assert.doesNotThrow(() => validateAiAutomationCatalog());
    for (const policy of AI_AUTOMATION_POLICIES) {
      if (policy.externalEffect === "none") continue;
      assert.ok(policy.managerQuorum > 0, `${policy.id} manager gate`);
      assert.ok(policy.cLevelQuorum > 0, `${policy.id} C-level gate`);
    }
  });

  it("limits free fallback to public, non-effect policies", () => {
    for (const policy of AI_AUTOMATION_POLICIES.filter((item) => item.freeFallbackAllowed)) {
      assert.deepEqual(policy.allowedDataClasses, ["public"]);
      assert.equal(policy.externalEffect, "none");
      assert.equal(policy.criticality, "noncritical");
    }
  });

  it("advances only after each quorum and rejects on one negative vote", () => {
    const policy = AI_AUTOMATION_POLICIES.find((item) => item.id === "content_publication");
    assert.ok(policy);
    assert.equal(evaluateAiAutomationGate({ policy, aiApprovals: 0, managerApprovals: 0, cLevelApprovals: 0, rejectionCount: 0 }), "ai_review");
    assert.equal(evaluateAiAutomationGate({ policy, aiApprovals: 2, managerApprovals: 0, cLevelApprovals: 0, rejectionCount: 0 }), "manager_review");
    assert.equal(evaluateAiAutomationGate({ policy, aiApprovals: 2, managerApprovals: 1, cLevelApprovals: 0, rejectionCount: 0 }), "c_level_review");
    assert.equal(evaluateAiAutomationGate({ policy, aiApprovals: 2, managerApprovals: 1, cLevelApprovals: 1, rejectionCount: 0 }), "approved");
    assert.equal(evaluateAiAutomationGate({ policy, aiApprovals: 2, managerApprovals: 1, cLevelApprovals: 1, rejectionCount: 1 }), "rejected");
  });
});
