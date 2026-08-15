export const ARENA_LEAGUE_SCORING_POLICY_VERSION = "arena-league-scoring-v1" as const;

export const ARENA_DAILY_ACTIVITY_LIMITS = {
  fullPointTrades: 3,
  reducedPointTrades: 5,
} as const;

export const ARENA_MONTHLY_POINTS_CAP = 3_000;

export type ArenaLeagueInstrumentKind = "spot" | "perpetual" | "options";
export type ArenaLeagueWindow = "monthly" | "yearly" | "lifetime";
export type ArenaLeagueTier =
  | "rookie"
  | "explorer"
  | "analyst"
  | "strategist"
  | "elite"
  | "master"
  | "legend";

export type ArenaLeagueTradeFlag =
  | "no-stop-loss"
  | "over-risk"
  | "impulse-entry"
  | "revenge-trade"
  | "fomo-entry"
  | "good-discipline"
  | "proper-sizing"
  | "target-hit";

export type ArenaLeagueTradeScoreInput = {
  tradeId: string;
  instrumentKind: ArenaLeagueInstrumentKind;
  tradeNumberForDay: number;
  riskBudgetBps: number;
  ruleComplianceBps: number;
  outcomeRMultipleBps: number;
  hasPreTradePlan: boolean;
  hasStopLoss: boolean;
  journalCompleted: boolean;
  mentorFlags: readonly ArenaLeagueTradeFlag[];
};

export type ArenaLeagueTradeScore = {
  policyVersion: typeof ARENA_LEAGUE_SCORING_POLICY_VERSION;
  tradeId: string;
  participationPoints: number;
  processPoints: number;
  outcomePoints: number;
  penaltyPoints: number;
  positiveMultiplierBps: number;
  penaltyMultiplierBps: number;
  totalPoints: number;
  reasons: string[];
};

export type ArenaLeagueTierState = {
  tier: ArenaLeagueTier;
  minimumLifetimePoints: number;
  minimumFinalizedMonths: number;
  minimumRuleComplianceBps: number;
};

export const ARENA_LEAGUE_TIERS: readonly ArenaLeagueTierState[] = [
  { tier: "rookie", minimumLifetimePoints: 0, minimumFinalizedMonths: 0, minimumRuleComplianceBps: 0 },
  { tier: "explorer", minimumLifetimePoints: 1_000, minimumFinalizedMonths: 1, minimumRuleComplianceBps: 7_000 },
  { tier: "analyst", minimumLifetimePoints: 3_000, minimumFinalizedMonths: 2, minimumRuleComplianceBps: 7_500 },
  { tier: "strategist", minimumLifetimePoints: 7_500, minimumFinalizedMonths: 3, minimumRuleComplianceBps: 8_000 },
  { tier: "elite", minimumLifetimePoints: 15_000, minimumFinalizedMonths: 6, minimumRuleComplianceBps: 8_500 },
  { tier: "master", minimumLifetimePoints: 30_000, minimumFinalizedMonths: 9, minimumRuleComplianceBps: 9_000 },
  { tier: "legend", minimumLifetimePoints: 60_000, minimumFinalizedMonths: 12, minimumRuleComplianceBps: 9_300 },
] as const;

const TRADE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$/;
const NEGATIVE_FLAGS = new Set<ArenaLeagueTradeFlag>([
  "no-stop-loss",
  "over-risk",
  "impulse-entry",
  "revenge-trade",
  "fomo-entry",
]);
const ALL_FLAGS = new Set<ArenaLeagueTradeFlag>([
  ...NEGATIVE_FLAGS,
  "good-discipline",
  "proper-sizing",
  "target-hit",
]);

function exactInteger(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`arena_league_${name}_invalid`);
  }
  return value;
}

function multiply(points: number, multiplierBps: number): number {
  return Math.round((points * multiplierBps) / 10_000);
}

function participationPoints(tradeNumberForDay: number): number {
  if (tradeNumberForDay <= ARENA_DAILY_ACTIVITY_LIMITS.fullPointTrades) return 10;
  if (tradeNumberForDay <= ARENA_DAILY_ACTIVITY_LIMITS.reducedPointTrades) return 5;
  return 0;
}

function instrumentMultipliers(input: ArenaLeagueTradeScoreInput): {
  positiveMultiplierBps: number;
  penaltyMultiplierBps: number;
} {
  if (input.instrumentKind === "spot") {
    return { positiveMultiplierBps: 10_000, penaltyMultiplierBps: 10_000 };
  }
  const safelyPlanned = input.hasPreTradePlan && input.hasStopLoss && input.riskBudgetBps <= 200;
  return {
    positiveMultiplierBps: safelyPlanned
      ? input.instrumentKind === "perpetual" ? 10_500 : 11_000
      : 10_000,
    penaltyMultiplierBps: input.instrumentKind === "perpetual" ? 12_000 : 13_000,
  };
}

