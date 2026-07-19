import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createArenaReflectionRequestHash,
  normalizeArenaReflectionMistakeTags,
  parseArenaReflectionInput,
} from "@/lib/trading-arena-reflections";
import {
  createArenaReflectionIdempotencyKey,
  parseArenaReflectionList,
  parseArenaReflectionMutation,
  resolveArenaReflectionIdentity,
  type ArenaReflectionDraft,
} from "@/lib/trading-arena-reflection-client";
import { TRADING_ARENA_REFLECTIONS_SQL } from "@/lib/db-migrate-user-state";

const attemptId = "22222222-2222-4222-8222-222222222222";
const tradeId = "33333333-3333-4333-8333-333333333333";

function draft(overrides: Partial<ArenaReflectionDraft> = {}): ArenaReflectionDraft {
  return {
    decisionReview: "طبق برنامه وارد شدم اما خروج را دیر انجام دادم.",
    learnedLesson: "برای خروج باید از قبل سناریوی روشن داشته باشم.",
    emotionalReview: "در زمان خروج کمی طمع داشتم.",
    mistakeTags: ["late-entry", "early-exit"],
    nextActionCommitment: "قبل از ورود، نقطه خروج را مکتوب می‌کنم.",
    ...overrides,
  };
}

function reflectionPayload() {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    studentId: "11111111-1111-4111-8111-111111111111",
    attemptId,
    closedTradeId: tradeId,
    revision: 2,
    decisionReview: "مرور تصمیم",
    learnedLesson: "درس معامله",
    emotionalReview: "مرور احساس",
    mistakeTags: ["late-entry"],
    nextActionCommitment: null,
    evidence: {
      asset: "BTC",
      realizedPnl: "125.0000000000",
      realizedPnlRate: "0.012500000000000000",
      closureReason: "take-profit",
      closedAt: "2026-07-19T06:00:00.000Z",
      mentorFlags: ["target-hit"],
    },
    createdAt: "2026-07-19T06:01:00.000Z",
    updatedAt: "2026-07-19T06:02:00.000Z",
  };
}

