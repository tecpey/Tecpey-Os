// Withdrawal security gate — Phase 36.
//
// Multi-layer gate for withdrawal requests:
//   1. Risk level enforcement (from risk-enforcement.ts)
//   2. Velocity limit (configurable per asset, stored in Redis)
//   3. 2FA re-verification requirement for large withdrawals
//   4. Device trust check
//
// This is infrastructure — it is wired into withdrawal routes when they exist (Phase 37+).
// None of the checks block non-withdrawal flows.

import { logger } from "@/lib/logger";
import { getRiskLevel } from "./risk-enforcement";
import { withDb } from "@/lib/db";

// ── Velocity limits ───────────────────────────────────────────────────────────

const VELOCITY_PREFIX = "tecpey:withdraw:velocity:";
const VELOCITY_WINDOW_S = 24 * 60 * 60; // 24-hour rolling window

// Default daily USD limits. Phase 37+: configurable per user level.
const DEFAULT_DAILY_LIMIT_USD = 10_000;

function redis() {
  return globalThis.tecpeyRedisClient ?? null;
}

/**
 * Check and update the user's 24-hour withdrawal volume.
 * Returns { allowed: true } or { allowed: false, reason, remaining }.
 */
export async function checkWithdrawVelocity(
  userId: string,
  amountUsd: number,
  limitUsd = DEFAULT_DAILY_LIMIT_USD,
): Promise<{ allowed: boolean; remaining: number; reason?: string }> {
  const r = redis();
  if (!r) {
    // Redis unavailable — allow but log
    logger.warn("[withdraw-gate] Redis unavailable — velocity check skipped");
    return { allowed: true, remaining: limitUsd };
  }

  const key = `${VELOCITY_PREFIX}${userId}`;
  try {
    const pipeline = r.pipeline();
    pipeline.get(key);
    const results = await pipeline.exec();
    const currentStr = results?.[0]?.[1];
    const current = typeof currentStr === "string" ? parseFloat(currentStr) : 0;
    const remaining = Math.max(0, limitUsd - current);

    if (current + amountUsd > limitUsd) {
      return { allowed: false, remaining, reason: "daily_limit_exceeded" };
    }

    // Increment by amountUsd with INCRBYFLOAT and set TTL if new key
    await r.incrbyfloat(key, amountUsd);
    const ttl = await r.ttl(key);
    if (ttl < 0) await r.expire(key, VELOCITY_WINDOW_S);

    return { allowed: true, remaining: Math.max(0, remaining - amountUsd) };
  } catch (err) {
    logger.warn("[withdraw-gate] velocity check failed", { userId, err: String(err) });
    return { allowed: true, remaining: limitUsd }; // graceful degrade
  }
}

/** Get current 24h withdrawal volume for a user. */
export async function getWithdrawVolume(userId: string): Promise<number> {
  const r = redis();
  if (!r) return 0;
  try {
    const val = await r.get(`${VELOCITY_PREFIX}${userId}`);
    return val ? parseFloat(val) : 0;
  } catch {
    return 0;
  }
}

// ── 2FA requirement ───────────────────────────────────────────────────────────

const REQUIRE_2FA_ABOVE_USD = 100; // require 2FA for withdrawals above this

export function requires2faForWithdrawal(amountUsd: number): boolean {
  return amountUsd >= REQUIRE_2FA_ABOVE_USD;
}

// ── Device trust ──────────────────────────────────────────────────────────────

export async function isDeviceTrusted(
  userId: string,
  fingerprint: string,
): Promise<boolean> {
  const r = await withDb(async (db) => {
    const result = await db.query(
      `SELECT id FROM known_devices WHERE user_id = $1 AND fingerprint = $2`,
      [userId, fingerprint],
    );
    return (result.rowCount ?? 0) > 0;
  });
  return r.enabled ? r.value : false;
}

// ── Compound gate ─────────────────────────────────────────────────────────────

export type WithdrawGateResult =
  | { allowed: true; requires2fa: boolean; remaining: number }
  | { allowed: false; reason: string; requires2fa?: boolean };

/**
 * Run all withdrawal security checks.
 *
 * @param userId - the user requesting the withdrawal
 * @param amountUsd - estimated USD value of the withdrawal
 * @param fingerprint - device fingerprint (from `deviceFingerprint()`)
 * @param has2faVerified - true if the user already completed 2FA this request
 */
export async function runWithdrawGate(opts: {
  userId: string;
  amountUsd: number;
  fingerprint: string;
  has2faVerified: boolean;
  limitUsd?: number;
}): Promise<WithdrawGateResult> {
  const { userId, amountUsd, fingerprint, has2faVerified, limitUsd } = opts;

  // 1. Risk level check
  const riskLevel = await getRiskLevel(userId);
  if (riskLevel === "withdraw_blocked" || riskLevel === "all_blocked") {
    return { allowed: false, reason: "account_withdraw_restricted" };
  }

  // 2. Velocity check
  const velocityResult = await checkWithdrawVelocity(userId, amountUsd, limitUsd);
  if (!velocityResult.allowed) {
    return { allowed: false, reason: velocityResult.reason ?? "velocity_limit_exceeded" };
  }

  // 3. 2FA requirement
  const needsVerification = requires2faForWithdrawal(amountUsd);
  if (needsVerification && !has2faVerified) {
    return { allowed: false, reason: "2fa_required", requires2fa: true };
  }

  // 4. Device trust check — large withdrawals from unknown devices are blocked
  const UNTRUSTED_DEVICE_LIMIT_USD = 1000;
  if (amountUsd >= UNTRUSTED_DEVICE_LIMIT_USD && fingerprint) {
    const trusted = await isDeviceTrusted(userId, fingerprint);
    if (!trusted) {
      return { allowed: false, reason: "untrusted_device", requires2fa: true };
    }
  }

  return {
    allowed: true,
    requires2fa: needsVerification,
    remaining: velocityResult.remaining,
  };
}
