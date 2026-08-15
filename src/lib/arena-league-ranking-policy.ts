import { ARENA_MONTHLY_POINTS_CAP, resolveArenaLeagueTier, type ArenaLeagueTier } from "./arena-league-scoring-policy";

export type ArenaRankingCandidate = {
  studentId: string;
  rawPoints: number;
  tradeCount: number;
  ruleComplianceBps: number;
  lifetimePoints: number;
  finalizedMonths: number;
};

export type ArenaRankedCandidate = ArenaRankingCandidate & {
  points: number;
  rank: number;
  tier: ArenaLeagueTier;
};

export function rankArenaLeagueCandidates(
  candidates: readonly ArenaRankingCandidate[],
  windowType: "monthly" | "yearly" | "lifetime",
): ArenaRankedCandidate[] {
  const seen = new Set<string>();
  const ranked = candidates.map((candidate) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.studentId) || seen.has(candidate.studentId)) {
      throw new Error("arena_ranking_student_identity_invalid");
    }
    seen.add(candidate.studentId);
    for (const [name, value, minimum, maximum] of [
      ["raw_points", candidate.rawPoints, -1_000_000_000, 1_000_000_000],
      ["trade_count", candidate.tradeCount, 1, 1_000_000_000],
      ["rule_compliance_bps", candidate.ruleComplianceBps, 0, 10_000],
      ["lifetime_points", candidate.lifetimePoints, -1_000_000_000, 1_000_000_000],
      ["finalized_months", candidate.finalizedMonths, 0, 10_000],
    ] as const) {
      if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new Error(`arena_ranking_${name}_invalid`);
      }
    }
    return {
      ...candidate,
      points: windowType === "monthly"
        ? Math.max(-ARENA_MONTHLY_POINTS_CAP, Math.min(ARENA_MONTHLY_POINTS_CAP, candidate.rawPoints))
        : candidate.rawPoints,
      tier: resolveArenaLeagueTier(candidate).tier,
    };
  });
  ranked.sort((a, b) =>
    b.points - a.points ||
    b.ruleComplianceBps - a.ruleComplianceBps ||
    a.tradeCount - b.tradeCount ||
    a.studentId.localeCompare(b.studentId),
  );
  return ranked.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
