import {
  AI_AGENT_IDS,
  AI_DATA_CLASSES,
  type AiAgentId,
  type AiDataClass,
} from "./control-plane-catalog";

export const AI_AUTOMATION_POLICY_VERSION = "2026-08-28.1";

export const AI_AUTOMATION_WORKFLOW_IDS = [
  "public_intelligence_digest",
  "organic_growth_intelligence",
  "content_publication",
  "knowledge_promotion",
  "executive_operating_review",
  "provider_budget_failover",
] as const;

export type AiAutomationWorkflowId =
  (typeof AI_AUTOMATION_WORKFLOW_IDS)[number];

export const AI_AUTOMATION_RUN_STATUSES = [
  "queued",
  "ai_review",
  "manager_review",
  "c_level_review",
  "approved",
  "executing",
  "completed",
  "rejected",
  "blocked",
  "failed",
  "cancelled",
] as const;

export type AiAutomationRunStatus =
  (typeof AI_AUTOMATION_RUN_STATUSES)[number];

export type AiAutomationReviewKind = "ai_agent" | "manager" | "c_level";
export type AiAutomationDecision = "approve" | "reject" | "abstain";

export type AiAutomationPolicy = Readonly<{
  id: AiAutomationWorkflowId;
  labelFa: string;
  labelEn: string;
  trigger: "scheduled" | "event" | "manual";
  defaultIntervalMinutes: number | null;
  allowedDataClasses: readonly AiDataClass[];
  criticality: "noncritical" | "standard" | "critical";
  aiReviewers: readonly AiAgentId[];
  aiQuorum: number;
  managerRoles: readonly string[];
  managerQuorum: number;
  cLevelRoles: readonly string[];
  cLevelQuorum: number;
  externalEffect: "none" | "publish" | "knowledge_promotion";
  freeFallbackAllowed: boolean;
  maxAttempts: number;
  approvalTtlMinutes: number;
}>;

export const AI_AUTOMATION_POLICIES: readonly AiAutomationPolicy[] =
  Object.freeze([
    {
      id: "public_intelligence_digest",
      labelFa: "رصد خودکار اخبار، X، کوین و ابزار",
      labelEn: "Automated public intelligence digest",
      trigger: "scheduled",
      defaultIntervalMinutes: 30,
      allowedDataClasses: ["public"],
      criticality: "noncritical",
      aiReviewers: [
        "news_x_researcher",
        "content_reviewer",
        "risk_compliance_reviewer",
      ],
      aiQuorum: 3,
      managerRoles: ["ai_governance_admin", "marketing_operator"],
      managerQuorum: 0,
      cLevelRoles: [],
      cLevelQuorum: 0,
      externalEffect: "none",
      freeFallbackAllowed: true,
      maxAttempts: 3,
      approvalTtlMinutes: 1_440,
    },
    {
      id: "organic_growth_intelligence",
      labelFa: "رادار رشد ارگانیک SEO/GEO/AEO",
      labelEn: "SEO/GEO/AEO organic growth radar",
      trigger: "scheduled",
      defaultIntervalMinutes: 30,
      allowedDataClasses: ["public", "aggregate_deidentified", "approved_platform_content"],
      criticality: "standard",
      aiReviewers: ["growth_hacker", "content_reviewer", "risk_compliance_reviewer"],
      aiQuorum: 3,
      managerRoles: ["marketing_operator", "ai_governance_admin"],
      managerQuorum: 0,
      cLevelRoles: ["chief_executive_officer", "chief_operating_officer", "super_admin"],
      cLevelQuorum: 0,
      externalEffect: "none",
      freeFallbackAllowed: false,
      maxAttempts: 3,
      approvalTtlMinutes: 720,
    },
    {
      id: "content_publication",
      labelFa: "انتشار محتوای بررسی‌شده",
      labelEn: "Governed content publication",
      trigger: "event",
      defaultIntervalMinutes: null,
      allowedDataClasses: ["public", "approved_platform_content"],
      criticality: "critical",
      aiReviewers: ["content_reviewer", "risk_compliance_reviewer"],
      aiQuorum: 2,
      managerRoles: [
        "academy_admin",
        "marketing_operator",
        "ai_governance_admin",
      ],
      managerQuorum: 1,
      cLevelRoles: [
        "chief_content_officer",
        "chief_risk_compliance_officer",
        "chief_executive_officer",
        "super_admin",
      ],
      cLevelQuorum: 1,
      externalEffect: "publish",
      freeFallbackAllowed: false,
      maxAttempts: 2,
      approvalTtlMinutes: 720,
    },
    {
      id: "knowledge_promotion",
      labelFa: "ارتقای الگو به دانش رسمی تک‌پی",
      labelEn: "Governed TecPey knowledge promotion",
      trigger: "event",
      defaultIntervalMinutes: null,
      allowedDataClasses: [
        "public",
        "aggregate_deidentified",
        "approved_platform_content",
      ],
      criticality: "critical",
      aiReviewers: ["knowledge_curator", "risk_compliance_reviewer"],
      aiQuorum: 2,
      managerRoles: ["ai_governance_admin", "compliance_approver"],
      managerQuorum: 1,
      cLevelRoles: [
        "chief_technology_officer",
        "chief_risk_compliance_officer",
        "chief_executive_officer",
        "super_admin",
      ],
      cLevelQuorum: 1,
      externalEffect: "knowledge_promotion",
      freeFallbackAllowed: false,
      maxAttempts: 2,
      approvalTtlMinutes: 1_440,
    },
    {
      id: "executive_operating_review",
      labelFa: "مرور اجرایی C-Level",
      labelEn: "C-Level operating review",
      trigger: "scheduled",
      defaultIntervalMinutes: 1_440,
      allowedDataClasses: ["aggregate_deidentified"],
      criticality: "standard",
      aiReviewers: ["executive_briefing", "growth_hacker", "risk_compliance_reviewer"],
      aiQuorum: 3,
      managerRoles: ["ai_governance_admin", "compliance_approver"],
      managerQuorum: 1,
      cLevelRoles: [
        "chief_executive_officer",
        "chief_operating_officer",
        "super_admin",
      ],
      cLevelQuorum: 1,
      externalEffect: "none",
      freeFallbackAllowed: false,
      maxAttempts: 2,
      approvalTtlMinutes: 1_440,
    },
    {
      id: "provider_budget_failover",
      labelFa: "سوییچ خودکار بودجه و ظرفیت Provider",
      labelEn: "Provider budget and capacity failover",
      trigger: "event",
      defaultIntervalMinutes: null,
      allowedDataClasses: ["public"],
      criticality: "noncritical",
      aiReviewers: [],
      aiQuorum: 0,
      managerRoles: [],
      managerQuorum: 0,
      cLevelRoles: [],
      cLevelQuorum: 0,
      externalEffect: "none",
      freeFallbackAllowed: true,
      maxAttempts: 3,
      approvalTtlMinutes: 60,
    },
  ]);

