import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

describe("Withdrawal execution evidence governance", () => {
  it("runs the permanent execution-attempt authority guard", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/check-withdrawal-execution-evidence.mjs"],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
        timeout: 30_000,
      },
    );

    assert.equal(
      result.status,
      0,
      [result.stdout, result.stderr].filter(Boolean).join("\n"),
    );
  });
});
