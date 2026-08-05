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

// A tenant-scoped existence read — mirrors the authority's own
// `WHERE tenant_id = $1 AND event_key = $2` decision lookup.
async function authorityEventExists(
  tenantId: string,
  eventKey: string,
): Promise<boolean> {
  const result = await withDb(async (client) => {
    const rows = await client.query<{ one: number }>(
      `SELECT 1 AS one FROM risk_authority_events
        WHERE tenant_id = $1 AND event_key = $2 LIMIT 1`,
      [tenantId, eventKey],
    );
    return rows.rows.length > 0;
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
    "keeps each tenant's risk_authority_events isolated: distinct per-tenant rows and a tenant-scoped read that hides the other tenant's decision",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const principalId = `risk-ae-${randomUUID()}`;
      const detectorIdentity = `ae-detector:${randomUUID()}`;
      const previousRedis = globalThis.tecpeyRedisClient;
      globalThis.tecpeyRedisClient = undefined;

      try {
        // The SAME principal + byte-identical detector, recorded under two tenants.
        await recordRiskDecision({
          principalId,
          tenantId: TENANT_A,
          eventType: "duplicate_request",
          severity: "medium",
          detectorIdentity,
          market: "BTC-USDT",
          detectorFacts: { windowSeconds: 5 },
        });
        await recordRiskDecision({
          principalId,
          tenantId: TENANT_B,
          eventType: "duplicate_request",
          severity: "medium",
          detectorIdentity,
          market: "BTC-USDT",
          detectorFacts: { windowSeconds: 5 },
        });

        // Each tenant owns its own authority-event row for this principal, and —
        // because the event identity binds the tenant — a distinct event_key.
        const rows = await authorityEventRowsFor(principalId);
        const keyByTenant = new Map(rows.map((r) => [r.tenant_id, r.event_key]));
        assert.deepEqual(
          [...keyByTenant.keys()].sort(),
          [TENANT_A, TENANT_B].sort(),
          "each tenant must own its own risk_authority_events row for the same principal",
        );
        const keyA = keyByTenant.get(TENANT_A)!;
        const keyB = keyByTenant.get(TENANT_B)!;
        assert.notEqual(keyA, keyB, "each tenant must derive its own event_key");

        // The load-bearing read predicate: a decision is visible ONLY under its
        // own tenant. A tenant-blind `WHERE event_key = $1` read would hand
        // tenant B tenant A's risk decision (and vice versa) — exactly the
        // cross-tenant leak the `WHERE tenant_id = $1` scope closes.
        assert.equal(await authorityEventExists(TENANT_A, keyA), true);
        assert.equal(
          await authorityEventExists(TENANT_B, keyA),
          false,
          "tenant B must not see tenant A's risk decision even by its event_key",
        );
        assert.equal(
          await authorityEventExists(TENANT_A, keyB),
          false,
          "tenant A must not see tenant B's risk decision even by its event_key",
        );
      } finally {
        globalThis.tecpeyRedisClient = previousRedis;
      }
    },
  );
});
