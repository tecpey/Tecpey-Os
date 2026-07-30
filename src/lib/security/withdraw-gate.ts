// Legacy withdrawal gate retained only for compatibility with non-route callers.
// The canonical route uses withdrawal-admission-service and PostgreSQL velocity.
// Every unavailable authority in this compatibility layer fails closed.

import { logger } from "@/lib/logger";
import { withDb } from "@/lib/db";
import { getStrictWithdrawalRiskLevel } from "./withdrawal-admission-authority";

const VELOCITY_PREFIX = "tecpey:withdraw:velocity:";
const VELOCITY_WINDOW_S = 24 * 60 * 60;
const DEFAULT_DAILY_LIMIT_USD = 10_000;

// Atomic velocity decision (docs/audit/FINDINGS.md F-009): read, limit check
// and increment execute as one Lua script so concurrent withdrawal requests
// cannot both pass the check and push the counter past the daily limit
// (time-of-check to time-of-use race). TTL is attached on creation only (NX).
const VELOCITY_CHECK_LUA = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
if current == nil or current < 0 then
  return {-2, 0}
end
local limit = tonumber(ARGV[1])
local amount = tonumber(ARGV[2])
if current + amount > limit then
  return {0, limit - current}
end
redis.call("INCRBYFLOAT", KEYS[1], amount)
redis.call("EXPIRE", KEYS[1], tonumber(ARGV[3]), "NX")
return {1, limit - current - amount}
`;

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
    const result = (await client.eval(
      VELOCITY_CHECK_LUA,
      1,
      key,
      String(limitUsd),
      String(amountUsd),
      String(VELOCITY_WINDOW_S),
    )) as [number, number] | null;

    if (!Array.isArray(result)) {
      return {
        allowed: false,
        remaining: 0,
        reason: "velocity_authority_unavailable",
      };
    }

    const [verdict, remainingRaw] = result;
    const remaining = Math.max(0, Number(remainingRaw) || 0);

    if (verdict === -2) {
      return {
        allowed: false,
        remaining: 0,
        reason: "velocity_evidence_invalid",
      };
    }
    if (verdict === 0) {
      return { allowed: false, remaining, reason: "daily_limit_exceeded" };
    }

    return { allowed: true, remaining };
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
