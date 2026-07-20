// Real-time risk detector backed by a durable PostgreSQL decision authority.
//
// Redis counters remain advisory detector inputs. Once a threshold produces a
// decision, the caller waits for event/enforcement/evidence commit before a
// financial admission may continue.

import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { recordRiskDecision } from "./risk-enforcement-authority";
import {
  fingerprintRiskDetectorValue,
  fingerprintRiskPrincipal,
  type RiskEventType,
  type RiskSeverity,
} from "./risk-enforcement-evidence";

export type { RiskEventType, RiskSeverity };

export type RiskCheckResult =
  | { ok: true; decisions: number }
  | { ok: false; reason: "risk_authority_unavailable" };

type RiskDecision = {
  principalId: string;
  eventType: RiskEventType;
  severity: RiskSeverity;
  detectorIdentity: string;
  market?: string;
  detectorFacts?: Record<string, unknown>;
};

const FREQ_PER_MIN = 10;
const BURST_5S = 3;
const API_PER_MIN = 50;

function redis() {
  return globalThis.tecpeyRedisClient ?? null;
}

async function incr(key: string, ttl: number): Promise<number> {
  const client = redis();
  if (!client) return 0;
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, ttl);
  return count;
}

async function get(key: string): Promise<string | null> {
  return redis()?.get(key) ?? null;
}

async function setex(key: string, value: string, ttl: number): Promise<void> {
  const client = redis();
  if (client) await client.set(key, value, "EX", ttl);
}

async function commitDecision(decision: RiskDecision): Promise<void> {
  const result = await recordRiskDecision({
    principalId: decision.principalId,
    eventType: decision.eventType,
    severity: decision.severity,
    detectorIdentity: decision.detectorIdentity,
    market: decision.market,
    detectorFacts: decision.detectorFacts,
  });
  logger.warn("[risk-engine] durable decision committed", {
    principalFingerprint: fingerprintRiskPrincipal(decision.principalId),
    eventFingerprint: result.eventFingerprint,
    eventType: decision.eventType,
    severity: decision.severity,
    effectiveLevel: result.effectiveLevel,
    generation: result.generation,
    replayed: result.replayed,
    projectionPending: !result.projectionPublished,
  });
}

/**
 * Called before Exchange order admission. A detected decision must commit
 * before the route may continue; Redis detector absence alone is not a block.
 */
export async function checkOrderRisk(opts: {
  userId: string;
  market: string;
  ip: string;
  orderFingerprint: string;
}): Promise<RiskCheckResult> {
  const { userId, market } = opts;
  const principalFingerprint = fingerprintRiskPrincipal(userId);
  const ipFingerprint = fingerprintRiskDetectorValue(opts.ip);
  const orderFingerprint = fingerprintRiskDetectorValue(opts.orderFingerprint);
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const burstBucket = Math.floor(Date.now() / 5_000);

  try {
    const [freqCount, burstCount, previousIpFingerprint, duplicateExists] =
      await Promise.all([
        incr(
          `tecpey:risk:freq:${principalFingerprint}:${market}:${minuteBucket}`,
          70,
        ),
        incr(`tecpey:risk:burst:${principalFingerprint}:${burstBucket}`, 10),
        get(`tecpey:risk:ip:${principalFingerprint}`),
        get(`tecpey:risk:dedup:${orderFingerprint}`),
      ]);

    await Promise.all([
      setex(`tecpey:risk:ip:${principalFingerprint}`, ipFingerprint, 300),
      setex(`tecpey:risk:dedup:${orderFingerprint}`, "1", 5),
    ]);

    const decisions: RiskDecision[] = [];
    if (freqCount > FREQ_PER_MIN) {
      decisions.push({
        principalId: userId,
        market,
        eventType: "order_frequency_high",
        severity: "medium",
        detectorIdentity: `frequency:${market}:${minuteBucket}`,
        detectorFacts: {
          observedCount: freqCount,
          threshold: FREQ_PER_MIN,
          windowSeconds: 60,
        },
      });
    }
    if (burstCount > BURST_5S) {
      decisions.push({
        principalId: userId,
        market,
        eventType: "order_burst",
        severity: "low",
        detectorIdentity: `burst:${market}:${burstBucket}`,
        detectorFacts: {
          observedCount: burstCount,
          threshold: BURST_5S,
          windowSeconds: 5,
        },
      });
    }
    if (previousIpFingerprint && previousIpFingerprint !== ipFingerprint) {
      decisions.push({
        principalId: userId,
        market,
        eventType: "ip_switch_detected",
        severity: "low",
        detectorIdentity: `ip-switch:${minuteBucket}:${ipFingerprint}`,
        detectorFacts: {
          previousIpFingerprint,
          currentIpFingerprint: ipFingerprint,
          windowSeconds: 300,
        },
      });
    }
    if (duplicateExists) {
      decisions.push({
        principalId: userId,
        market,
        eventType: "duplicate_request",
        severity: "medium",
        detectorIdentity: `duplicate:${orderFingerprint}`,
        detectorFacts: {
          orderFingerprint,
          windowSeconds: 5,
        },
      });
    }

    for (const decision of decisions) await commitDecision(decision);
    return { ok: true, decisions: decisions.length };
  } catch (error) {
    logger.error("[risk-engine] durable order decision failed", {
      principalFingerprint,
      market,
      errorCategory: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    });
    return { ok: false, reason: "risk_authority_unavailable" };
  }
}

