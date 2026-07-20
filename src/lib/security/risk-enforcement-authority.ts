import type { PoolClient } from "pg";
import { withDb, withTx } from "@/lib/db";
import { PLATFORM } from "@/lib/platform-config";
import { hashSensitiveAuditRequest } from "@/lib/security/sensitive-mutation-audit";
import {
  RISK_ENFORCEMENT_POLICY_VERSION,
  fingerprintRiskDetectorValue,
  fingerprintRiskEventIdentity,
  fingerprintRiskPrincipal,
  writeRiskEvidenceTx,
  type EffectiveRiskLevel,
  type RiskEventType,
  type RiskLevel,
  type RiskSeverity,
} from "@/lib/security/risk-enforcement-evidence";

const DEFAULT_REVIEW_TTL_SECONDS = 5 * 60;
const DEFAULT_BLOCK_TTL_SECONDS = 60 * 60;
const CLEAR_PROJECTION_TTL_SECONDS = 24 * 60 * 60;

export type RiskDecisionInput = {
  principalId: string;
  eventType: RiskEventType;
  severity: RiskSeverity;
  detectorIdentity: string;
  market?: string | null;
  detectorFacts?: Record<string, unknown>;
};

export type RiskDecisionResult = {
  eventFingerprint: string;
  replayed: boolean;
  effectiveLevel: EffectiveRiskLevel;
  generation: number;
  expiresAt: string | null;
  projectionPublished: boolean;
};

export type RiskAuthorityResolution =
  | {
      available: true;
      level: EffectiveRiskLevel;
      generation: number;
      expiresAt: string | null;
    }
  | { available: false };

type EventRow = {
  id: string;
  event_key: string;
  event_type: RiskEventType;
  severity: RiskSeverity;
  market: string | null;
  desired_level: RiskLevel | null;
  desired_expires_at: Date | null;
  request_hash: string;
};

type EnforcementRow = {
  level: EffectiveRiskLevel;
  generation: number;
  expires_at: Date | null;
};

type DesiredEnforcement = {
  level: RiskLevel;
  expiresAt: Date;
} | null;

function deriveDesiredEnforcement(input: {
  eventType: RiskEventType;
  severity: RiskSeverity;
  now: Date;
}): DesiredEnforcement {
  if (input.severity === "high") {
    return {
      level: "trade_blocked",
      expiresAt: new Date(input.now.getTime() + DEFAULT_BLOCK_TTL_SECONDS * 1000),
    };
  }
  if (input.eventType === "duplicate_request" && input.severity === "medium") {
    return {
      level: "review",
      expiresAt: new Date(input.now.getTime() + DEFAULT_REVIEW_TTL_SECONDS * 1000),
    };
  }
  return null;
}

function levelRank(level: EffectiveRiskLevel): number {
  if (level === "none") return 0;
  if (level === "review") return 1;
  if (level === "trade_blocked" || level === "withdraw_blocked") return 2;
  return 3;
}

function mergeLevel(current: EffectiveRiskLevel, desired: RiskLevel): RiskLevel {
  if (current === "none" || current === "review") return desired;
  if (current === "all_blocked") return current;
  if (
    (current === "trade_blocked" && desired === "withdraw_blocked") ||
    (current === "withdraw_blocked" && desired === "trade_blocked")
  ) {
    return "all_blocked";
  }
  return levelRank(current) >= levelRank(desired) ? current : desired;
}

function boundedMarket(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized ? normalized.slice(0, 40) : null;
}

function boundedDetectorFacts(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const encoded = JSON.stringify(value ?? {});
  if (Buffer.byteLength(encoded, "utf8") > 8_000) {
    throw new Error("risk_detector_facts_too_large");
  }
  return JSON.parse(encoded) as Record<string, unknown>;
}

async function lockPrincipal(
  client: PoolClient,
  tenantId: string,
  principalId: string,
): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `risk:${tenantId}:${principalId}`,
  ]);
}

