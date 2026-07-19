import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  arenaCommandFingerprint,
  createArenaIdempotencyKey,
  parseArenaExecutionSnapshot,
  resolveArenaCommandIdentity,
  shouldApplyArenaSnapshot,
  type ArenaExecutionSnapshot,
} from "@/lib/trading-arena-client";
import { createArenaExecutionStateV2 } from "@/lib/trading-arena-execution-v2";

function payload(input?: {
  revision?: number;
  cycleId?: string;
  attemptId?: string;
  observedAt?: string;
  marketStatus?: "available" | "unavailable";
}) {
  const cycleId = input?.cycleId ?? "11111111-1111-4111-8111-111111111111";
  const attemptId = input?.attemptId ?? "22222222-2222-4222-8222-222222222222";
  const observedAt = input?.observedAt ?? "2026-07-19T00:00:00.000Z";
  const state = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
  const market = {
    prices: { BTC: "65000.0000000000", ETH: "3500.0000000000" },
    source: "test-feed",
    observedAt,
  };
  return {
    ok: true,
    account: {
      cycleId,
      status: "active",
      initialBalance: "100000.0000000000",
      availableBalance: "100000.0000000000",
      attemptsTotal: 3,
      attemptsUsed: 0,
      attemptsRemaining: 3,
      currentAttempt: 1,
      revision: input?.revision ?? 0,
      cycleStartedAt: "2026-07-19T00:00:00.000Z",
      cycleEndsAt: "2026-08-18T00:00:00.000Z",
    },
    attempts: [{
      id: attemptId,
      cycleId,
      attemptNumber: 1,
      status: "active",
      startingBalance: "100000.0000000000",
      cashBalance: "100000.0000000000",
      equity: "100000.0000000000",
      startedAt: "2026-07-19T00:00:00.000Z",
      endedAt: null,
    }],
    activeAttempt: {
      id: attemptId,
      cycleId,
      attemptNumber: 1,
      status: "active",
      startingBalance: "100000.0000000000",
      cashBalance: "100000.0000000000",
      equity: "100000.0000000000",
      startedAt: "2026-07-19T00:00:00.000Z",
      endedAt: null,
    },
    state,
    revision: input?.revision ?? 0,
    market,
    projectedEquity: "100000.0000000000",
    marketStatus: input?.marketStatus ?? "available",
  };
}

function parsed(input?: Parameters<typeof payload>[0]): ArenaExecutionSnapshot {
  const result = parseArenaExecutionSnapshot(payload(input));
  assert.ok(result);
  return result;
}

