import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

const repositoryRoot = process.cwd();

describe("Risk enforcement source authority", () => {
  it("passes the permanent PostgreSQL authority guard", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/check-risk-enforcement-authority.mjs"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "test" },
      },
    );
    assert.match(output, /Risk enforcement authority guard passed/);
  });
});
