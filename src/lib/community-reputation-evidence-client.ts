export type CommunityReputationCycleEvidenceClient = {
  evidenceVersion: "community-reputation-evidence-v1";
  sourceType: "official_journal_challenge_finalization";
  challengeId: "journal-reflection-week";
  challengeVersion: "journal-reflection-v1";
  cycle: {
    key: string;
    startsAt: string;
    endsAt: string;
  };
  outcome: "completed" | "not_completed";
  finalizedAt: string;
  eligibleClosedTrades: number;
  validReflections: number;
  coverageBasisPoints: number;
  completionCriteriaMet: boolean;
  finalizationSource: "interactive" | "worker";
  sourceDigest: string;
};

export type CommunityReputationEvidenceSummaryClient = {
  evidenceVersion: "community-reputation-evidence-v1";
  policyStatus: "evidence_only";
  finalizedCycles: number;
  completedCycles: number;
  notCompletedCycles: number;
  eligibleClosedTrades: number;
  validReflections: number;
  aggregateCoverageBasisPoints: number;
  firstFinalizedAt: string | null;
  latestFinalizedAt: string | null;
  latest: CommunityReputationCycleEvidenceClient | null;
  score: null;
  rank: null;
  rewardEligibility: false;
  mentorDecisionEligible: false;
  instructorDecisionEligible: false;
};

export type CommunityReputationEvidenceClientResult =
  | { available: true; summary: CommunityReputationEvidenceSummaryClient }
  | { available: false; summary: null };

const SUMMARY_KEYS = [
  "evidenceVersion",
  "policyStatus",
  "finalizedCycles",
  "completedCycles",
  "notCompletedCycles",
  "eligibleClosedTrades",
  "validReflections",
  "aggregateCoverageBasisPoints",
  "firstFinalizedAt",
  "latestFinalizedAt",
  "latest",
  "score",
  "rank",
  "rewardEligibility",
  "mentorDecisionEligible",
  "instructorDecisionEligible",
] as const;

