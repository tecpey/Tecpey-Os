// Legacy withdrawal gate retained only for compatibility with non-route callers.
// The canonical route uses withdrawal-admission-service and PostgreSQL velocity.
// Every unavailable authority in this compatibility layer fails closed.

import { logger } from "@/lib/logger";
import { withDb } from "@/lib/db";
import { getStrictWithdrawalRiskLevel } from "./withdrawal-admission-authority";

const VELOCITY_PREFIX = "tecpey:withdraw:velocity:";
const VELOCITY_WINDOW_S = 24 * 60 * 60;
const DEFAULT_DAILY_LIMIT_USD = 10_000;

function redis() {
  return globalThis.tecpeyRedisClient ?? null;
}

export async function checkWithdrawVelocity(
  userId: string,
  amountUsd: number,
  limitUsd = DEFAULT_DAILY_LIMIT_USD,
): Promise<{ allowed: boolean; remaining: number; reason?: string }> {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return { allowed: false, remaining: 0, reason: "invalid_amount_usd" };
  }

  const client = redis();
  if (!client) {
    logger.warn("[withdraw-gate] Redis unavailable — blocking velocity decision", {
      userId,
    });
    return {
      allowed: false,
      remaining: 0,
      reason: "velocity_authority_unavailable",
    };
  }

  const key = `${VELOCITY_PREFIX}${userId}`;
  try {
    const currentRaw = await client.get(key);
    const current = currentRaw ? Number(currentRaw) : 0;
    if (!Number.isFinite(current) || current < 0) {
      return {
        allowed: false,
        remaining: 0,
        reason: "velocity_evidence_invalid",
      };
    }
    const remaining = Math.max(0, limitUsd - current);
    if (current + amountUsd > limitUsd) {
      return { allowed: false, remaining, reason: "daily_limit_exceeded" };
    }

    const transaction = client.multi();
    transaction.incrbyfloat(key, amountUsd);
    transaction.expire(key, VELOCITY_WINDOW_S, "NX");
    const result = await transaction.exec();
    if (!Array.isArray(result) || result.some((entry) => entry?.[0])) {
      return {
        allowed: false,
        remaining: 0,
        reason: "velocity_authority_unavailable",
      };
    }

    return { allowed: true, remaining: Math.max(0, remaining - amountUsd) };
  } catch (error) {
    logger.warn("[withdraw-gate] velocity check failed — blocking", {
      userId,
      error: String(error),
    });
    return {
      allowed: false,
      remaining: 0,
      reason: "velocity_authority_unavailable",
    };
  }
}

export async function getWithdrawVolume(userId: string): Promise<number | null> {
  const client = redis();
  if (!client) return null;
  try {
    const value = await client.get(`${VELOCITY_PREFIX}${userId}`);
    if (value === null) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function requires2faForWithdrawal(_amountUsd: number): boolean {
  return true;
}

export async function isDeviceTrusted(
  userId: string,
  fingerprint: string,
): Promise<boolean> {
  const result = await withDb(async (db) => {
    const rows = await db.query(
      `SELECT id FROM known_devices WHERE user_id = $1 AND fingerprint = $2`,
      [userId, fingerprint],
    );
    return (rows.rowCount ?? 0) > 0;
  });
  return result.enabled ? result.value : false;
}

export type WithdrawGateResult =
  | { allowed: true; requires2fa: true; remaining: number }
  | { allowed: false; reason: string; requires2fa?: true };

/**
 * @deprecated The canonical route requires a one-time request-bound PostgreSQL
 * authorization. This compatibility gate is fail-closed and must not be used
 * to interpret browser booleans as 2FA evidence.
 */
export async function runWithdrawGate(opts: {
  userId: string;
  amountUsd: number;
  fingerprint: string;
  has2faVerified: boolean;
  limitUsd?: number;
}): Promise<WithdrawGateResult> {
  const risk = await getStrictWithdrawalRiskLevel(opts.userId);
  if (!risk.ok) return { allowed: false, reason: risk.reason };
  if (risk.level === "withdraw_blocked" || risk.level === "all_blocked") {
    return { allowed: false, reason: "account_withdraw_restricted" };
  }

  const velocity = await checkWithdrawVelocity(
    opts.userId,
    opts.amountUsd,
    opts.limitUsd,
  );
  if (!velocity.allowed) {
    return {
      allowed: false,
      reason: velocity.reason ?? "velocity_authority_unavailable",
    };
  }

  // Browser-provided verification booleans are never accepted as authority.
  void opts.fingerprint;
  void opts.has2faVerified;
  return {
    allowed: false,
    reason: "withdrawal_authorization_required",
    requires2fa: true,
  };
}
