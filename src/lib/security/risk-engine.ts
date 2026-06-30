// Lightweight real-time risk engine — Phase 34.
//
// Phase 34 scope: emit risk events only. No account freezing, no order blocking.
// Phase 35+: enforcement (freeze, rate-limit, 2FA escalation on high-severity events).
//
// Risk checks (all fire-and-forget; do NOT block order execution):
//   1. order_frequency_high  — > 10 orders/min per user per market
//   2. order_burst           — > 3 orders within 5s per user
//   3. ip_switch_detected    — IP changed within 5-minute window
//   4. duplicate_request     — Same order fingerprint within 5s
//   5. suspicious_api_behavior — > 50 API calls/min per key

import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { writeAudit } from "./audit-log";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RiskEventType =
  | "order_frequency_high"
  | "order_burst"
  | "ip_switch_detected"
  | "duplicate_request"
  | "suspicious_api_behavior";

export type RiskSeverity = "low" | "medium" | "high";

type RiskEvent = {
  userId: string;
  eventType: RiskEventType;
  severity: RiskSeverity;
  market?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
};

// ── Thresholds (move to feature flags in Phase 35) ────────────────────────────

const FREQ_PER_MIN = 10;
const BURST_5S = 3;
const API_PER_MIN = 50;

// ── Redis helpers ─────────────────────────────────────────────────────────────

function redis() {
  return globalThis.tecpeyRedisClient ?? null;
}

async function incr(key: string, ttl: number): Promise<number> {
  const r = redis();
  if (!r) return 0;
  const n = await r.incr(key);
  if (n === 1) void r.expire(key, ttl);
  return n;
}

async function get(key: string): Promise<string | null> {
  return redis()?.get(key) ?? null;
}

async function setex(key: string, value: string, ttl: number): Promise<void> {
  void redis()?.set(key, value, "EX", ttl);
}

// ── Event persister ───────────────────────────────────────────────────────────

async function emit(ev: RiskEvent): Promise<void> {
  try {
    await withDb(async (db) => {
      await db.query(
        `INSERT INTO risk_events (user_id, event_type, severity, market, ip, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          ev.userId, ev.eventType, ev.severity,
          ev.market ?? null, ev.ip?.slice(0, 80) ?? null,
          JSON.stringify(ev.metadata ?? {}),
        ],
      );
      return true;
    });
    writeAudit({
      actorId: ev.userId, action: "risk_event", ip: ev.ip,
      metadata: { eventType: ev.eventType, severity: ev.severity, market: ev.market },
    });
    logger.warn("[risk-engine] event", {
      userId: ev.userId, type: ev.eventType, severity: ev.severity,
    });
  } catch (err) {
    logger.error("[risk-engine] persist failed", { err: String(err) });
  }
}

// ── Order risk check ──────────────────────────────────────────────────────────

/** Called before order placement. All checks are fire-and-forget. */
export function checkOrderRisk(opts: {
  userId: string;
  market: string;
  ip: string;
  orderFingerprint: string;
}): void {
  void runOrderRisk(opts);
}

async function runOrderRisk(opts: {
  userId: string; market: string; ip: string; orderFingerprint: string;
}): Promise<void> {
  const { userId, market, ip, orderFingerprint } = opts;
  const minBucket = Math.floor(Date.now() / 60_000);
  try {
    const [freqCount, burstCount, prevIp, dedupExists] = await Promise.all([
      incr(`tecpey:risk:freq:${userId}:${market}:${minBucket}`, 70),
      incr(`tecpey:risk:burst:${userId}`, 5),
      get(`tecpey:risk:ip:${userId}`),
      get(`tecpey:risk:dedup:${orderFingerprint}`),
    ]);
    void setex(`tecpey:risk:ip:${userId}`, ip, 300);
    void setex(`tecpey:risk:dedup:${orderFingerprint}`, "1", 5);

    if (freqCount > FREQ_PER_MIN) {
      void emit({ userId, market, ip, eventType: "order_frequency_high", severity: "medium",
        metadata: { ordersThisMinute: freqCount, threshold: FREQ_PER_MIN } });
    }
    if (burstCount > BURST_5S) {
      void emit({ userId, market, ip, eventType: "order_burst", severity: "low",
        metadata: { burst5s: burstCount, threshold: BURST_5S } });
    }
    if (prevIp && prevIp !== ip) {
      void emit({ userId, market, ip, eventType: "ip_switch_detected", severity: "low",
        metadata: { prevIp, currentIp: ip } });
    }
    if (dedupExists) {
      void emit({ userId, market, ip, eventType: "duplicate_request", severity: "medium",
        metadata: { fingerprint: orderFingerprint.slice(0, 16) } });
    }
  } catch (err) {
    logger.warn("[risk-engine] check failed", { userId, err: String(err) });
  }
}

// ── API key risk check ────────────────────────────────────────────────────────

/** Called on API key usage. Detects abnormal call rates. */
export function checkApiKeyRisk(opts: {
  userId: string; keyId: string; ip: string;
}): void {
  void runApiKeyRisk(opts);
}

async function runApiKeyRisk(opts: { userId: string; keyId: string; ip: string }): Promise<void> {
  const { userId, keyId, ip } = opts;
  const minBucket = Math.floor(Date.now() / 60_000);
  try {
    const count = await incr(`tecpey:risk:apicall:${keyId}:${minBucket}`, 70);
    if (count > API_PER_MIN) {
      void emit({ userId, ip, eventType: "suspicious_api_behavior", severity: "medium",
        metadata: { keyId, callsThisMinute: count, threshold: API_PER_MIN } });
    }
  } catch (err) {
    logger.warn("[risk-engine] api check failed", { userId, err: String(err) });
  }
}

// ── Query ─────────────────────────────────────────────────────────────────────

export type RiskRecord = {
  id: string;
  userId: string;
  eventType: string;
  severity: string;
  market: string | null;
  ip: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export async function getRecentRiskEvents(userId: string, limit = 50): Promise<RiskRecord[]> {
  const r = await withDb(async (db) => {
    const result = await db.query<{
      id: string; user_id: string; event_type: string; severity: string;
      market: string | null; ip: string | null;
      metadata: Record<string, unknown>; created_at: Date;
    }>(
      `SELECT id, user_id, event_type, severity, market, ip, metadata, created_at
       FROM risk_events WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [userId, Math.min(limit, 200)],
    );
    return result.rows.map((row) => ({
      id: row.id, userId: row.user_id, eventType: row.event_type,
      severity: row.severity, market: row.market, ip: row.ip,
      metadata: row.metadata, createdAt: row.created_at,
    }));
  });
  return r.enabled ? r.value : [];
}
