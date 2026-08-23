import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const runtimeNodePath = path.join(root, "scripts", "runtime-stubs");

const serverOnlyCommands = {
  "community:challenge:finalize":
    "NODE_PATH=scripts/runtime-stubs node --conditions=react-server --import tsx scripts/finalize-community-journal-challenges.ts",
  "community:challenge:finalize:scheduled":
    "NODE_PATH=scripts/runtime-stubs node --conditions=react-server --import tsx scripts/run-community-challenge-finalization-scheduled.ts",
  "ops:alerts:deliver":
    "NODE_PATH=scripts/runtime-stubs node --conditions=react-server --import tsx scripts/deliver-operational-alerts.ts",
  "ops:staging:evidence:collect":
    "NODE_PATH=scripts/runtime-stubs node --conditions=react-server --import tsx scripts/collect-community-challenge-scheduler-host-evidence.ts",
};

test("server-only CLI entrypoints pin the isolated Node server runtime", async () => {
  const stub = await readFile(path.join(runtimeNodePath, "server-only", "index.js"), "utf8");
  assert.match(stub, /module\.exports = \{\};/);
  for (const [name, command] of Object.entries(serverOnlyCommands)) {
    assert.equal(packageJson.scripts?.[name], command, `${name} must keep the server-only runtime`);
  }
});

test("staging collector resolves every server-only import before validating input", () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("TECPEY_")),
  );
  delete env.NODE_OPTIONS;
  env.NODE_PATH = runtimeNodePath;

  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/collect-community-challenge-scheduler-host-evidence.ts",
    ],
    {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  assert.equal(result.status, 1);
  assert.doesNotMatch(output, /MODULE_NOT_FOUND|Cannot find module/);
  assert.match(output, /"error":"tecpey_evidence_environment_required"/);
});
