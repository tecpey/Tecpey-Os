export const ARENA_INITIAL_BALANCE = "100000.0000000000";
export const ARENA_ATTEMPTS_PER_CYCLE = 3;
export const ARENA_CYCLE_DAYS = 30;

export type ArenaAccountStatus = "active" | "locked" | "completed";
export type ArenaAttemptStatus = "active" | "available" | "failed" | "passed";

export type ArenaAccount = {
  cycleId: string;
  status: ArenaAccountStatus;
  initialBalance: string;
  availableBalance: string;
  attemptsTotal: number;
  attemptsUsed: number;
  attemptsRemaining: number;
  currentAttempt: number;
  revision: number;
  cycleStartedAt: string;
  cycleEndsAt: string;
};

export type ArenaAttempt = {
  id: string;
  cycleId: string;
  attemptNumber: number;
  status: ArenaAttemptStatus;
  startingBalance: string;
  cashBalance: string;
  equity: string;
  startedAt: string | null;
  endedAt: string | null;
};

export type ArenaDecision = {
  id: string;
  studentId: string;
  symbol: string;
  side: "buy" | "sell";
  orderType: "market" | "limit" | "stop";
  size: number;
  risk: number;
  entryReason: string;
  emotion: string;
  plan: string;
  mentorNote: string;
  disciplineScore: number;
  riskFlag: boolean;
  createdAt: string;
};

export type ArenaDecisionSummary = {
  count: number;
  discipline: number;
  avgRisk: number;
  riskFlags: number;
  journalQuality: number;
  decisionReadiness: number;
  realizedWinRate: null;
  mentorSnapshot: {
    strongestSignal: "risk_control" | "needs_structure" | "insufficient_data";
    warning: "repeated_risk_flags" | null;
    nextAction: "write_deeper_journal" | "reduce_risk" | "continue_demo_challenge" | "record_first_decision";
  };
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function summarizeArenaDecisions(decisions: ArenaDecision[]): ArenaDecisionSummary {
  const count = decisions.length;
  if (count === 0) {
    return {
      count: 0,
      discipline: 0,
      avgRisk: 0,
      riskFlags: 0,
      journalQuality: 0,
      decisionReadiness: 0,
      realizedWinRate: null,
      mentorSnapshot: {
        strongestSignal: "insufficient_data",
        warning: null,
        nextAction: "record_first_decision",
      },
    };
  }

  const discipline = clamp(
    decisions.reduce((sum, decision) => sum + decision.disciplineScore, 0) / count,
  );
  const avgRisk = Number(
    (decisions.reduce((sum, decision) => sum + decision.risk, 0) / count).toFixed(2),
  );
  const riskFlags = decisions.filter((decision) => decision.riskFlag).length;
  const journalQuality = clamp(
    (decisions.filter(
      (decision) => decision.entryReason.trim().length > 30 && decision.plan.trim().length > 30,
    ).length / count) * 100,
  );
  const riskPenalty = Math.min(25, (riskFlags / count) * 25);
  const decisionReadiness = clamp(discipline * 0.6 + journalQuality * 0.4 - riskPenalty);

  return {
    count,
    discipline,
    avgRisk,
    riskFlags,
    journalQuality,
    decisionReadiness,
    realizedWinRate: null,
    mentorSnapshot: {
      strongestSignal: discipline >= 75 ? "risk_control" : "needs_structure",
      warning: riskFlags >= 3 ? "repeated_risk_flags" : null,
      nextAction:
        avgRisk > 3
          ? "reduce_risk"
          : journalQuality < 70
            ? "write_deeper_journal"
            : "continue_demo_challenge",
    },
  };
}

export function formatArenaBalance(value: string | number): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(parsed);
}
