import type { LivingMentorAct } from "@/lib/living-mentor-presentation";

export type MentorEvidenceState = "unknown" | "provisional" | "observed";

export type LivingProfileMentorProfile = Readonly<{
  level: "beginner" | "intermediate" | "advanced" | null;
  levelEvidenceState: MentorEvidenceState;
  riskProfile: "low" | "medium" | "high" | null;
  riskEvidenceState: MentorEvidenceState;
  primaryGoal: string;
  weakAreas: readonly string[];
  strongAreas: readonly string[];
  confidenceScore: number | null;
  confidenceEvidenceState: MentorEvidenceState;
  disciplineScore: number | null;
  disciplineEvidenceState: MentorEvidenceState;
  learningStyle: string | null;
  learningStyleEvidenceState: MentorEvidenceState;
  updatedAt?: string | null;
}>;

export type LivingProfileMentorInsight = Readonly<{
  id: string;
  insightType: string;
  content: string;
  generatedAt: string;
}>;

export type LivingProfileMentorMode =
  | "authority_unavailable"
  | "evidence_insight"
  | "core_complete"
  | "consistency"
  | "continue_term"
  | "start";

export type LivingProfileMentorPresentation = Readonly<{
  act: LivingMentorAct;
  mode: LivingProfileMentorMode;
  insight: LivingProfileMentorInsight | null;
}>;

/**
 * Presentation policy for the Living Profile.
 *
 * Model-authored text never selects the character act. Host-owned, bounded
 * product state determines the act and the latest governed insight is only
 * rendered as content after that decision has been made.
 */
export function resolveLivingProfileMentorPresentation(input: {
  authorityUnavailable: boolean;
  latestInsight: LivingProfileMentorInsight | null;
  coreComplete: boolean;
  streakDays: number | null;
  currentTermPercent: number | null;
}): LivingProfileMentorPresentation {
  if (input.authorityUnavailable) {
    return { act: "data_unavailable", mode: "authority_unavailable", insight: null };
  }
  if (input.latestInsight?.content.trim()) {
    return { act: "explain", mode: "evidence_insight", insight: input.latestInsight };
  }
  if (input.coreComplete) {
    return { act: "celebrate_effort", mode: "core_complete", insight: null };
  }
  if ((input.streakDays ?? 0) >= 7) {
    return { act: "celebrate_effort", mode: "consistency", insight: null };
  }
  if ((input.currentTermPercent ?? 0) > 0) {
    return { act: "invite_next_step", mode: "continue_term", insight: null };
  }
  return { act: "greet", mode: "start", insight: null };
}

export function observedMentorSignals(profile: LivingProfileMentorProfile | null) {
  if (!profile) return [] as const;
  return [
    profile.levelEvidenceState === "observed" && profile.level
      ? { key: "level" as const, value: profile.level }
      : null,
    profile.riskEvidenceState === "observed" && profile.riskProfile
      ? { key: "risk" as const, value: profile.riskProfile }
      : null,
    profile.confidenceEvidenceState === "observed" && profile.confidenceScore !== null
      ? { key: "confidence" as const, value: profile.confidenceScore }
      : null,
    profile.disciplineEvidenceState === "observed" && profile.disciplineScore !== null
      ? { key: "discipline" as const, value: profile.disciplineScore }
      : null,
    profile.learningStyleEvidenceState === "observed" && profile.learningStyle
      ? { key: "learningStyle" as const, value: profile.learningStyle }
      : null,
  ].filter((value): value is NonNullable<typeof value> => Boolean(value));
}
