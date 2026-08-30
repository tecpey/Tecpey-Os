import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLATFORM } from "../../lib/platform-config";
import {
  AI_TENANT_ISOLATION_BLOCKER,
  AI_TENANT_ISOLATION_BLOCK_REASON,
  evaluateAiLaunchPolicy,
  managedAiLaunchStatus,
} from "../../lib/ai/managed-ai-launch-policy";

describe("managed AI controlled-launch policy", () => {
  it("is code-owned, hard-closed and exposes the exact unresolved evidence", () => {
    const status = managedAiLaunchStatus();
    assert.equal(status.ready, false);
    assert.equal(status.overrideAllowed, false);
    assert.equal(status.reason, AI_TENANT_ISOLATION_BLOCK_REASON);
    assert.equal(status.blocker, AI_TENANT_ISOLATION_BLOCKER);
    assert.equal(Object.isFrozen(status), true);
    assert.equal(Object.isFrozen(status.exception), true);
  });

  it("ignores environment-style override attempts", () => {
    const previous = process.env.AI_MANAGED_LAUNCH_OVERRIDE;
    process.env.AI_MANAGED_LAUNCH_OVERRIDE = "true";
    try {
      assert.deepEqual(
        evaluateAiLaunchPolicy({
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
          agentId: "mentor_coach",
          configurationSource: "managed",
        }),
        {
          allowed: false,
          reason: "tenant_isolation_unresolved",
          blocker: "signed_rls_runtime_evidence_pending",
        },
      );
    } finally {
      if (previous === undefined) delete process.env.AI_MANAGED_LAUNCH_OVERRIDE;
      else process.env.AI_MANAGED_LAUNCH_OVERRIDE = previous;
    }
  });

  it("allows only the exact default-environment Mentor exception", () => {
    assert.deepEqual(
      evaluateAiLaunchPolicy({
        tenantId: PLATFORM.DEFAULT_TENANT_ID,
        workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
        agentId: "mentor_coach",
        configurationSource: "environment",
      }),
      { allowed: true, mode: "default_environment_mentor" },
    );

    for (const input of [
      {
        tenantId: PLATFORM.DEFAULT_TENANT_ID,
        workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
        agentId: "mentor_coach" as const,
        configurationSource: "managed" as const,
      },
      {
        tenantId: "another-tenant",
        workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
        agentId: "mentor_coach" as const,
        configurationSource: "environment" as const,
      },
      {
        tenantId: PLATFORM.DEFAULT_TENANT_ID,
        workspaceId: "another-workspace",
        agentId: "mentor_coach" as const,
        configurationSource: "environment" as const,
      },
      {
        tenantId: PLATFORM.DEFAULT_TENANT_ID,
        workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
        agentId: "content_reviewer" as const,
        configurationSource: "environment" as const,
      },
    ]) {
      assert.equal(evaluateAiLaunchPolicy(input).allowed, false);
    }
  });
});