function sameEvent(
  row: EventRow,
  input: {
    eventKey: string;
    eventType: RiskEventType;
    severity: RiskSeverity;
    market: string | null;
    desired: DesiredEnforcement;
    requestHash: string;
  },
): boolean {
  return (
    row.event_key === input.eventKey &&
    row.event_type === input.eventType &&
    row.severity === input.severity &&
    row.market === input.market &&
    row.desired_level === input.desired?.level &&
    (row.desired_expires_at?.toISOString() ?? null) ===
      (input.desired?.expiresAt.toISOString() ?? null) &&
    row.request_hash === input.requestHash
  );
}

async function writeEventEvidence(
  client: PoolClient,
  input: {
    tenantId: string;
    principalFingerprint: string;
    eventKey: string;
    eventType: RiskEventType;
    severity: RiskSeverity;
    market: string | null;
    desired: DesiredEnforcement;
    requestHash: string;
  },
): Promise<void> {
  await writeRiskEvidenceTx(client, {
    tenantId: input.tenantId,
    actorId: "risk-engine",
    action: "risk.event.record",
    resourceType: "risk_event",
    resourceIdentity: input.eventKey,
    correlationIdentity: input.eventKey,
    requestHash: input.requestHash,
    outcome: "success",
    metadata: {
      principalFingerprint: input.principalFingerprint,
      eventType: input.eventType,
      severity: input.severity,
      market: input.market,
      desiredLevel: input.desired?.level ?? "none",
      desiredExpiresAt: input.desired?.expiresAt.toISOString() ?? null,
    },
  });
}