export function isAiAutomationWorkflowId(
  value: unknown,
): value is AiAutomationWorkflowId {
  return AI_AUTOMATION_WORKFLOW_IDS.includes(
    value as AiAutomationWorkflowId,
  );
}

export function isAiAutomationRunStatus(
  value: unknown,
): value is AiAutomationRunStatus {
  return AI_AUTOMATION_RUN_STATUSES.includes(value as AiAutomationRunStatus);
}

export function aiAutomationPolicy(
  workflowId: AiAutomationWorkflowId,
): AiAutomationPolicy {
  const policy = AI_AUTOMATION_POLICIES.find((item) => item.id === workflowId);
  if (!policy)
    throw new Error(`ai_automation_policy_missing:${workflowId}`);
  return policy;
}

export function evaluateAiAutomationGate(input: {
  policy: AiAutomationPolicy;
  aiApprovals: number;
  managerApprovals: number;
  cLevelApprovals: number;
  rejectionCount: number;
}): AiAutomationRunStatus {
  if (input.rejectionCount > 0) return "rejected";
  if (input.aiApprovals < input.policy.aiQuorum) return "ai_review";
  if (input.managerApprovals < input.policy.managerQuorum)
    return "manager_review";
  if (input.cLevelApprovals < input.policy.cLevelQuorum)
    return "c_level_review";
  return "approved";
}

export function assertAiAutomationDataClass(
  workflowId: AiAutomationWorkflowId,
  dataClass: AiDataClass,
): void {
  if (!aiAutomationPolicy(workflowId).allowedDataClasses.includes(dataClass)) {
    throw new Error(
      `ai_automation_data_class_forbidden:${workflowId}:${dataClass}`,
    );
  }
}

export function validateAiAutomationCatalog(): void {
  const ids = new Set<string>();
  for (const policy of AI_AUTOMATION_POLICIES) {
    if (ids.has(policy.id))
      throw new Error(`ai_automation_policy_duplicate:${policy.id}`);
    ids.add(policy.id);
    if (
      !Number.isSafeInteger(policy.aiQuorum) ||
      policy.aiQuorum < 0 ||
      policy.aiQuorum > policy.aiReviewers.length
    ) {
      throw new Error(`ai_automation_ai_quorum_invalid:${policy.id}`);
    }
    if (
      !Number.isSafeInteger(policy.managerQuorum) ||
      policy.managerQuorum < 0 ||
      !Number.isSafeInteger(policy.cLevelQuorum) ||
      policy.cLevelQuorum < 0
    ) {
      throw new Error(`ai_automation_human_quorum_invalid:${policy.id}`);
    }
    if (
      policy.externalEffect !== "none" &&
      (policy.managerQuorum < 1 || policy.cLevelQuorum < 1)
    ) {
      throw new Error(`ai_automation_external_human_gate_missing:${policy.id}`);
    }
    if (
      policy.freeFallbackAllowed &&
      (policy.externalEffect !== "none" ||
        policy.allowedDataClasses.length !== 1 ||
        policy.allowedDataClasses[0] !== "public")
    ) {
      throw new Error(`ai_automation_free_fallback_scope_invalid:${policy.id}`);
    }
    if (
      policy.allowedDataClasses.some(
        (value) => !AI_DATA_CLASSES.includes(value),
      ) ||
      policy.aiReviewers.some((value) => !AI_AGENT_IDS.includes(value))
    ) {
      throw new Error(`ai_automation_reference_invalid:${policy.id}`);
    }
    if (
      !Number.isSafeInteger(policy.maxAttempts) ||
      policy.maxAttempts < 1 ||
      policy.maxAttempts > 5 ||
      !Number.isSafeInteger(policy.approvalTtlMinutes) ||
      policy.approvalTtlMinutes < 15 ||
      policy.approvalTtlMinutes > 10_080
    ) {
      throw new Error(`ai_automation_limit_invalid:${policy.id}`);
    }
  }
}

validateAiAutomationCatalog();
