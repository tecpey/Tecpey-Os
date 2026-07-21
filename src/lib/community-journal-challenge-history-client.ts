export type OfficialJournalChallengeFinalizedResultClient = {
  challengeId: "journal-reflection-week";
  challengeVersion: "journal-reflection-v1";
  cycle: { key: string; startsAt: string; endsAt: string };
  status: "completed" | "not_completed";
  finalizedAt: string;
  progress: {
    eligibleClosedTrades: number;
    validReflections: number;
    coverageRate: number;
    minimumTrades: 3;
    requiredRate: 0.8;
    eligibleToComplete: boolean;
  };
  rewards: {
    xp: 0;
    badge: null;
    financialReward: null;
    status: "disabled";
  };
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function parseResult(value: unknown): OfficialJournalChallengeFinalizedResultClient | null {
  const raw = record(value);
  const cycle = record(raw?.cycle);
  const progress = record(raw?.progress);
  const rewards = record(raw?.rewards);
  if (!raw || !cycle || !progress || !rewards) return null;
  if (
    raw.challengeId !== "journal-reflection-week" ||
    raw.challengeVersion !== "journal-reflection-v1" ||
    (raw.status !== "completed" && raw.status !== "not_completed") ||
    typeof cycle.key !== "string" || !/^[0-9]{4}-W[0-9]{2}$/.test(cycle.key) ||
    !validDate(cycle.startsAt) || !validDate(cycle.endsAt) ||
    new Date(cycle.endsAt).getTime() <= new Date(cycle.startsAt).getTime() ||
    !validDate(raw.finalizedAt) ||
    new Date(raw.finalizedAt).getTime() < new Date(cycle.endsAt).getTime() ||
    !Number.isSafeInteger(progress.eligibleClosedTrades) || Number(progress.eligibleClosedTrades) < 0 ||
    !Number.isSafeInteger(progress.validReflections) || Number(progress.validReflections) < 0 ||
    Number(progress.validReflections) > Number(progress.eligibleClosedTrades) ||
    typeof progress.coverageRate !== "number" || !Number.isFinite(progress.coverageRate) ||
    progress.coverageRate < 0 || progress.coverageRate > 1 ||
    progress.minimumTrades !== 3 || progress.requiredRate !== 0.8 ||
    typeof progress.eligibleToComplete !== "boolean" ||
    rewards.xp !== 0 || rewards.badge !== null || rewards.financialReward !== null ||
    rewards.status !== "disabled"
  ) return null;

  const eligibleClosedTrades = Number(progress.eligibleClosedTrades);
  const validReflections = Number(progress.validReflections);
  const expectedRate = eligibleClosedTrades === 0
    ? 0
    : Number((validReflections / eligibleClosedTrades).toFixed(6));
  const expectedEligible = eligibleClosedTrades >= 3 && validReflections * 5 >= eligibleClosedTrades * 4;
  if (Math.abs(Number(progress.coverageRate) - expectedRate) > 0.000001) return null;
  if (progress.eligibleToComplete !== expectedEligible) return null;
  if (raw.status === "completed" && !expectedEligible) return null;
  if (raw.status === "not_completed" && expectedEligible) return null;

  return {
    challengeId: "journal-reflection-week",
    challengeVersion: "journal-reflection-v1",
    cycle: { key: cycle.key, startsAt: cycle.startsAt, endsAt: cycle.endsAt },
    status: raw.status,
    finalizedAt: raw.finalizedAt,
    progress: {
      eligibleClosedTrades,
      validReflections,
      coverageRate: Number(progress.coverageRate),
      minimumTrades: 3,
      requiredRate: 0.8,
      eligibleToComplete: expectedEligible,
    },
    rewards: { xp: 0, badge: null, financialReward: null, status: "disabled" },
  };
}

export function parseOfficialJournalChallengeHistoryPayload(
  value: unknown,
): OfficialJournalChallengeFinalizedResultClient | null | undefined {
  const raw = record(value);
  if (!raw || raw.ok !== true || !("latestFinalized" in raw)) return undefined;
  if (raw.latestFinalized === null) return null;
  return parseResult(raw.latestFinalized) ?? undefined;
}