/** Dormant until an authenticated API-key caller explicitly integrates it. */
export async function checkApiKeyRisk(opts: {
  userId: string;
  keyId: string;
  ip: string;
}): Promise<RiskCheckResult> {
  const principalFingerprint = fingerprintRiskPrincipal(opts.userId);
  const keyFingerprint = fingerprintRiskDetectorValue(opts.keyId);
  const minuteBucket = Math.floor(Date.now() / 60_000);
  try {
    const count = await incr(
      `tecpey:risk:apicall:${keyFingerprint}:${minuteBucket}`,
      70,
    );
    if (count <= API_PER_MIN) return { ok: true, decisions: 0 };

    await commitDecision({
      principalId: opts.userId,
      eventType: "suspicious_api_behavior",
      severity: "medium",
      detectorIdentity: `api-frequency:${keyFingerprint}:${minuteBucket}`,
      detectorFacts: {
        keyFingerprint,
        ipFingerprint: fingerprintRiskDetectorValue(opts.ip),
        observedCount: count,
        threshold: API_PER_MIN,
        windowSeconds: 60,
      },
    });
    return { ok: true, decisions: 1 };
  } catch (error) {
    logger.error("[risk-engine] durable API-key decision failed", {
      principalFingerprint,
      errorCategory: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    });
    return { ok: false, reason: "risk_authority_unavailable" };
  }
}

export type RiskRecord = {
  id: string;
  userId: string;
  eventType: string;
  severity: string;
  market: string | null;
  ip: null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export async function getRecentRiskEvents(
  userId: string,
  limit = 50,
): Promise<RiskRecord[]> {
  const result = await withDb(async (client) => {
    const selected = await client.query<{
      id: string;
      principal_id: string;
      event_type: string;
      severity: string;
      market: string | null;
      detector_facts: Record<string, unknown>;
      created_at: Date;
    }>(
      `SELECT id, principal_id, event_type, severity, market,
              detector_facts, created_at
         FROM risk_authority_events
        WHERE tenant_id = 'tecpey' AND principal_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, Math.min(Math.max(limit, 1), 200)],
    );
    return selected.rows.map((row) => ({
      id: row.id,
      userId: row.principal_id,
      eventType: row.event_type,
      severity: row.severity,
      market: row.market,
      ip: null,
      metadata: row.detector_facts,
      createdAt: row.created_at,
    }));
  });
  return result.enabled ? result.value : [];
}