async function upsertOutbox(
  client: PoolClient,
  input: {
    tenantId: string;
    principalId: string;
    principalFingerprint: string;
    generation: number;
    level: EffectiveRiskLevel;
    expiresAt: Date | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO risk_enforcement_outbox
       (tenant_id, principal_id, principal_fingerprint, generation,
        level, expires_at, state, available_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
     ON CONFLICT (tenant_id, principal_id, generation) DO NOTHING`,
    [
      input.tenantId,
      input.principalId,
      input.principalFingerprint,
      input.generation,
      input.level,
      input.expiresAt,
    ],
  );
}

export async function recordRiskDecision(
  input: RiskDecisionInput,
): Promise<RiskDecisionResult> {
  const tenantId = PLATFORM.DEFAULT_TENANT_ID;
  const principalId = input.principalId.trim();
  if (!principalId || principalId.length > 300) {
    throw new Error("invalid_risk_principal");
  }
  const market = boundedMarket(input.market);
  const detectorFacts = boundedDetectorFacts(input.detectorFacts);
  const principalFingerprint = fingerprintRiskPrincipal(principalId);
  const detectorFingerprint = fingerprintRiskDetectorValue(input.detectorIdentity);
  const eventIdentity = [
    tenantId,
    principalId,
    input.eventType,
    detectorFingerprint,
    RISK_ENFORCEMENT_POLICY_VERSION,
  ].join("\u001f");
  const eventKey = fingerprintRiskEventIdentity(eventIdentity);
  const eventFingerprint = fingerprintRiskEventIdentity(eventKey);
  const now = new Date();
  const desired = deriveDesiredEnforcement({
    eventType: input.eventType,
    severity: input.severity,
    now,
  });
  const requestHash = hashSensitiveAuditRequest({
    tenantId,
    principalFingerprint,
    eventKey,
    eventType: input.eventType,
    severity: input.severity,
    market,
    desiredLevel: desired?.level ?? null,
    desiredExpiresAt: desired?.expiresAt.toISOString() ?? null,
    detectorFacts,
    policyVersion: RISK_ENFORCEMENT_POLICY_VERSION,
  });

  const transaction = await withTx(async (client) => {
    await lockPrincipal(client, tenantId, principalId);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO risk_authority_events
         (tenant_id, principal_id, principal_fingerprint, event_key,
          event_type, severity, market, policy_version, desired_level,
          desired_expires_at, request_hash, detector_facts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
       ON CONFLICT (tenant_id, event_key) DO NOTHING
       RETURNING id`,
      [
        tenantId,
        principalId,
        principalFingerprint,
        eventKey,
        input.eventType,
        input.severity,
        market,
        RISK_ENFORCEMENT_POLICY_VERSION,
        desired?.level ?? null,
        desired?.expiresAt ?? null,
        requestHash,
        JSON.stringify(detectorFacts),
      ],
    );

    let eventId = inserted.rows[0]?.id ?? null;
    const replayed = !eventId;
    if (!eventId) {
      const existing = await client.query<EventRow>(
        `SELECT id, event_key, event_type, severity, market, desired_level,
                desired_expires_at, request_hash
           FROM risk_authority_events
          WHERE tenant_id = $1 AND event_key = $2
          LIMIT 1`,
        [tenantId, eventKey],
      );
      const row = existing.rows[0];
      if (
        !row ||
        !sameEvent(row, {
          eventKey,
          eventType: input.eventType,
          severity: input.severity,
          market,
          desired,
          requestHash,
        })
      ) {
        throw new Error("risk_event_replay_conflict");
      }
      eventId = row.id;
    }

    await writeEventEvidence(client, {
      tenantId,
      principalFingerprint,
      eventKey,
      eventType: input.eventType,
      severity: input.severity,
      market,
      desired,
      requestHash,
    });

    const currentResult = await client.query<EnforcementRow>(
      `SELECT level, generation::integer AS generation, expires_at
         FROM risk_effective_enforcements
        WHERE tenant_id = $1 AND principal_id = $2
        FOR UPDATE`,
      [tenantId, principalId],
    );
    const current = currentResult.rows[0] ?? null;

    if (!desired || replayed) {
      return {
        replayed,
        effectiveLevel: current?.level ?? "none",
        generation: current?.generation ?? 0,
        expiresAt: current?.expires_at ?? null,
        projectionRequired: false,
      };
    }

    const currentActive =
      current &&
      current.level !== "none" &&
      current.expires_at &&
      current.expires_at.getTime() > now.getTime()
        ? current
        : null;
    const nextLevel = mergeLevel(currentActive?.level ?? "none", desired.level);
    const nextExpiry = new Date(
      Math.max(
        desired.expiresAt.getTime(),
        currentActive?.expires_at?.getTime() ?? 0,
      ),
    );
    const generation = (current?.generation ?? 0) + 1;
    const enforcementRequestHash = hashSensitiveAuditRequest({
      tenantId,
      principalFingerprint,
      eventKey,
      generation,
      level: nextLevel,
      expiresAt: nextExpiry.toISOString(),
      policyVersion: RISK_ENFORCEMENT_POLICY_VERSION,
    });

    if (current) {
      await client.query(
        `UPDATE risk_effective_enforcements
            SET level = $3,
                generation = $4,
                source_event_id = $5,
                policy_version = $6,
                request_hash = $7,
                expires_at = $8
          WHERE tenant_id = $1 AND principal_id = $2`,
        [
          tenantId,
          principalId,
          nextLevel,
          generation,
          eventId,
          RISK_ENFORCEMENT_POLICY_VERSION,
          enforcementRequestHash,
          nextExpiry,
        ],
      );
    } else {
      await client.query(
        `INSERT INTO risk_effective_enforcements
           (tenant_id, principal_id, principal_fingerprint, level, generation,
            source_event_id, policy_version, request_hash, expires_at)
         VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8)`,
        [
          tenantId,
          principalId,
          principalFingerprint,
          nextLevel,
          eventId,
          RISK_ENFORCEMENT_POLICY_VERSION,
          enforcementRequestHash,
          nextExpiry,
        ],
      );
    }

    await writeRiskEvidenceTx(client, {
      tenantId,
      actorId: "risk-authority",
      action: "risk.enforcement.apply",
      resourceType: "risk_enforcement",
      resourceIdentity: `${tenantId}\u001f${principalId}\u001f${generation}`,
      correlationIdentity: `${eventKey}\u001f${generation}`,
      requestHash: enforcementRequestHash,
      outcome: "success",
      metadata: {
        principalFingerprint,
        sourceEventFingerprint: eventFingerprint,
        level: nextLevel,
        generation,
        expiresAt: nextExpiry.toISOString(),
      },
    });
    await upsertOutbox(client, {
      tenantId,
      principalId,
      principalFingerprint,
      generation,
      level: nextLevel,
      expiresAt: nextExpiry,
    });

    return {
      replayed: false,
      effectiveLevel: nextLevel,
      generation,
      expiresAt: nextExpiry,
      projectionRequired: true,
    };
  });

  if (!transaction.enabled) throw new Error("risk_authority_unavailable");
  const projectionPublished = transaction.value.projectionRequired
    ? await publishRiskEnforcementOutbox(principalId)
    : true;
  return {
    eventFingerprint,
    replayed: transaction.value.replayed,
    effectiveLevel: transaction.value.effectiveLevel,
    generation: transaction.value.generation,
    expiresAt: transaction.value.expiresAt?.toISOString() ?? null,
    projectionPublished,
  };
}

