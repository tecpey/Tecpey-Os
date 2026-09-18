export type MentorEvidenceState = "unknown" | "provisional" | "observed";

export type MentorEvidenceCounts = Readonly<{
  termProgressCount: number;
  tradingSampleCount: number;
  challengeSampleCount: number;
}>;

export type MentorProfileEvidence = Readonly<{
  level: MentorEvidenceState;
  risk: MentorEvidenceState;
  confidence: MentorEvidenceState;
  discipline: MentorEvidenceState;
  learningStyle: MentorEvidenceState;
}>;

type RawMentorProfile = Readonly<{
  level: "beginner" | "intermediate" | "advanced";
  riskProfile: "low" | "medium" | "high";
  primaryGoal: string;
  weakAreas: string[];
  strongAreas: string[];
  confidenceScore: number;
  disciplineScore: number;
  learningStyle: string;
}>;

export type EvidenceAwareMentorProfile = Readonly<{
  level: RawMentorProfile["level"] | null;
  levelEvidenceState: MentorEvidenceState;
  riskProfile: RawMentorProfile["riskProfile"] | null;
  riskEvidenceState: MentorEvidenceState;
  primaryGoal: string;
  weakAreas: string[];
  strongAreas: string[];
  confidenceScore: number | null;
  confidenceEvidenceState: MentorEvidenceState;
  disciplineScore: number | null;
  disciplineEvidenceState: MentorEvidenceState;
  learningStyle: string | null;
  learningStyleEvidenceState: MentorEvidenceState;
}>;

function boundedCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10_000, Math.trunc(value)));
}

function tier(
  count: number,
  observedAt: number,
): MentorEvidenceState {
  if (count <= 0) return "unknown";
  return count >= observedAt ? "observed" : "provisional";
}

/**
 * Evidence policy deliberately treats absence of observations as unknown rather
 * than mapping it onto a "neutral" learner or trader. Thresholds are product
 * confidence gates, not claims of statistical certainty.
 */
export function classifyMentorProfileEvidence(
  raw: MentorEvidenceCounts,
): MentorProfileEvidence {
  const termProgressCount = boundedCount(raw.termProgressCount);
  const tradingSampleCount = boundedCount(raw.tradingSampleCount);
  const challengeSampleCount = boundedCount(raw.challengeSampleCount);

  const level = tier(termProgressCount, 2);
  const risk = tier(tradingSampleCount, 5);
  const discipline =
    tradingSampleCount >= 3 || challengeSampleCount >= 5
      ? "observed"
      : tradingSampleCount > 0 || challengeSampleCount > 0
        ? "provisional"
        : "unknown";
  const learningStyle =
    tradingSampleCount >= 5 || challengeSampleCount >= 10
      ? "observed"
      : tradingSampleCount > 0 || challengeSampleCount > 0
        ? "provisional"
        : "unknown";
  const confidence =
    termProgressCount >= 2 && tradingSampleCount >= 3
      ? "observed"
      : termProgressCount > 0 || tradingSampleCount > 0
        ? "provisional"
        : "unknown";

  return { level, risk, confidence, discipline, learningStyle };
}

function boundedScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * The stored mentor_profiles row is a compact projection and still contains
 * legacy neutral defaults. This presentation/egress projection masks any field
 * whose underlying evidence has not crossed its observed threshold.
 */
export function projectMentorProfileEvidence(input: {
  profile: RawMentorProfile;
  evidence: MentorEvidenceCounts;
}): EvidenceAwareMentorProfile {
  const states = classifyMentorProfileEvidence(input.evidence);
  return {
    level: states.level === "observed" ? input.profile.level : null,
    levelEvidenceState: states.level,
    riskProfile:
      states.risk === "observed" ? input.profile.riskProfile : null,
    riskEvidenceState: states.risk,
    primaryGoal: input.profile.primaryGoal,
    weakAreas: [...input.profile.weakAreas],
    strongAreas: [...input.profile.strongAreas],
    confidenceScore:
      states.confidence === "observed"
        ? boundedScore(input.profile.confidenceScore)
        : null,
    confidenceEvidenceState: states.confidence,
    disciplineScore:
      states.discipline === "observed"
        ? boundedScore(input.profile.disciplineScore)
        : null,
    disciplineEvidenceState: states.discipline,
    learningStyle:
      states.learningStyle === "observed"
        ? input.profile.learningStyle
        : null,
    learningStyleEvidenceState: states.learningStyle,
  };
}
