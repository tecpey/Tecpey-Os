// Risk enforcement — Phase 35.
//
// Phase 34 risk engine emits risk events only (fire-and-forget, never blocks).
// Phase 35 adds enforcement: the risk engine can SET a block level on a user,
// and the enforcement layer READS that level synchronously in the request path.
//
// Block levels (stored in Redis as tecpey:risk:level:{userId}):
//   "trade_blocked"    — order placement denied; other actions allowed
//   "withdraw_blocked" — withdrawal denied; trading allowed
//   "all_blocked"      — all authenticated actions denied (except read)
//   "review"           — flagged for manual review; warning returned; actions allowed
//
// Enforcement is synchronous but Redis-only (no DB hit on every request).
// Graceful degradation: Redis unavailable → allow (risk engine is advisory).
//
// The risk ENGINE writes these levels (from risk-engine.ts emit() on high severity).
// The ENFORCEMENT layer reads them (called from order/withdrawal routes).

import { logger } from "@/lib/logger";

export type RiskLevel = "trade_blocked" | "withdraw_blocked" | "all_blocked" | "review" | null;

const RISK_LEVEL_PREFIX = "tecpey:risk:level:";
const RISK_LEVEL_TTL_S = 24 * 60 * 60; // 24-hour auto-release (manual review)

function redis() {
  return globalThis.tecpeyRedisClient ?? null;
}

// ── Write (called by risk engine) ─────────────────────────────────────────────

/** Set a risk enforcement level for a user. Called by risk-engine on high severity events. */
export async function setRiskLevel(
  userId: string,
  level: Exclude<RiskLevel, null>,
  ttlSeconds = RISK_LEVEL_TTL_S,
): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(`${RISK_LEVEL_PREFIX}${userId}`, level, "EX", ttlSeconds);
    logger.warn("[risk-enforcement] level set", { userId, level, ttlSeconds });
  } catch (err) {
    logger.warn("[risk-enforcement] setRiskLevel failed", { userId, err: String(err) });
  }
}

/** Clear a risk level (admin override or auto-release). */
export async function clearRiskLevel(userId: string): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.del(`${RISK_LEVEL_PREFIX}${userId}`);
  } catch {
    // non-critical
  }
}

// ── Read (called by route handlers) ──────────────────────────────────────────

/** Get current risk level for a user. Returns null if none set or Redis unavailable. */
export async function getRiskLevel(userId: string): Promise<RiskLevel> {
  const r = redis();
  if (!r) return null;
  try {
    const val = await r.get(`${RISK_LEVEL_PREFIX}${userId}`);
    if (
      val === "trade_blocked" ||
      val === "withdraw_blocked" ||
      val === "all_blocked" ||
      val === "review"
    ) {
      return val;
    }
    return null;
  } catch {
    return null; // graceful degrade
  }
}

// ── Enforcement helpers ───────────────────────────────────────────────────────

/** Check if user is allowed to place orders. Returns error code or null if allowed. */
export async function enforceTradeAllowed(userId: string): Promise<string | null> {
  const level = await getRiskLevel(userId);
  if (level === "trade_blocked" || level === "all_blocked") return "account_trade_restricted";
  return null;
}

/** Check if user is allowed to withdraw. Returns error code or null if allowed. */
export async function enforceWithdrawAllowed(userId: string): Promise<string | null> {
  const level = await getRiskLevel(userId);
  if (level === "withdraw_blocked" || level === "all_blocked") return "account_withdraw_restricted";
  return null;
}
