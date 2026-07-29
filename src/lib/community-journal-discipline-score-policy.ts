export const JOURNAL_DISCIPLINE_SCORE_POLICY_VERSION =
  "journal-discipline-score-v1" as const;
export const JOURNAL_DISCIPLINE_SCORE_SCOPE =
  "journal_discipline_only" as const;
export const JOURNAL_DISCIPLINE_SCORE_LOOKBACK_CYCLES = 12 as const;
export const JOURNAL_DISCIPLINE_SCORE_MINIMUM_CYCLES = 4 as const;
export const JOURNAL_DISCIPLINE_COMPLETION_WEIGHT_BPS = 6_000 as const;
export const JOURNAL_DISCIPLINE_COVERAGE_WEIGHT_BPS = 4_000 as const;

const MAX_BASIS_POINTS = 10_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;
const CYCLE_KEY_RE = /^[0-9]{4}-W[0-9]{2}$/;

export type JournalDisciplineScoreCycleInput = {
  sourceEnrollmentId: string;
  cycleKey: string;
  cycleStartsAt: string;
  cycleEndsAt: string;
  outcome: "completed" | "not_completed";
  completionCriteriaMet: boolean;
  coverageBasisPoints: number;
  sourceDigest: string;
};

export type JournalDisciplineScoreStatus =
  | "insufficient_evidence"
  | "available";

export type JournalDisciplineScoreProjection = {
  policyVersion: typeof JOURNAL_DISCIPLINE_SCORE_POLICY_VERSION;
  scope: typeof JOURNAL_DISCIPLINE_SCORE_SCOPE;
  status: JournalDisciplineScoreStatus;
  lookbackCycles: typeof JOURNAL_DISCIPLINE_SCORE_LOOKBACK_CYCLES;
  minimumCycles: typeof JOURNAL_DISCIPLINE_SCORE_MINIMUM_CYCLES;
  remainingCycles: number;
  evaluatedCycles: number;
  completedCycles: number;
  notCompletedCycles: number;
  completionConsistencyBasisPoints: number;
  meanCoverageBasisPoints: number;
  scoreBasisPoints: number | null;
  windowStartsAt: string | null;
  windowEndsAt: string | null;
  rank: null;
  percentile: null;
  publicLeaderboardEligible: false;
  rewardEligibility: false;
  mentorDecisionEligible: false;
  instructorDecisionEligible: false;
  scholarshipEligibility: false;
};

export type JournalDisciplineScoreEvaluation = {
  projection: JournalDisciplineScoreProjection;
  digestCanonicalInput: string;
};

function exactIso(value: string, code: string): string {
  if (typeof value !== "string") throw new Error(code);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(code);
  }
  return value;
}

function integer(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(code);
  }
  return value;
}

export function journalDisciplineRoundHalfUp(
  numerator: number,
  denominator: number,
): number {
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    numerator < 0 ||
    denominator <= 0
  ) {
    throw new Error("journal_discipline_rounding_input_invalid");
  }
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

function validateCycle(
  cycle: JournalDisciplineScoreCycleInput,
): JournalDisciplineScoreCycleInput {
  if (
    !cycle ||
    typeof cycle !== "object" ||
    !UUID_RE.test(cycle.sourceEnrollmentId) ||
    !CYCLE_KEY_RE.test(cycle.cycleKey) ||
    (cycle.outcome !== "completed" && cycle.outcome !== "not_completed") ||
    typeof cycle.completionCriteriaMet !== "boolean" ||
    cycle.completionCriteriaMet !== (cycle.outcome === "completed") ||
    !SHA256_RE.test(cycle.sourceDigest)
  ) {
    throw new Error("journal_discipline_cycle_invalid");
  }
  const cycleStartsAt = exactIso(
    cycle.cycleStartsAt,
    "journal_discipline_cycle_time_invalid",
  );
  const cycleEndsAt = exactIso(
    cycle.cycleEndsAt,
    "journal_discipline_cycle_time_invalid",
  );
  if (cycleEndsAt <= cycleStartsAt) {
    throw new Error("journal_discipline_cycle_time_invalid");
  }
  const coverageBasisPoints = integer(
    cycle.coverageBasisPoints,
    0,
    MAX_BASIS_POINTS,
    "journal_discipline_cycle_coverage_invalid",
  );
  return {
    sourceEnrollmentId: cycle.sourceEnrollmentId.toLowerCase(),
    cycleKey: cycle.cycleKey,
    cycleStartsAt,
    cycleEndsAt,
    outcome: cycle.outcome,
    completionCriteriaMet: cycle.completionCriteriaMet,
    coverageBasisPoints,
    sourceDigest: cycle.sourceDigest,
  };
}

