export type NotificationQualityFacts = {
  relevance: number;
  freshness: number;
  fatigue: number;
  authoritative: boolean;
};

export type NotificationQualityDecision =
  | { decision: "eligible"; reason: "quality_eligible"; score: number }
  | {
      decision: "digest";
      reason: "low_relevance" | "fatigue_budget";
      score: number;
    }
  | {
      decision: "suppress";
      reason: "stale" | "authority_missing" | "invalid_quality_facts";
      score: number;
    };

function bounded(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Deterministic interruption-quality gate for optional notifications.
 *
 * This function is deliberately independent from engagement/AI output. Callers
 * must derive these facts from server-owned evidence. Mandatory security,
 * financial and legal notifications must continue through the hard policy
 * authority and must never be suppressed by this optional-quality layer.
 */
export function evaluateNotificationQuality(
  facts: NotificationQualityFacts,
): NotificationQualityDecision {
  if (
    !bounded(facts.relevance) ||
    !bounded(facts.freshness) ||
    !bounded(facts.fatigue) ||
    typeof facts.authoritative !== "boolean"
  ) {
    return { decision: "suppress", reason: "invalid_quality_facts", score: 0 };
  }

  if (!facts.authoritative) {
    return { decision: "suppress", reason: "authority_missing", score: 0 };
  }

  if (facts.freshness < 0.2) {
    return { decision: "suppress", reason: "stale", score: 0 };
  }

  const score = Number(
    (facts.relevance * 0.55 + facts.freshness * 0.3 - facts.fatigue * 0.35).toFixed(4),
  );

  if (facts.fatigue >= 0.8) {
    return { decision: "digest", reason: "fatigue_budget", score };
  }

  if (facts.relevance < 0.35 || score < 0.25) {
    return { decision: "digest", reason: "low_relevance", score };
  }

  return { decision: "eligible", reason: "quality_eligible", score };
}