describe("Trading Arena UI authority parser", () => {
  it("accepts the canonical success payload and revision-conflict details", () => {
    const root = parsed({ revision: 2 });
    const conflict = parseArenaExecutionSnapshot({
      ok: false,
      error: "revision_conflict",
      details: payload({ revision: 3 }),
    });

    assert.equal(root.revision, 2);
    assert.equal(conflict?.revision, 3);
    assert.equal(conflict?.marketStatus, "available");
  });

  it("rejects malformed execution state rather than creating browser defaults", () => {
    const invalid = payload();
    invalid.state = { version: 1 } as never;
    assert.equal(parseArenaExecutionSnapshot(invalid), null);
  });

  it("lets a higher database revision win even when its response sequence is older", () => {
    const current = parsed({ revision: 4, observedAt: "2026-07-19T00:00:04.000Z" });
    const incoming = parsed({ revision: 5, observedAt: "2026-07-19T00:00:05.000Z" });
    assert.deepEqual(shouldApplyArenaSnapshot({
      current,
      incoming,
      responseSequence: 8,
      lastAppliedSequence: 9,
    }), { apply: true, nextSequence: 9 });
  });

  it("rejects lower revisions and stale same-revision responses", () => {
    const current = parsed({ revision: 5, observedAt: "2026-07-19T00:00:05.000Z" });
    assert.equal(shouldApplyArenaSnapshot({
      current,
      incoming: parsed({ revision: 4, observedAt: "2026-07-19T00:00:06.000Z" }),
      responseSequence: 10,
      lastAppliedSequence: 9,
    }).apply, false);
    assert.equal(shouldApplyArenaSnapshot({
      current,
      incoming: parsed({ revision: 5, observedAt: "2026-07-19T00:00:04.000Z" }),
      responseSequence: 10,
      lastAppliedSequence: 9,
    }).apply, false);
    assert.equal(shouldApplyArenaSnapshot({
      current,
      incoming: parsed({ revision: 5, observedAt: "2026-07-19T00:00:06.000Z" }),
      responseSequence: 8,
      lastAppliedSequence: 9,
    }).apply, false);
  });

  it("requires a fresh response sequence before switching account authority", () => {
    const current = parsed({ revision: 3 });
    const nextCycle = parsed({
      revision: 0,
      cycleId: "33333333-3333-4333-8333-333333333333",
      attemptId: "44444444-4444-4444-8444-444444444444",
    });
    assert.equal(shouldApplyArenaSnapshot({
      current,
      incoming: nextCycle,
      responseSequence: 7,
      lastAppliedSequence: 8,
    }).apply, false);
    assert.equal(shouldApplyArenaSnapshot({
      current,
      incoming: nextCycle,
      responseSequence: 9,
      lastAppliedSequence: 8,
    }).apply, true);
  });

  it("creates a stable semantic fingerprint regardless of object key order", () => {
    const left = arenaCommandFingerprint({ type: "market_buy", asset: "BTC", quoteAmount: "100", stopLoss: "90" });
    const right = arenaCommandFingerprint({ stopLoss: "90", quoteAmount: "100", asset: "BTC", type: "market_buy" });
    assert.equal(left, right);
  });

  it("creates bounded command-specific idempotency keys", () => {
    assert.equal(
      createArenaIdempotencyKey("market_buy", "12345678-1234-4234-8234-123456789012"),
      "arena-ui:market_buy:12345678-1234-4234-8234-123456789012",
    );
    assert.throws(() => createArenaIdempotencyKey("market_buy", "short"), /arena_idempotency_entropy_invalid/);
  });

  it("reuses an unresolved command identity and preserves its original revision", () => {
    const action = { type: "market_buy", asset: "BTC", quoteAmount: "100" } as const;
    const first = resolveArenaCommandIdentity({
      pending: null,
      attemptId: "attempt-a",
      revision: 7,
      action,
      entropy: "12345678-1234-4234-8234-123456789012",
    });
    if (first.kind !== "ready") throw new Error("expected ready identity");
    const replay = resolveArenaCommandIdentity({
      pending: first.identity,
      attemptId: "attempt-a",
      revision: 9,
      action,
      entropy: "87654321-4321-4321-8321-210987654321",
    });
    if (replay.kind !== "ready") throw new Error("expected replay identity");
    assert.equal(replay.reused, true);
    assert.equal(replay.identity.idempotencyKey, first.identity.idempotencyKey);
    assert.equal(replay.identity.expectedRevision, 7);
    assert.deepEqual(replay.identity.action, action);
  });

  it("blocks a different command while an ambiguous command remains unresolved", () => {
    const pending = resolveArenaCommandIdentity({
      pending: null,
      attemptId: "attempt-a",
      revision: 4,
      action: { type: "close_position", positionId: "position-1" },
      entropy: "12345678-1234-4234-8234-123456789012",
    });
    if (pending.kind !== "ready") throw new Error("expected ready identity");
    const blocked = resolveArenaCommandIdentity({
      pending: pending.identity,
      attemptId: "attempt-a",
      revision: 4,
      action: { type: "refresh_market" },
      entropy: "87654321-4321-4321-8321-210987654321",
    });
    assert.equal(blocked.kind, "blocked");
  });

  it("discards an identity from an old attempt instead of replaying it on a new attempt", () => {
    const pending = resolveArenaCommandIdentity({
      pending: null,
      attemptId: "attempt-a",
      revision: 11,
      action: { type: "cancel_order", orderId: "order-1" },
      entropy: "12345678-1234-4234-8234-123456789012",
    });
    if (pending.kind !== "ready") throw new Error("expected ready identity");
    const next = resolveArenaCommandIdentity({
      pending: pending.identity,
      attemptId: "attempt-b",
      revision: 0,
      action: { type: "refresh_market" },
      entropy: "87654321-4321-4321-8321-210987654321",
    });
    if (next.kind !== "ready") throw new Error("expected new-attempt identity");
    assert.equal(next.reused, false);
    assert.equal(next.identity.attemptId, "attempt-b");
    assert.equal(next.identity.expectedRevision, 0);
    assert.deepEqual(next.identity.action, { type: "refresh_market" });
    assert.notEqual(next.identity.idempotencyKey, pending.identity.idempotencyKey);
  });
});
