export const MENTOR_CAPABILITY_POLICY_VERSION = "2026-09-18.1" as const;

export type MentorCapabilityReason =
  | "premium_subscription_authority_not_live"
  | "scope_invalid";

export type MentorCapabilitySnapshot = Readonly<{
  policyVersion: typeof MENTOR_CAPABILITY_POLICY_VERSION;
  plan: "free" | "premium";
  premiumRuntimeEnabled: boolean;
  publicResearchEnabled: boolean;
  webResearchEnabled: boolean;
  socialResearchEnabled: boolean;
  reason: MentorCapabilityReason;
}>;

const FREE_FAIL_CLOSED_CAPABILITIES: MentorCapabilitySnapshot = Object.freeze({
  policyVersion: MENTOR_CAPABILITY_POLICY_VERSION,
  plan: "free",
  premiumRuntimeEnabled: false,
  publicResearchEnabled: false,
  webResearchEnabled: false,
  socialResearchEnabled: false,
  reason: "premium_subscription_authority_not_live",
});

/**
 * User-level Mentor capabilities are server authority.
 *
 * TecPey Pro purchase/renewal/cancellation is not live yet, so research remains
 * fail-closed even if a client is modified to render Premium controls. Keeping
 * this boundary explicit prevents UI plan props from becoming authorization.
 *
 * When subscription/graduation entitlements are implemented, this function is
 * the single place that should read the durable entitlement authority.
 */
export async function resolveMentorCapabilityAuthority(input: {
  tenantId: string;
  workspaceId: string;
  studentId: string;
}): Promise<MentorCapabilitySnapshot> {
  if (
    !input.tenantId.trim() ||
    !input.workspaceId.trim() ||
    !input.studentId.trim()
  ) {
    return {
      ...FREE_FAIL_CLOSED_CAPABILITIES,
      reason: "scope_invalid",
    };
  }
  return FREE_FAIL_CLOSED_CAPABILITIES;
}

export function mentorPublicResearchAuthorized(
  capabilities: MentorCapabilitySnapshot,
): boolean {
  return (
    capabilities.plan === "premium" &&
    capabilities.premiumRuntimeEnabled &&
    capabilities.publicResearchEnabled
  );
}
