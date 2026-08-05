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

async function outboxRowsFor(
  principalId: string,
): Promise<Array<{ tenant_id: string; state: string; generation: number }>> {
  const result = await withDb(async (client) => {
    const rows = await client.query<{
      tenant_id: string;
      state: string;
      generation: number;
    }>(
      `SELECT tenant_id, state, generation::integer AS generation
         FROM risk_enforcement_outbox
        WHERE principal_id = $1
        ORDER BY tenant_id, generation`,
      [principalId],
    );
    return rows.rows;
  });
  assert.equal(result.enabled, true, "risk test database must be reachable");
  if (!result.enabled) throw new Error("risk_test_database_unavailable");
  return result.value;
}

async function authorityEventRowsFor(
  principalId: string,
): Promise<Array<{ tenant_id: string; event_key: string }>> {
  const result = await withDb(async (client) => {
    const rows = await client.query<{ tenant_id: string; event_key: string }>(
      `SELECT tenant_id, event_key
         FROM risk_authority_events
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

        // Projection debt is published under the *acting* tenant. Redis is off,
        // so a correctly-published outbox row lands in 'dead_letter'. If the
        // internal publish call dropped the tenant, tenant B's row would be
        // selected under the default tenant and B's own row would stay 'pending'
        // — so asserting B owns terminal outbox rows catches that leak.
        const outbox = await outboxRowsFor(principalId);
        const tenantBOutbox = outbox.filter((r) => r.tenant_id === TENANT_B);
        assert.ok(tenantBOutbox.length >= 1, "tenant B must own its own outbox rows");
        for (const row of tenantBOutbox) {
          assert.notEqual(
            row.state,
            "pending",
            "tenant B's projection debt must be published under tenant B, not left pending",
          );
        }
        assert.ok(
          outbox.some((r) => r.tenant_id === TENANT_A),
          "tenant A must own its own outbox rows",
        );

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

  it(
    "records each tenant's risk_authority_events decision independently: a byte-identical detector under a second tenant does NOT replay the first tenant's decision",
    { skip: !configured, timeout: 30_000 },
    async () => {
      // Isolation proof driven entirely through recordRiskDecision's own
      // insert + conflict read-back path (the production read is
      // `WHERE tenant_id = $1 AND event_key = $2`). If the event identity or that
      // read-back dropped tenant_id, tenant B's byte-identical decision would
      // ON CONFLICT-collide with tenant A's row and read A's event back —
      // reporting replayed=true and silently collapsing B's decision into A's.
      const principalId = `risk-ae-${randomUUID()}`;
      const detectorIdentity = `ae-detector:${randomUUID()}`;
      const previousRedis = globalThis.tecpeyRedisClient;
      globalThis.tecpeyRedisClient = undefined;

      const decision = (tenantId: string) =>
        recordRiskDecision({
          principalId,
          tenantId,
          eventType: "duplicate_request",
          severity: "medium",
          detectorIdentity,
          market: "BTC-USDT",
          detectorFacts: { windowSeconds: 5 },
        });

      try {
        // Tenant A's first decision is fresh.
        const firstA = await decision(TENANT_A);
        assert.equal(firstA.replayed, false, "tenant A's first decision is not a replay");

        // Control: the SAME detector under the SAME tenant DOES replay — this is
        // what proves the replay detection (and thus the read-back) actually
        // works, so tenant B's non-replay below is meaningful and not a fluke.
        const replayA = await decision(TENANT_A);
        assert.equal(
          replayA.replayed,
          true,
          "the same detector under the same tenant must replay via the conflict read-back",
        );

        // Load-bearing: the SAME detector under a DIFFERENT tenant must NOT
        // replay — B derives its own tenant-bound event_key, its insert does not
        // conflict with A's, and the tenant-scoped read-back does not return A's
        // row. A tenant-blind identity or read-back would make this replayed=true.
        const firstB = await decision(TENANT_B);
        assert.equal(
          firstB.replayed,
          false,
          "tenant B's decision must not collapse into or replay tenant A's",
        );

        // Corroboration: both tenants own their own distinct authority-event row.
        const rows = await authorityEventRowsFor(principalId);
        const keyByTenant = new Map(rows.map((r) => [r.tenant_id, r.event_key]));
        assert.deepEqual(
          [...keyByTenant.keys()].sort(),
          [TENANT_A, TENANT_B].sort(),
          "each tenant must own its own risk_authority_events row for the same principal",
        );
        assert.notEqual(
          keyByTenant.get(TENANT_A),
          keyByTenant.get(TENANT_B),
          "each tenant must derive its own tenant-bound event_key",
        );
      } finally {
        globalThis.tecpeyRedisClient = previousRedis;
      }
    },
  );
});