function assertCanonicalOrder(
  cycles: readonly JournalDisciplineScoreCycleInput[],
): void {
  const cycleKeys = new Set<string>();
  const sourceIds = new Set<string>();
  for (let index = 0; index < cycles.length; index += 1) {
    const cycle = cycles[index];
    if (cycleKeys.has(cycle.cycleKey) || sourceIds.has(cycle.sourceEnrollmentId)) {
      throw new Error("journal_discipline_duplicate_cycle");
    }
    cycleKeys.add(cycle.cycleKey);
    sourceIds.add(cycle.sourceEnrollmentId);
    if (index === 0) continue;
    const previous = cycles[index - 1];
    const previousEnd = Date.parse(previous.cycleEndsAt);
    const currentEnd = Date.parse(cycle.cycleEndsAt);
    if (
      previousEnd < currentEnd ||
      (previousEnd === currentEnd &&
        previous.sourceEnrollmentId.localeCompare(cycle.sourceEnrollmentId) < 0)
    ) {
      throw new Error("journal_discipline_cycle_order_invalid");
    }
  }
}

function digestInput(
  cycles: readonly JournalDisciplineScoreCycleInput[],
): string {
  return [
    JOURNAL_DISCIPLINE_SCORE_POLICY_VERSION,
    JOURNAL_DISCIPLINE_SCORE_SCOPE,
    String(JOURNAL_DISCIPLINE_SCORE_LOOKBACK_CYCLES),
    String(JOURNAL_DISCIPLINE_SCORE_MINIMUM_CYCLES),
    ...cycles.flatMap((cycle) => [
      cycle.cycleKey,
      cycle.cycleStartsAt,
      cycle.cycleEndsAt,
      cycle.outcome,
      String(cycle.coverageBasisPoints),
      cycle.sourceDigest,
    ]),
  ].join("\n");
}

export function evaluateJournalDisciplineScore(
  inputCycles: readonly JournalDisciplineScoreCycleInput[],
): JournalDisciplineScoreEvaluation {
  if (!Array.isArray(inputCycles)) {
    throw new Error("journal_discipline_cycles_invalid");
  }
  if (inputCycles.length > JOURNAL_DISCIPLINE_SCORE_LOOKBACK_CYCLES) {
    throw new Error("journal_discipline_window_exceeded");
  }
  const cycles = inputCycles.map(validateCycle);
  assertCanonicalOrder(cycles);

  const evaluatedCycles = cycles.length;
  const completedCycles = cycles.reduce(
    (total, cycle) => total + (cycle.outcome === "completed" ? 1 : 0),
    0,
  );
  const notCompletedCycles = evaluatedCycles - completedCycles;
  const completionConsistencyBasisPoints = evaluatedCycles === 0
    ? 0
    : journalDisciplineRoundHalfUp(
        completedCycles * MAX_BASIS_POINTS,
        evaluatedCycles,
      );
  const coverageTotal = cycles.reduce(
    (total, cycle) => total + cycle.coverageBasisPoints,
    0,
  );
  const meanCoverageBasisPoints = evaluatedCycles === 0
    ? 0
    : journalDisciplineRoundHalfUp(coverageTotal, evaluatedCycles);
  const status: JournalDisciplineScoreStatus =
    evaluatedCycles >= JOURNAL_DISCIPLINE_SCORE_MINIMUM_CYCLES
      ? "available"
      : "insufficient_evidence";
  const scoreBasisPoints = status === "available"
    ? journalDisciplineRoundHalfUp(
        completionConsistencyBasisPoints *
          JOURNAL_DISCIPLINE_COMPLETION_WEIGHT_BPS +
          meanCoverageBasisPoints *
          JOURNAL_DISCIPLINE_COVERAGE_WEIGHT_BPS,
        MAX_BASIS_POINTS,
      )
    : null;

  return {
    projection: {
      policyVersion: JOURNAL_DISCIPLINE_SCORE_POLICY_VERSION,
      scope: JOURNAL_DISCIPLINE_SCORE_SCOPE,
      status,
      lookbackCycles: JOURNAL_DISCIPLINE_SCORE_LOOKBACK_CYCLES,
      minimumCycles: JOURNAL_DISCIPLINE_SCORE_MINIMUM_CYCLES,
      remainingCycles: Math.max(
        0,
        JOURNAL_DISCIPLINE_SCORE_MINIMUM_CYCLES - evaluatedCycles,
      ),
      evaluatedCycles,
      completedCycles,
      notCompletedCycles,
      completionConsistencyBasisPoints,
      meanCoverageBasisPoints,
      scoreBasisPoints,
      windowStartsAt: evaluatedCycles > 0
        ? cycles[evaluatedCycles - 1].cycleStartsAt
        : null,
      windowEndsAt: evaluatedCycles > 0 ? cycles[0].cycleEndsAt : null,
      rank: null,
      percentile: null,
      publicLeaderboardEligible: false,
      rewardEligibility: false,
      mentorDecisionEligible: false,
      instructorDecisionEligible: false,
      scholarshipEligibility: false,
    },
    digestCanonicalInput: digestInput(cycles),
  };
}