async function transitionToNone(input: {
  principalId: string;
  action: "risk.enforcement.clear" | "risk.enforcement.expire";
  actorId: "risk-authority" | "risk-admin";
  expectedExpired?: boolean;
}): Promise<RiskAuthorityResolution> {
  const tenantId = PLATFORM.DEFAULT_TENANT_ID;
  const result = await withTx(async (client) => {
    await lockPrincipal(client, tenantId, input.principalId);
    const currentResult = await client.query<EnforcementRow & {
      principal_fingerprint: string;
    }>(
      `SELECT level, generation::integer AS generation, expires_at,
              principal_fingerprint
         FROM risk_effective_enforcements
        WHERE tenant_id = $1 AND principal_id = $2
        FOR UPDATE`,
      [tenantId, input.principalId],
    );
    const current = currentResult.rows[0];
    if (!current || current.level === "none") {
      return { level: "none" as const, generation: current?.generation ?? 0 };
    }
    if (
      input.expectedExpired &&
      (!current.expires_at || current.expires_at.getTime() > Date.now())
    ) {
      return {
        level: current.level,
        generation: current.generation,
        expiresAt: current.expires_at,
      };
    }

    const generation = current.generation + 1;
    const principalFingerprint = current.principal_fingerprint;
    const requestHash = hashSensitiveAuditRequest({
      tenantId,
      principalFingerprint,
      action: input.action,
      previousLevel: current.level,
      generation,
      policyVersion: RISK_ENFORCEMENT_POLICY_VERSION,
    });
    await client.query(
      `UPDATE risk_effective_enforcements
          SET level = 'none', generation = $3, source_event_id = NULL,
              policy_version = $4, request_hash = $5, expires_at = NULL
        WHERE tenant_id = $1 AND principal_id = $2`,
      [
        tenantId,
        input.principalId,
        generation,
        RISK_ENFORCEMENT_POLICY_VERSION,
        requestHash,
      ],
    );
    await writeRiskEvidenceTx(client, {
      tenantId,
      actorId: input.actorId,
      action: input.action,
      resourceType: "risk_enforcement",
      resourceIdentity: `${tenantId}\u001f${input.principalId}\u001f${generation}`,
      correlationIdentity: `${tenantId}\u001f${input.principalId}\u001f${generation}\u001f${input.action}`,
      requestHash,
      outcome: "success",
      metadata: {
        principalFingerprint,
        previousLevel: current.level,
        level: "none",
        generation,
      },
    });
    await upsertOutbox(client, {
      tenantId,
      principalId: input.principalId,
      principalFingerprint,
      generation,
      level: "none",
      expiresAt: null,
    });
    return { level: "none" as const, generation };
  });

  if (!result.enabled) return { available: false };
  await publishRiskEnforcementOutbox(input.principalId);
  return {
    available: true,
    level: result.value.level,
    generation: result.value.generation,
    expiresAt: result.value.expiresAt?.toISOString() ?? null,
  };
}