const CYCLE_KEYS = [
  "evidenceVersion",
  "sourceType",
  "challengeId",
  "challengeVersion",
  "cycle",
  "outcome",
  "finalizedAt",
  "eligibleClosedTrades",
  "validReflections",
  "coverageBasisPoints",
  "completionCriteriaMet",
  "finalizationSource",
  "sourceDigest",
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

function safeCount(value: unknown, maximum = 1_000_000_000): number | null {
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

function coverageBasisPoints(eligible: number, valid: number): number | null {
  if (eligible < 0 || valid < 0 || valid > eligible) return null;
  if (eligible === 0) return 0;
  return Math.floor((valid * 10_000 + Math.floor(eligible / 2)) / eligible);
}

function parseCycleEvidence(
  value: unknown,
): CommunityReputationCycleEvidenceClient | null {
  const raw = record(value);
  const cycle = record(raw?.cycle);
  if (!raw || !cycle || !exactKeys(raw, CYCLE_KEYS) || !exactKeys(cycle, [
    "key",
    "startsAt",
    "endsAt",
  ])) {
    return null;
  }
  const startsAt = exactIso(cycle.startsAt);
  const endsAt = exactIso(cycle.endsAt);
  const finalizedAt = exactIso(raw.finalizedAt);
  const eligibleClosedTrades = safeCount(raw.eligibleClosedTrades, 1_000_000);
  const validReflections = safeCount(raw.validReflections, 1_000_000);
  const coverage = safeCount(raw.coverageBasisPoints, 10_000);
  if (
    raw.evidenceVersion !== "community-reputation-evidence-v1" ||
    raw.sourceType !== "official_journal_challenge_finalization" ||
    raw.challengeId !== "journal-reflection-week" ||
    raw.challengeVersion !== "journal-reflection-v1" ||
    typeof cycle.key !== "string" || !/^[0-9]{4}-W[0-9]{2}$/.test(cycle.key) ||
    !startsAt || !endsAt || !finalizedAt ||
    new Date(endsAt).getTime() <= new Date(startsAt).getTime() ||
    new Date(finalizedAt).getTime() < new Date(startsAt).getTime() ||
    (raw.outcome !== "completed" && raw.outcome !== "not_completed") ||
    eligibleClosedTrades === null || validReflections === null || coverage === null ||
    validReflections > eligibleClosedTrades ||
    typeof raw.completionCriteriaMet !== "boolean" ||
    (raw.finalizationSource !== "interactive" && raw.finalizationSource !== "worker") ||
    typeof raw.sourceDigest !== "string" || !/^[0-9a-f]{64}$/.test(raw.sourceDigest)
  ) {
    return null;
  }
  const expectedCoverage = coverageBasisPoints(eligibleClosedTrades, validReflections);
  const expectedCompletion =
    eligibleClosedTrades >= 3 && validReflections * 5 >= eligibleClosedTrades * 4;
  if (
    coverage !== expectedCoverage ||
    raw.completionCriteriaMet !== expectedCompletion ||
    (raw.outcome === "completed") !== expectedCompletion
  ) {
    return null;
  }
  return {
    evidenceVersion: "community-reputation-evidence-v1",
    sourceType: "official_journal_challenge_finalization",
    challengeId: "journal-reflection-week",
    challengeVersion: "journal-reflection-v1",
    cycle: { key: cycle.key, startsAt, endsAt },
    outcome: raw.outcome,
    finalizedAt,
    eligibleClosedTrades,
    validReflections,
    coverageBasisPoints: coverage,
    completionCriteriaMet: expectedCompletion,
    finalizationSource: raw.finalizationSource,
    sourceDigest: raw.sourceDigest,
  };
}

export function parseCommunityReputationEvidencePayload(
  value: unknown,
): CommunityReputationEvidenceSummaryClient | undefined {
  const root = record(value);
  const raw = record(root?.summary);
  if (!root || !raw || !exactKeys(root, ["ok", "summary"]) || root.ok !== true) {
    return undefined;
  }
  if (!exactKeys(raw, SUMMARY_KEYS)) return undefined;
  const finalizedCycles = safeCount(raw.finalizedCycles);
  const completedCycles = safeCount(raw.completedCycles);
  const notCompletedCycles = safeCount(raw.notCompletedCycles);
  const eligibleClosedTrades = safeCount(raw.eligibleClosedTrades);
  const validReflections = safeCount(raw.validReflections);
  const aggregateCoverage = safeCount(raw.aggregateCoverageBasisPoints, 10_000);
  if (
    raw.evidenceVersion !== "community-reputation-evidence-v1" ||
    raw.policyStatus !== "evidence_only" ||
    finalizedCycles === null || completedCycles === null || notCompletedCycles === null ||
    eligibleClosedTrades === null || validReflections === null || aggregateCoverage === null ||
    completedCycles + notCompletedCycles !== finalizedCycles ||
    validReflections > eligibleClosedTrades ||
    aggregateCoverage !== coverageBasisPoints(eligibleClosedTrades, validReflections) ||
    raw.score !== null || raw.rank !== null ||
    raw.rewardEligibility !== false ||
    raw.mentorDecisionEligible !== false ||
    raw.instructorDecisionEligible !== false
  ) {
    return undefined;
  }

  const firstFinalizedAt = raw.firstFinalizedAt === null
    ? null
    : exactIso(raw.firstFinalizedAt);
  const latestFinalizedAt = raw.latestFinalizedAt === null
    ? null
    : exactIso(raw.latestFinalizedAt);
  if (
    (raw.firstFinalizedAt !== null && !firstFinalizedAt) ||
    (raw.latestFinalizedAt !== null && !latestFinalizedAt)
  ) {
    return undefined;
  }

  if (finalizedCycles === 0) {
    if (
      completedCycles !== 0 || notCompletedCycles !== 0 ||
      eligibleClosedTrades !== 0 || validReflections !== 0 || aggregateCoverage !== 0 ||
      firstFinalizedAt !== null || latestFinalizedAt !== null || raw.latest !== null
    ) {
      return undefined;
    }
    return {
      evidenceVersion: "community-reputation-evidence-v1",
      policyStatus: "evidence_only",
      finalizedCycles: 0,
      completedCycles: 0,
      notCompletedCycles: 0,
      eligibleClosedTrades: 0,
      validReflections: 0,
      aggregateCoverageBasisPoints: 0,
      firstFinalizedAt: null,
      latestFinalizedAt: null,
      latest: null,
      score: null,
      rank: null,
      rewardEligibility: false,
      mentorDecisionEligible: false,
      instructorDecisionEligible: false,
    };
  }

  const latest = parseCycleEvidence(raw.latest);
  if (
    !firstFinalizedAt || !latestFinalizedAt || !latest ||
    new Date(firstFinalizedAt).getTime() > new Date(latestFinalizedAt).getTime() ||
    latest.finalizedAt !== latestFinalizedAt
  ) {
    return undefined;
  }
  return {
    evidenceVersion: "community-reputation-evidence-v1",
    policyStatus: "evidence_only",
    finalizedCycles,
    completedCycles,
    notCompletedCycles,
    eligibleClosedTrades,
    validReflections,
    aggregateCoverageBasisPoints: aggregateCoverage,
    firstFinalizedAt,
    latestFinalizedAt,
    latest,
    score: null,
    rank: null,
    rewardEligibility: false,
    mentorDecisionEligible: false,
    instructorDecisionEligible: false,
  };
}

export async function loadCommunityReputationEvidenceClient(): Promise<
  CommunityReputationEvidenceClientResult
> {
  try {
    const response = await fetch("/api/community/reputation-evidence", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return { available: false, summary: null };
    const payload = parseCommunityReputationEvidencePayload(await response.json());
    return payload
      ? { available: true, summary: payload }
      : { available: false, summary: null };
  } catch {
    return { available: false, summary: null };
  }
}
