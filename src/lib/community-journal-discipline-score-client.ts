import {
  JOURNAL_DISCIPLINE_COMPLETION_WEIGHT_BPS,
  JOURNAL_DISCIPLINE_COVERAGE_WEIGHT_BPS,
  JOURNAL_DISCIPLINE_SCORE_LOOKBACK_CYCLES,
  JOURNAL_DISCIPLINE_SCORE_MINIMUM_CYCLES,
  JOURNAL_DISCIPLINE_SCORE_POLICY_VERSION,
  JOURNAL_DISCIPLINE_SCORE_SCOPE,
  journalDisciplineRoundHalfUp,
  type JournalDisciplineScoreProjection,
} from "@/lib/community-journal-discipline-score-policy";

export type JournalDisciplineScoreClient = JournalDisciplineScoreProjection & {
  evaluatedEvidenceDigest: string;
};

export type JournalDisciplineScoreClientResult =
  | { available: true; score: JournalDisciplineScoreClient }
  | { available: false; score: null };

const SCORE_KEYS = [
  "policyVersion",
  "scope",
  "status",
  "lookbackCycles",
  "minimumCycles",
  "remainingCycles",
  "evaluatedCycles",
  "completedCycles",
  "notCompletedCycles",
  "completionConsistencyBasisPoints",
  "meanCoverageBasisPoints",
  "scoreBasisPoints",
  "windowStartsAt",
  "windowEndsAt",
  "rank",
  "percentile",
  "publicLeaderboardEligible",
  "rewardEligibility",
  "mentorDecisionEligible",
  "instructorDecisionEligible",
  "scholarshipEligibility",
  "evaluatedEvidenceDigest",
] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index]);
}

function count(value: unknown, maximum: number): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum
    ? Number(value)
    : null;
}

function exactIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
    ? value
    : null;
}

export function parseJournalDisciplineScorePayload(
  value: unknown,
): JournalDisciplineScoreClient | undefined {
  const root = record(value);
  const raw = record(root?.score);
  if (
    !root ||
    !raw ||
    !exactKeys(root, ["ok", "score"]) ||
    root.ok !== true ||
    !exactKeys(raw, SCORE_KEYS)
  ) {
    return undefined;
  }

  const evaluatedCycles = count(
    raw.evaluatedCycles,
    JOURNAL_DISCIPLINE_SCORE_LOOKBACK_CYCLES,
  );
  const completedCycles = count(
    raw.completedCycles,
    JOURNAL_DISCIPLINE_SCORE_LOOKBACK_CYCLES,
  );
  const notCompletedCycles = count(
    raw.notCompletedCycles,
    JOURNAL_DISCIPLINE_SCORE_LOOKBACK_CYCLES,
  );
  const remainingCycles = count(
    raw.remainingCycles,
    JOURNAL_DISCIPLINE_SCORE_MINIMUM_CYCLES,
  );
  const completionConsistencyBasisPoints = count(
    raw.completionConsistencyBasisPoints,
    10_000,
  );
  const meanCoverageBasisPoints = count(raw.meanCoverageBasisPoints, 10_000);

  if (
    raw.policyVersion !== JOURNAL_DISCIPLINE_SCORE_POLICY_VERSION ||
    raw.scope !== JOURNAL_DISCIPLINE_SCORE_SCOPE ||
    (raw.status !== "insufficient_evidence" && raw.status !== "available") ||
    raw.lookbackCycles !== JOURNAL_DISCIPLINE_SCORE_LOOKBACK_CYCLES ||
    raw.minimumCycles !== JOURNAL_DISCIPLINE_SCORE_MINIMUM_CYCLES ||
    evaluatedCycles === null ||
    completedCycles === null ||
    notCompletedCycles === null ||
    remainingCycles === null ||
    completionConsistencyBasisPoints === null ||
    meanCoverageBasisPoints === null ||
    completedCycles + notCompletedCycles !== evaluatedCycles ||
    remainingCycles !== Math.max(
      0,
      JOURNAL_DISCIPLINE_SCORE_MINIMUM_CYCLES - evaluatedCycles,
    ) ||
    raw.rank !== null ||
    raw.percentile !== null ||
    raw.publicLeaderboardEligible !== false ||
    raw.rewardEligibility !== false ||
    raw.mentorDecisionEligible !== false ||
    raw.instructorDecisionEligible !== false ||
    raw.scholarshipEligibility !== false ||
    typeof raw.evaluatedEvidenceDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(raw.evaluatedEvidenceDigest)
  ) {
    return undefined;
  }

  const expectedCompletion = evaluatedCycles === 0
    ? 0
    : journalDisciplineRoundHalfUp(
        completedCycles * 10_000,
        evaluatedCycles,
      );
  if (completionConsistencyBasisPoints !== expectedCompletion) {
    return undefined;
  }

  const expectedStatus =
    evaluatedCycles >= JOURNAL_DISCIPLINE_SCORE_MINIMUM_CYCLES
      ? "available"
      : "insufficient_evidence";
  if (raw.status !== expectedStatus) return undefined;

  const expectedScore = expectedStatus === "available"
    ? journalDisciplineRoundHalfUp(
        completionConsistencyBasisPoints *
          JOURNAL_DISCIPLINE_COMPLETION_WEIGHT_BPS +
          meanCoverageBasisPoints *
          JOURNAL_DISCIPLINE_COVERAGE_WEIGHT_BPS,
        10_000,
      )
    : null;
  if (raw.scoreBasisPoints !== expectedScore) return undefined;

  const windowStartsAt = raw.windowStartsAt === null
    ? null
    : exactIso(raw.windowStartsAt);
  const windowEndsAt = raw.windowEndsAt === null
    ? null
    : exactIso(raw.windowEndsAt);
  if (
    (raw.windowStartsAt !== null && !windowStartsAt) ||
    (raw.windowEndsAt !== null && !windowEndsAt) ||
    (evaluatedCycles === 0 &&
      (windowStartsAt !== null || windowEndsAt !== null)) ||
    (evaluatedCycles > 0 &&
      (!windowStartsAt || !windowEndsAt || windowEndsAt <= windowStartsAt))
  ) {
    return undefined;
  }

  return {
    policyVersion: JOURNAL_DISCIPLINE_SCORE_POLICY_VERSION,
    scope: JOURNAL_DISCIPLINE_SCORE_SCOPE,
    status: expectedStatus,
    lookbackCycles: JOURNAL_DISCIPLINE_SCORE_LOOKBACK_CYCLES,
    minimumCycles: JOURNAL_DISCIPLINE_SCORE_MINIMUM_CYCLES,
    remainingCycles,
    evaluatedCycles,
    completedCycles,
    notCompletedCycles,
    completionConsistencyBasisPoints,
    meanCoverageBasisPoints,
    scoreBasisPoints: expectedScore,
    windowStartsAt,
    windowEndsAt,
    rank: null,
    percentile: null,
    publicLeaderboardEligible: false,
    rewardEligibility: false,
    mentorDecisionEligible: false,
    instructorDecisionEligible: false,
    scholarshipEligibility: false,
    evaluatedEvidenceDigest: raw.evaluatedEvidenceDigest,
  };
}

export async function loadJournalDisciplineScoreClient(): Promise<
  JournalDisciplineScoreClientResult
> {
  try {
    const response = await fetch("/api/community/journal-discipline-score", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return { available: false, score: null };
    const score = parseJournalDisciplineScorePayload(await response.json());
    return score
      ? { available: true, score }
      : { available: false, score: null };
  } catch {
    return { available: false, score: null };
  }
}