describe("Trading Arena reflection domain authority", () => {
  it("normalizes controlled mistake tags and rejects unsafe combinations", () => {
    assert.deepEqual(
      normalizeArenaReflectionMistakeTags(["late-entry", "early-exit", "late-entry"]),
      ["early-exit", "late-entry"],
    );
    assert.deepEqual(normalizeArenaReflectionMistakeTags(["none"]), ["none"]);
    assert.equal(normalizeArenaReflectionMistakeTags(["none", "late-entry"]), null);
    assert.equal(normalizeArenaReflectionMistakeTags(["invented-tag"]), null);
    assert.equal(normalizeArenaReflectionMistakeTags([]), null);
  });

  it("parses bounded input and hashes the normalized request deterministically", () => {
    const left = parseArenaReflectionInput({
      attemptId,
      closedTradeId: tradeId,
      expectedRevision: 1,
      ...draft({ mistakeTags: ["late-entry", "early-exit"] }),
    });
    const right = parseArenaReflectionInput({
      attemptId,
      closedTradeId: tradeId,
      expectedRevision: 1,
      ...draft({ mistakeTags: ["early-exit", "late-entry"] }),
    });
    assert.ok(left);
    assert.ok(right);
    assert.equal(createArenaReflectionRequestHash(left), createArenaReflectionRequestHash(right));
    assert.deepEqual(left.mistakeTags, ["early-exit", "late-entry"]);
  });

  it("rejects missing narratives, invalid UUIDs and stale negative revisions", () => {
    assert.equal(parseArenaReflectionInput({
      attemptId: "forged",
      closedTradeId: tradeId,
      expectedRevision: 0,
      ...draft(),
    }), null);
    assert.equal(parseArenaReflectionInput({
      attemptId,
      closedTradeId: tradeId,
      expectedRevision: -1,
      ...draft(),
    }), null);
    assert.equal(parseArenaReflectionInput({
      attemptId,
      closedTradeId: tradeId,
      expectedRevision: 0,
      ...draft({ learnedLesson: "   " }),
    }), null);
  });

  it("creates bounded reflection idempotency keys", () => {
    assert.equal(
      createArenaReflectionIdempotencyKey("12345678-1234-4234-8234-123456789012"),
      "arena-reflection:12345678-1234-4234-8234-123456789012",
    );
    assert.throws(
      () => createArenaReflectionIdempotencyKey("short"),
      /arena_reflection_idempotency_entropy_invalid/,
    );
  });

  it("reuses the exact unresolved identity and preserves its original revision", () => {
    const first = resolveArenaReflectionIdentity({
      pending: null,
      attemptId,
      closedTradeId: tradeId,
      expectedRevision: 4,
      draft: draft(),
      entropy: "12345678-1234-4234-8234-123456789012",
    });
    if (first.kind !== "ready") throw new Error("expected ready identity");
    const retry = resolveArenaReflectionIdentity({
      pending: first.identity,
      attemptId,
      closedTradeId: tradeId,
      expectedRevision: 9,
      draft: draft(),
      entropy: "87654321-4321-4321-8321-210987654321",
    });
    if (retry.kind !== "ready") throw new Error("expected exact retry");
    assert.equal(retry.reused, true);
    assert.equal(retry.identity.idempotencyKey, first.identity.idempotencyKey);
    assert.equal(retry.identity.expectedRevision, 4);
  });

  it("blocks changed text, another trade and another attempt while unresolved", () => {
    const first = resolveArenaReflectionIdentity({
      pending: null,
      attemptId,
      closedTradeId: tradeId,
      expectedRevision: 0,
      draft: draft(),
      entropy: "12345678-1234-4234-8234-123456789012",
    });
    if (first.kind !== "ready") throw new Error("expected ready identity");
    assert.equal(resolveArenaReflectionIdentity({
      pending: first.identity,
      attemptId,
      closedTradeId: tradeId,
      expectedRevision: 0,
      draft: draft({ learnedLesson: "متن تغییر کرده است" }),
    }).kind, "blocked");
    assert.equal(resolveArenaReflectionIdentity({
      pending: first.identity,
      attemptId,
      closedTradeId: "55555555-5555-4555-8555-555555555555",
      expectedRevision: 0,
      draft: draft(),
    }).kind, "blocked");
    assert.equal(resolveArenaReflectionIdentity({
      pending: first.identity,
      attemptId: "66666666-6666-4666-8666-666666666666",
      closedTradeId: tradeId,
      expectedRevision: 0,
      draft: draft(),
    }).kind, "blocked");
  });

  it("parses authoritative lists, success responses and revision-conflict details", () => {
    const row = reflectionPayload();
    assert.equal(parseArenaReflectionList({ ok: true, attemptId, reflections: [row] })?.reflections[0]?.revision, 2);
    assert.equal(parseArenaReflectionMutation({ ok: true, attemptId, reflection: row, idempotentReplay: true })?.idempotentReplay, true);
    assert.equal(parseArenaReflectionMutation({
      ok: false,
      error: "revision_conflict",
      details: { attemptId, reflection: row },
    })?.reflection.revision, 2);
  });

  it("rejects malformed or cross-attempt reflection payloads", () => {
    const row = reflectionPayload();
    assert.equal(parseArenaReflectionList({
      ok: true,
      attemptId,
      reflections: [{ ...row, revision: -1 }],
    }), null);
    assert.equal(parseArenaReflectionMutation({
      ok: true,
      attemptId,
      reflection: { ...row, attemptId: "77777777-7777-4777-8777-777777777777" },
    }), null);
  });

  it("registers migration 0022 without rewriting prior migration identifiers", () => {
    const migrationSource = fs.readFileSync("src/lib/db-migrate-user-state.ts", "utf8");
    assert.match(migrationSource, /0021_academy_progress_authority\.sql/);
    assert.match(migrationSource, /0022_trading_arena_reflections\.sql/);
    assert.ok(
      migrationSource.indexOf("0022_trading_arena_reflections.sql") >
        migrationSource.indexOf("0021_academy_progress_authority.sql"),
    );
    assert.match(TRADING_ARENA_REFLECTIONS_SQL, /FOREIGN KEY \(attempt_id, student_id\)/);
    assert.match(TRADING_ARENA_REFLECTIONS_SQL, /UNIQUE \(student_id, attempt_id, closed_trade_id\)/);
    assert.match(TRADING_ARENA_REFLECTIONS_SQL, /academy_trading_arena_reflection_commands/);
    assert.match(TRADING_ARENA_REFLECTIONS_SQL, /request_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
    assert.match(TRADING_ARENA_REFLECTIONS_SQL, /jsonb_array_length\(mistake_tags\) BETWEEN 1 AND 5/);
  });
});
