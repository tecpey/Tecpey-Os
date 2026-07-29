import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

const repositoryRoot = process.cwd();

describe("Offline Sync telemetry classification", () => {
  it("passes the permanent Offline Sync authority and telemetry classification guard", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/check-offline-sync-authority.mjs"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "test" },
      },
    );
    assert.match(output, /Offline sync authority check passed/);
  });
});
