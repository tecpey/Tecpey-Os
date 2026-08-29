import {
  AI_AUTOMATION_POLICIES,
  type AiAutomationWorkflowId,
} from "./automation-catalog";

export type AiAutomationExecutorBinding = Readonly<{
  workflowId: AiAutomationWorkflowId;
  connectorId: string;
  externalEffect: "none" | "publish" | "knowledge_promotion";
  launchReady: boolean;
  blockingReason:
    | "output_authority_unavailable"
    | "domain_connector_unavailable"
    | "reconciliation_authority_unavailable";
}>;

function executorBinding(
  binding: AiAutomationExecutorBinding,
): AiAutomationExecutorBinding {
  return Object.freeze(binding);
}

/**
 * Controlled-launch registry for domain executors.
 *
 * A workflow may only be enabled or claimed when its exact workflow/effect/
 * connector tuple is marked ready here. All bindings intentionally remain
 * fail-closed until their output authority, idempotent connector and
 * reconciliation evidence have production-grade implementations.
 */
export const AI_AUTOMATION_EXECUTOR_BINDINGS: readonly AiAutomationExecutorBinding[] =
  Object.freeze([
    executorBinding({
      workflowId: "public_intelligence_digest",
      connectorId: "tecpey.internal.public-intelligence.v1",
      externalEffect: "none",
      launchReady: false,
      blockingReason: "output_authority_unavailable",
    }),
    executorBinding({
      workflowId: "content_publication",
      connectorId: "tecpey.content.publisher.v1",
      externalEffect: "publish",
      launchReady: false,
      blockingReason: "domain_connector_unavailable",
    }),
    executorBinding({
      workflowId: "knowledge_promotion",
      connectorId: "tecpey.knowledge.promoter.v1",
      externalEffect: "knowledge_promotion",
      launchReady: false,
      blockingReason: "reconciliation_authority_unavailable",
    }),
    executorBinding({
      workflowId: "executive_operating_review",
      connectorId: "tecpey.internal.executive-review.v1",
      externalEffect: "none",
      launchReady: false,
      blockingReason: "output_authority_unavailable",
    }),
    executorBinding({
      workflowId: "provider_budget_failover",
      connectorId: "tecpey.routing.budget-failover.v1",
      externalEffect: "none",
      launchReady: false,
      blockingReason: "domain_connector_unavailable",
    }),
  ]);

const bindings = new Map(
  AI_AUTOMATION_EXECUTOR_BINDINGS.map((binding) => [
    binding.workflowId,
    binding,
  ] as const),
);

export function aiAutomationExecutorBinding(
  workflowId: AiAutomationWorkflowId,
): AiAutomationExecutorBinding {
  const binding = bindings.get(workflowId);
  if (!binding) {
    throw new Error(`ai_automation_executor_binding_missing:${workflowId}`);
  }
  return binding;
}

export function readyAiAutomationWorkflowIds(): AiAutomationWorkflowId[] {
  return AI_AUTOMATION_EXECUTOR_BINDINGS.filter(
    (binding) => binding.launchReady,
  ).map((binding) => binding.workflowId);
}

export function matchesAiAutomationExecutorBinding(input: {
  workflowId: AiAutomationWorkflowId;
  connectorId: string;
  externalEffect: AiAutomationExecutorBinding["externalEffect"];
}): boolean {
  const binding = aiAutomationExecutorBinding(input.workflowId);
  return (
    binding.connectorId === input.connectorId &&
    binding.externalEffect === input.externalEffect
  );
}

export function isReadyAiAutomationExecutorBinding(input: {
  workflowId: AiAutomationWorkflowId;
  connectorId: string;
  externalEffect: AiAutomationExecutorBinding["externalEffect"];
}): boolean {
  return (
    aiAutomationExecutorBinding(input.workflowId).launchReady &&
    matchesAiAutomationExecutorBinding(input)
  );
}

export function validateAiAutomationExecutorRegistry(): void {
  if (bindings.size !== AI_AUTOMATION_POLICIES.length) {
    throw new Error("ai_automation_executor_binding_coverage_invalid");
  }
  for (const policy of AI_AUTOMATION_POLICIES) {
    const binding = bindings.get(policy.id);
    if (!binding || binding.externalEffect !== policy.externalEffect) {
      throw new Error(`ai_automation_executor_binding_invalid:${policy.id}`);
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/.test(binding.connectorId)) {
      throw new Error(`ai_automation_connector_id_invalid:${policy.id}`);
    }
  }
}

validateAiAutomationExecutorRegistry();
