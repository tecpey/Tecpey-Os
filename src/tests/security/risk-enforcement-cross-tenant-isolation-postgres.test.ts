import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { PLATFORM } from "../../lib/platform-config";
import {
  clearRiskEnforcement,
  recordRiskDecision,
  resolveRiskEnforcement,
} from "../../lib/security/risk-enforcement-authority";

// Cross-tenant adversarial proof for the risk-enforcement authority (#109 / #20).
//
// Risk enforcement used to hardcode the default tenant, making it single-tenant.
// It now takes an optional tenant from the caller and scopes every durable
// decision, effective enforcement and read by `WHERE tenant_id = $1` with an
// `ON CONFLICT (tenant_id, principal_id, generation)` key. The threat proven
// closed: the SAME principal id, active in two tenants, must get INDEPENDENT
// enforcement. If tenant_id were dropped from the unique key, tenant B's decision
// would collapse into tenant A's row (or replay it); if dropped from the read/
// clear predicate, one tenant could read or clear the other tenant's live
// trading restriction — a cross-tenant leak on a money-safety control. The proof
// asserts each tenant owns a distinct row, resolves only its own level, and that
// clearing one tenant leaves the other's restriction intact.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));

const TENANT_A = PLATFORM.DEFAULT_TENANT_ID;
const TENANT_B = `tenant-b-${randomUUID()}`;

async function enforcementRowsFor(
  principalId: string,
): Promise<Array<{ tenant_id: string; level: string; generation: number }>> {
  const result = await withDb(async (client) => {
    const rows = await client.query<{
      tenant_id: string;
      level: string;
      generation: number;
    }>(
      `SELECT tenant_id, level, generation::integer AS generation
         FROM risk_effective_enforcements
        WHERE principal_id = $1
        ORDER BY tenant_id`,
      [principalId],
    );
    return rows.rows;
  });
  assert.equal(result.enabled, true, "risk test database must be reachable");
  if (!result.enabled) throw new Error("risk_test_database_unavailable");
  return result.value;
}

// No teardown: the risk authority tables are append-only durable evidence
// (risk_enforcement_outbox is guarded against DELETE), so — like the other risk
// authority integration tests — each run uses a fresh random principal id and
// tenant and simply leaves its evidence rows in place.

describe("Risk enforcement cross-tenant isolation", () => {
  it(
    "keeps the same principal's enforcement independent per tenant: distinct rows, tenant-scoped resolve, and an isolated clear",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const principalId = `risk-xt-${randomUUID()}`;
      const detectorIdentity = `xt-detector:${randomUUID()}`;
      const previousRedis = globalThis.tecpeyRedisClient;
      globalThis.tecpeyRedisClient = undefined; // force deterministic outbox, no live projection

      try {
        // Tenant A records a medium duplicate-request decision → "review".
        const decisionA = await recordRiskDecision({
          principalId,
          tenantId: TENANT_A,
          eventType: "duplicate_request",
          severity: "medium",
          detectorIdentity,
          market: "BTC-USDT",
          detectorFacts: { windowSeconds: 5 },
        });
        assert.equal(decisionA.replayed, false);
        assert.equal(decisionA.effectiveLevel, "review");

        // Tenant B, SAME principal, byte-identical detector — the exact shape
        // that would replay if tenant_id were not part of the event/unique key.
        const decisionB = await recordRiskDecision({
          principalId,
          tenantId: TENANT_B,
          eventType: "duplicate_request",
          severity: "medium",
          detectorIdentity,
          market: "BTC-USDT",
          detectorFacts: { windowSeconds: 5 },
        });
        assert.equal(
          decisionB.replayed,
          false,
          "tenant B must record its own decision, not replay tenant A's",
        );
        assert.equal(decisionB.effectiveLevel, "review");

        // Each tenant owns a distinct effective-enforcement row.
        const rows = await enforcementRowsFor(principalId);
        assert.equal(rows.length, 2, "each tenant must own a distinct enforcement row");
        assert.deepEqual(
          rows.map((r) => r.tenant_id).sort(),
          [TENANT_A, TENANT_B].sort(),
        );

        // Escalate ONLY tenant B to a hard block; tenant A must stay at review.
        const escalateB = await recordRiskDecision({
          principalId,
          tenantId: TENANT_B,
          eventType: "order_frequency_high",
          severity: "high",
          detectorIdentity: `xt-block:${randomUUID()}`,
          market: "BTC-USDT",
          detectorFacts: { observedCount: 11, threshold: 10 },
        });
        assert.equal(escalateB.effectiveLevel, "trade_blocked");

        // The load-bearing read predicate: each tenant resolves only its own
        // level. A tenant-blind read would hand both tenants the same row.
        const resolvedA = await resolveRiskEnforcement(principalId, TENANT_A);
        const resolvedB = await resolveRiskEnforcement(principalId, TENANT_B);
        assert.equal(resolvedA.available && resolvedA.level, "review");
        assert.equal(resolvedB.available && resolvedB.level, "trade_blocked");
        assert.notEqual(
          resolvedA.available && resolvedA.level,
          resolvedB.available && resolvedB.level,
          "tenant A must not read tenant B's escalated restriction",
        );

        // Clearing tenant A must NOT touch tenant B's live block.
        await clearRiskEnforcement(principalId, TENANT_A);
        const afterClearA = await resolveRiskEnforcement(principalId, TENANT_A);
        const afterClearB = await resolveRiskEnforcement(principalId, TENANT_B);
        assert.equal(afterClearA.available && afterClearA.level, "none");
        assert.equal(
          afterClearB.available && afterClearB.level,
          "trade_blocked",
          "clearing tenant A must leave tenant B's trading block intact",
        );
      } finally {
        globalThis.tecpeyRedisClient = previousRedis;
      }
    },
  );
});
