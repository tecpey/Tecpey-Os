import { PLATFORM } from "@/lib/platform-config";
import type { AiAgentId } from "./control-plane-catalog";

export const AI_TENANT_ISOLATION_BLOCK_REASON =
  "tenant_isolation_unresolved" as const;
export const AI_TENANT_ISOLATION_BLOCKER =
  "signed_rls_runtime_evidence_pending" as const;

export type ManagedAiLaunchStatus = Readonly<{
  ready: false;
  reason: typeof AI_TENANT_ISOLATION_BLOCK_REASON;
  blocker: typeof AI_TENANT_ISOLATION_BLOCKER;
  overrideAllowed: false;
  exception: Readonly<{
    configurationSource: "environment";
    agentId: "mentor_coach";
    tenantId: typeof PLATFORM.DEFAULT_TENANT_ID;
    workspaceId: typeof PLATFORM.DEFAULT_WORKSPACE_ID;
  }>;
}>;

/**
 * Release containment, not an RLS readiness claim.
 *
 * This value is intentionally code-owned and has no environment, request or
 * operator override. It may only be changed in a separately reviewed release
 * after protected exact-head runtime-role, signed-context and FORCE RLS
 * evidence are complete in CI and staging.
 */
export const MANAGED_AI_LAUNCH_STATUS: ManagedAiLaunchStatus = Object.freeze({
  ready: false,
  reason: AI_TENANT_ISOLATION_BLOCK_REASON,
  blocker: AI_TENANT_ISOLATION_BLOCKER,
  overrideAllowed: false,
  exception: Object.freeze({
    configurationSource: "environment",
    agentId: "mentor_coach",
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
  }),
});

export type AiLaunchPolicyDecision =
  | Readonly<{
      allowed: true;
      mode: "default_environment_mentor";
    }>
  | Readonly<{
      allowed: false;
      reason: typeof AI_TENANT_ISOLATION_BLOCK_REASON;
      blocker: typeof AI_TENANT_ISOLATION_BLOCKER;
    }>;

export function managedAiLaunchStatus(): ManagedAiLaunchStatus {
  return MANAGED_AI_LAUNCH_STATUS;
}

/** The only launch exception is the legacy default-environment Mentor path. */
export function evaluateAiLaunchPolicy(input: {
  tenantId: string;
  workspaceId: string;
  agentId: AiAgentId;
  configurationSource: "managed" | "environment";
}): AiLaunchPolicyDecision {
  const exception = MANAGED_AI_LAUNCH_STATUS.exception;
  if (
    input.configurationSource === exception.configurationSource &&
    input.agentId === exception.agentId &&
    input.tenantId === exception.tenantId &&
    input.workspaceId === exception.workspaceId
  ) {
    return Object.freeze({
      allowed: true,
      mode: "default_environment_mentor",
    });
  }
  return Object.freeze({
    allowed: false,
    reason: MANAGED_AI_LAUNCH_STATUS.reason,
    blocker: MANAGED_AI_LAUNCH_STATUS.blocker,
  });
}