export function scoreArenaLeagueTrade(input: ArenaLeagueTradeScoreInput): ArenaLeagueTradeScore {
  if (!TRADE_ID_PATTERN.test(input.tradeId)) throw new Error("arena_league_trade_id_invalid");
  exactInteger(input.tradeNumberForDay, 1, 10_000, "trade_number_for_day");
  exactInteger(input.riskBudgetBps, 0, 10_000, "risk_budget_bps");
  exactInteger(input.ruleComplianceBps, 0, 10_000, "rule_compliance_bps");
  exactInteger(input.outcomeRMultipleBps, -50_000, 50_000, "outcome_r_multiple_bps");
  if (!Array.isArray(input.mentorFlags) ||
    new Set(input.mentorFlags).size !== input.mentorFlags.length ||
    input.mentorFlags.some((flag) => !ALL_FLAGS.has(flag))) {
    throw new Error("arena_league_mentor_flags_invalid");
  }

  const reasons: string[] = [];
  const participation = participationPoints(input.tradeNumberForDay);
  if (participation === 0) reasons.push("daily_activity_points_capped");

  let process = 0;
  if (input.hasPreTradePlan) { process += 12; reasons.push("pre_trade_plan"); }
  if (input.hasStopLoss) { process += 12; reasons.push("stop_loss_defined"); }
  if (input.journalCompleted) { process += 10; reasons.push("journal_completed"); }
  process += Math.round((input.ruleComplianceBps * 15) / 10_000);
  if (input.mentorFlags.includes("proper-sizing")) { process += 15; reasons.push("proper_sizing"); }
  if (input.mentorFlags.includes("good-discipline")) { process += 6; reasons.push("good_discipline"); }
  if (input.mentorFlags.includes("target-hit")) { process += 4; reasons.push("target_hit"); }

  const outcome = Math.max(-15, Math.min(15, Math.round(input.outcomeRMultipleBps / 1_000)));
  if (outcome > 0) reasons.push("bounded_positive_outcome");
  if (outcome < 0) reasons.push("bounded_negative_outcome");

  const flagPenalty: Partial<Record<ArenaLeagueTradeFlag, number>> = {
    "no-stop-loss": 20,
    "over-risk": 25,
    "impulse-entry": 12,
    "revenge-trade": 25,
    "fomo-entry": 15,
  };
  let penalty = 0;
  for (const flag of input.mentorFlags) {
    if (NEGATIVE_FLAGS.has(flag)) {
      penalty += flagPenalty[flag] ?? 0;
      reasons.push(flag.replaceAll("-", "_"));
    }
  }
  if (input.riskBudgetBps > 200) {
    penalty += Math.min(30, Math.ceil((input.riskBudgetBps - 200) / 50));
    reasons.push("risk_budget_above_two_percent");
  }

  const multipliers = instrumentMultipliers(input);
  const positivePoints = multiply(participation + process + Math.max(0, outcome), multipliers.positiveMultiplierBps);
  const negativePoints = multiply(penalty + Math.abs(Math.min(0, outcome)), multipliers.penaltyMultiplierBps);
  const totalPoints = Math.max(-100, Math.min(100, positivePoints - negativePoints));

  return {
    policyVersion: ARENA_LEAGUE_SCORING_POLICY_VERSION,
    tradeId: input.tradeId,
    participationPoints: participation,
    processPoints: process,
    outcomePoints: outcome,
    penaltyPoints: -penalty,
    ...multipliers,
    totalPoints,
    reasons,
  };
}

export function aggregateArenaLeaguePoints(
  scores: readonly Pick<ArenaLeagueTradeScore, "totalPoints">[],
): number {
  const total = scores.reduce((sum, score) => {
    exactInteger(score.totalPoints, -100, 100, "trade_points");
    return sum + score.totalPoints;
  }, 0);
  return Math.max(-ARENA_MONTHLY_POINTS_CAP, Math.min(ARENA_MONTHLY_POINTS_CAP, total));
}

export function resolveArenaLeagueTier(input: {
  lifetimePoints: number;
  finalizedMonths: number;
  ruleComplianceBps: number;
}): ArenaLeagueTierState {
  exactInteger(input.lifetimePoints, -1_000_000_000, 1_000_000_000, "lifetime_points");
  exactInteger(input.finalizedMonths, 0, 10_000, "finalized_months");
  exactInteger(input.ruleComplianceBps, 0, 10_000, "rule_compliance_bps");
  return [...ARENA_LEAGUE_TIERS].reverse().find((tier) =>
    input.lifetimePoints >= tier.minimumLifetimePoints &&
    input.finalizedMonths >= tier.minimumFinalizedMonths &&
    input.ruleComplianceBps >= tier.minimumRuleComplianceBps,
  ) ?? ARENA_LEAGUE_TIERS[0];
}
