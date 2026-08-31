export const MENTOR_WORKSPACE_CONTRACT_VERSION = "1.0.0" as const;

export type MentorWorkspacePlan = "free" | "premium";
export type MentorWorkspaceSurface =
  | "academy"
  | "web_research"
  | "social_research";
export type MentorWorkspaceScreenMode =
  | "single"
  | "single_switcher"
  | "multi_monitor";

export type MentorWorkspaceEntitlements = Readonly<{
  ads: "eligible" | "none";
  monitorCount: 1 | 3;
  safetyParity: true;
  surfaces: readonly MentorWorkspaceSurface[];
}>;

export const MENTOR_WORKSPACE_SURFACES: ReadonlyArray<
  Readonly<{
    id: MentorWorkspaceSurface;
    requiresPremium: boolean;
    researchMode: "off" | "public";
  }>
> = [
  { id: "academy", requiresPremium: false, researchMode: "off" },
  { id: "web_research", requiresPremium: true, researchMode: "public" },
  { id: "social_research", requiresPremium: true, researchMode: "public" },
];

export const MENTOR_PUBLIC_RESEARCH_EGRESS = Object.freeze({
  queryOnly: true,
  sendsConversationHistory: false,
  sendsLearningProfile: false,
  sendsWeakAreas: false,
  sendsFinancialAccountData: false,
  sendsIdentityDocuments: false,
});

const RTL_LANGUAGE_CODES = new Set([
  "ar",
  "ckb",
  "dv",
  "fa",
  "he",
  "ku",
  "ps",
  "ur",
  "yi",
]);

export function mentorWorkspaceDirection(locale: string): "ltr" | "rtl" {
  const language = locale.trim().toLowerCase().split(/[-_]/)[0];
  return RTL_LANGUAGE_CODES.has(language) ? "rtl" : "ltr";
}

export function mentorWorkspaceEntitlements(
  plan: MentorWorkspacePlan,
): MentorWorkspaceEntitlements {
  if (plan === "premium") {
    return {
      ads: "none",
      monitorCount: 3,
      safetyParity: true,
      surfaces: ["academy", "web_research", "social_research"],
    };
  }
  return {
    ads: "eligible",
    monitorCount: 1,
    safetyParity: true,
    surfaces: ["academy"],
  };
}

export function canUseMentorWorkspaceSurface(
  plan: MentorWorkspacePlan,
  surface: MentorWorkspaceSurface,
): boolean {
  return mentorWorkspaceEntitlements(plan).surfaces.includes(surface);
}

export function mentorWorkspaceScreenMode(input: {
  compact: boolean;
  plan: MentorWorkspacePlan;
}): MentorWorkspaceScreenMode {
  if (input.compact) return "single_switcher";
  return input.plan === "premium" ? "multi_monitor" : "single";
}

export function mentorResearchModeForSurface(
  plan: MentorWorkspacePlan,
  surface: MentorWorkspaceSurface,
): "off" | "public" {
  if (!canUseMentorWorkspaceSurface(plan, surface)) return "off";
  return MENTOR_WORKSPACE_SURFACES.find((item) => item.id === surface)
    ?.researchMode ?? "off";
}
