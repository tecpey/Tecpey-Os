import assert from "node:assert/strict";
import test from "node:test";
import { createArenaExecutionStateV2 } from "../../lib/trading-arena-execution-v2";
import { normalizeArenaReflectionExecutionState } from "../../lib/trading-arena-reflection-state";

test("fresh Arena reflection attempts materialize the canonical Execution V2 state", () => {
  const state = normalizeArenaReflectionExecutionState({}, "100000");

  assert.equal(state.version, 2);
  assert.equal(state.initialBalance, "100000.0000000000");
  assert.equal(state.cashBalance, "100000.0000000000");
  assert.deepEqual(state.openPositions, []);
  assert.deepEqual(state.pendingOrders, []);
  assert.deepEqual(state.closedTrades, []);
});

test("persisted Arena reflection attempts still pass strict Execution V2 validation", () => {
  const persisted = createArenaExecutionStateV2("75000");
  assert.deepEqual(
    normalizeArenaReflectionExecutionState(persisted, "100000"),
    persisted,
  );
});

test("malformed non-empty reflection execution state remains fail-closed", () => {
  assert.throws(
    () => normalizeArenaReflectionExecutionState({ version: 2 }, "100000"),
    /arena_execution_state_invalid/,
  );
});
