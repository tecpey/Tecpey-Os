// Durable risk enforcement boundary.
//
// PostgreSQL owns effective level, generation and expiry. Redis is populated
// from a durable outbox by the authority layer and is never sufficient to
// allow or deny a financial mutation by itself.

import {
  clearRiskEnforcement,
  publishRiskEnforcementOutbox,
  resolveRiskEnforcement,
} from "@/lib/security/risk-enforcement-authority";
import type {
  EffectiveRiskLevel,
  RiskLevel,
} from "@/lib/security/risk-enforcement-evidence";

export type { RiskLevel };

async function getEffectiveLevel(
  principalId: string,
): Promise<EffectiveRiskLevel | "unavailable"> {
  const resolved = await resolveRiskEnforcement(principalId);
  return resolved.available ? resolved.level : "unavailable";
}

/**
 * Check whether the principal may place an order.
 *
 * `risk_authority_unavailable` is deliberately distinct from an account block
 * so callers can return a truthful retryable 503 instead of silently allowing.
 */
export async function enforceTradeAllowed(
  principalId: string,
): Promise<string | null> {
  const level = await getEffectiveLevel(principalId);
  if (level === "unavailable") return "risk_authority_unavailable";
  if (level === "trade_blocked" || level === "all_blocked") {
    return "account_trade_restricted";
  }
  return null;
}

/** Check whether the principal may request a withdrawal. */
export async function enforceWithdrawAllowed(
  principalId: string,
): Promise<string | null> {
  const level = await getEffectiveLevel(principalId);
  if (level === "unavailable") return "risk_authority_unavailable";
  if (level === "withdraw_blocked" || level === "all_blocked") {
    return "account_withdraw_restricted";
  }
  return null;
}

/** Explicit governed clear for future Admin/manual-review callers. */
export async function clearRiskLevel(principalId: string): Promise<boolean> {
  const result = await clearRiskEnforcement(principalId);
  return result.available;
}

/** Repair the Redis projection from durable outbox debt. */
export async function repairRiskLevelProjection(
  principalId?: string,
): Promise<boolean> {
  return publishRiskEnforcementOutbox(principalId);
}
