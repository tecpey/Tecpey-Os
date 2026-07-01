// Auth observability metrics — Phase 36.
// Redis INCR counters for all auth events.
// Gracefully degrade when Redis is unavailable.

import { logger } from "@/lib/logger";

const PREFIX = "tecpey:metrics:auth:";

export type AuthMetricKey =
  | "login_success"
  | "login_failed"
  | "login_2fa_required"
  | "2fa_success"
  | "2fa_failed"
  | "2fa_backup_used"
  | "webauthn_success"
  | "webauthn_failed"
  | "webauthn_registered"
  | "session_revoked"
  | "session_revoked_all"
  | "refresh_rotated"
  | "refresh_reuse_detected"
  | "risk_blocked"
  | "password_changed"
  | "new_device_detected";

function redis() {
  return globalThis.tecpeyRedisClient ?? null;
}

/** Increment an auth metric counter by 1. Fire-and-forget. */
export function trackAuthEvent(key: AuthMetricKey): void {
  void (async () => {
    const r = redis();
    if (!r) return;
    try {
      await r.incr(`${PREFIX}${key}`);
    } catch (err) {
      logger.debug("[auth-metrics] incr failed", { key, err: String(err) });
    }
  })();
}

/** Read all auth metric counters (for admin endpoint). */
export async function getAuthMetrics(): Promise<Record<string, number>> {
  const r = redis();
  if (!r) return {};
  const keys: AuthMetricKey[] = [
    "login_success", "login_failed", "login_2fa_required",
    "2fa_success", "2fa_failed", "2fa_backup_used",
    "webauthn_success", "webauthn_failed", "webauthn_registered",
    "session_revoked", "session_revoked_all",
    "refresh_rotated", "refresh_reuse_detected",
    "risk_blocked", "password_changed", "new_device_detected",
  ];
  try {
    const pipeline = r.pipeline();
    for (const k of keys) pipeline.get(`${PREFIX}${k}`);
    const results = await pipeline.exec();
    const out: Record<string, number> = {};
    for (let i = 0; i < keys.length; i++) {
      const val = results?.[i]?.[1];
      out[keys[i]] = typeof val === "string" ? parseInt(val, 10) || 0 : 0;
    }
    return out;
  } catch {
    return {};
  }
}

/** Reset all counters (admin only). */
export async function resetAuthMetrics(): Promise<void> {
  const r = redis();
  if (!r) return;
  const keys: AuthMetricKey[] = [
    "login_success", "login_failed", "login_2fa_required",
    "2fa_success", "2fa_failed", "2fa_backup_used",
    "webauthn_success", "webauthn_failed", "webauthn_registered",
    "session_revoked", "session_revoked_all",
    "refresh_rotated", "refresh_reuse_detected",
    "risk_blocked", "password_changed", "new_device_detected",
  ];
  try {
    const pipeline = r.pipeline();
    for (const k of keys) pipeline.del(`${PREFIX}${k}`);
    await pipeline.exec();
  } catch {
    // ignore
  }
}
