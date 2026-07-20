import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

const repositoryRoot = process.cwd();

describe("Academy account credential source authority", () => {
  it("passes the permanent transaction and route boundary guard", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/check-academy-account-authority.mjs"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "test" },
      },
    );
    assert.match(output, /Academy account authority guard passed/);
  });
});
