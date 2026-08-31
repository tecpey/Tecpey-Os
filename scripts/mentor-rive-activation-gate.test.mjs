import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateActivationState } from "./check-mentor-rive-activation-gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the repository keeps the honest static fallback until accepted activation", async () => {
  const result = await evaluateActivationState(ROOT);
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.activationDetected, false);
  assert.equal(result.mode, "static_fallback");
});
