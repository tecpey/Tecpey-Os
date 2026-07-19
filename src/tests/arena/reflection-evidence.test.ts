import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapArenaReflectionRow,
  type ArenaReflectionRow,
} from "@/lib/trading-arena-reflections";

function reflectionRow(overrides: Partial<ArenaReflectionRow> = {}): ArenaReflectionRow {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    student_id: "11111111-1111-4111-8111-111111111111",
    attempt_id: "22222222-2222-4222-8222-222222222222",
    closed_trade_id: "33333333-3333-4333-8333-333333333333",
    revision: "1",
    decision_review: "مرور تصمیم",
    learned_lesson: "درس معامله",
    emotional_review: "مرور احساس",
    mistake_tags: ["late-entry"],
    next_action_commitment: null,
    evidence_asset: "BTC",
    evidence_realized_pnl: "125.0000000000",
    evidence_realized_pnl_rate: "0.012500000000000000",
    evidence_closure_reason: "take-profit",
    evidence_closed_at: "2026-07-19T06:00:00.000Z",
    evidence_mentor_flags: ["target-hit"],
    created_at: "2026-07-19T06:01:00.000Z",
    updated_at: "2026-07-19T06:02:00.000Z",
    ...overrides,
  };
}

describe("Trading Arena reflection evidence integrity", () => {
  it("accepts PostgreSQL zero padding while preserving engine precision", () => {
    const mapped = mapArenaReflectionRow(reflectionRow());
    assert.equal(mapped.evidence.realizedPnl, "125.0000000000");
    assert.equal(mapped.evidence.realizedPnlRate, "0.01250000");
  });

  it("fails closed when hidden non-zero precision would otherwise be truncated", () => {
    assert.throws(
      () => mapArenaReflectionRow(reflectionRow({
        evidence_realized_pnl_rate: "0.012500009000000000",
      })),
      /arena_reflection_evidence_invalid/,
    );
    assert.throws(
      () => mapArenaReflectionRow(reflectionRow({
        evidence_realized_pnl: "125.000000000010000000",
      })),
      /arena_reflection_evidence_invalid/,
    );
  });

  it("fails closed on duplicate or noncanonical persisted mistake tags", () => {
    assert.throws(
      () => mapArenaReflectionRow(reflectionRow({
        mistake_tags: ["late-entry", "late-entry"],
      })),
      /arena_reflection_row_invalid/,
    );
    assert.throws(
      () => mapArenaReflectionRow(reflectionRow({
        mistake_tags: ["late-entry", "early-exit"],
      })),
      /arena_reflection_row_invalid/,
    );
    assert.deepEqual(
      mapArenaReflectionRow(reflectionRow({
        mistake_tags: ["early-exit", "late-entry"],
      })).mistakeTags,
      ["early-exit", "late-entry"],
    );
  });
});