export async function clearRiskEnforcement(
  principalId: string,
): Promise<RiskAuthorityResolution> {
  return transitionToNone({
    principalId,
    action: "risk.enforcement.clear",
    actorId: "risk-admin",
  });
}

export async function resolveRiskEnforcement(
  principalId: string,
): Promise<RiskAuthorityResolution> {
  const tenantId = PLATFORM.DEFAULT_TENANT_ID;
  const selected = await withDb(async (client) => {
    const result = await client.query<EnforcementRow>(
      `SELECT level, generation::integer AS generation, expires_at
         FROM risk_effective_enforcements
        WHERE tenant_id = $1 AND principal_id = $2
        LIMIT 1`,
      [tenantId, principalId],
    );
    return result.rows[0] ?? null;
  });
  if (!selected.enabled) return { available: false };
  const current = selected.value;
  if (!current) {
    return { available: true, level: "none", generation: 0, expiresAt: null };
  }
  if (
    current.level !== "none" &&
    current.expires_at &&
    current.expires_at.getTime() <= Date.now()
  ) {
    return transitionToNone({
      principalId,
      action: "risk.enforcement.expire",
      actorId: "risk-authority",
      expectedExpired: true,
    });
  }
  return {
    available: true,
    level: current.level,
    generation: current.generation,
    expiresAt: current.expires_at?.toISOString() ?? null,
  };
}

function redisClient() {
  return globalThis.tecpeyRedisClient ?? null;
}

export async function publishRiskEnforcementOutbox(
  principalId?: string,
): Promise<boolean> {
  const tenantId = PLATFORM.DEFAULT_TENANT_ID;
  const selected = await withDb(async (client) => {
    const result = await client.query<{
      principal_id: string;
      generation: number;
      level: EffectiveRiskLevel;
      expires_at: Date | null;
    }>(
      `SELECT principal_id, generation::integer AS generation, level, expires_at
         FROM risk_enforcement_outbox
        WHERE tenant_id = $1
          AND state IN ('pending', 'dead_letter')
          AND available_at <= NOW()
          AND ($2::text IS NULL OR principal_id = $2)
        ORDER BY created_at
        LIMIT 50`,
      [tenantId, principalId ?? null],
    );
    return result.rows;
  });
  if (!selected.enabled) return false;

  const redis = redisClient();
  let allPublished = true;
  for (const row of selected.value) {
    try {
      if (!redis) throw new Error("redis_unavailable");
      const ttlSeconds = row.expires_at
        ? Math.max(1, Math.ceil((row.expires_at.getTime() - Date.now()) / 1000))
        : CLEAR_PROJECTION_TTL_SECONDS;
      await redis.set(
        `tecpey:risk:level:${tenantId}:${row.principal_id}`,
        JSON.stringify({
          level: row.level,
          generation: row.generation,
          expiresAt: row.expires_at?.toISOString() ?? null,
        }),
        "EX",
        ttlSeconds,
      );
      const marked = await withDb(async (client) => {
        await client.query(
          `UPDATE risk_enforcement_outbox
              SET state = 'published', attempts = attempts + 1,
                  published_at = COALESCE(published_at, NOW()),
                  last_error_category = NULL
            WHERE tenant_id = $1 AND principal_id = $2 AND generation = $3
              AND state IN ('pending', 'dead_letter')`,
          [tenantId, row.principal_id, row.generation],
        );
        return true;
      });
      if (!marked.enabled) throw new Error("risk_outbox_mark_unavailable");
    } catch (error) {
      allPublished = false;
      await withDb(async (client) => {
        await client.query(
          `UPDATE risk_enforcement_outbox
              SET state = 'dead_letter', attempts = attempts + 1,
                  available_at = NOW() + INTERVAL '1 minute',
                  last_error_category = $4
            WHERE tenant_id = $1 AND principal_id = $2 AND generation = $3
              AND state <> 'completed'`,
          [
            tenantId,
            row.principal_id,
            row.generation,
            String(error).includes("redis")
              ? "redis_unavailable"
              : "publication_failed",
          ],
        );
        return true;
      });
    }
  }
  return allPublished;
}
