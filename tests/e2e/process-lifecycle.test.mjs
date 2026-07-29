import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { stopProcessGroup } from "./process-lifecycle.mjs";

const windows = process.platform === "win32";

function spawnDelayedDescendantGroup(delayMs) {
  const descendantSource = `
    process.on("SIGTERM", () => setTimeout(() => process.exit(0), ${delayMs}));
    process.stdout.write("ready\\n");
    setInterval(() => {}, 1000);
  `;
  const leaderSource = `
    const { spawn } = require("node:child_process");
    const descendant = spawn(process.execPath, ["-e", ${JSON.stringify(descendantSource)}], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    descendant.stdout.once("data", (chunk) => process.stdout.write(chunk));
    process.on("SIGTERM", () => process.exit(0));
    process.stdin.resume();
  `;

  return spawn(process.execPath, ["-e", leaderSource], {
    detached: !windows,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForReady(child) {
  await new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("process_group_fixture_start_timeout")),
      5_000,
    );
    child.once("error", reject);
    child.stdout?.once("data", (chunk) => {
      if (!String(chunk).includes("ready")) {
        reject(new Error(`unexpected_fixture_output:${chunk}`));
        return;
      }
      clearTimeout(timeout);
      resolvePromise();
    });
  });
}

test(
  "waits for descendants after the process-group leader exits",
  { skip: windows },
  async () => {
    const descendantDelayMs = 300;
    const child = spawnDelayedDescendantGroup(descendantDelayMs);
    await waitForReady(child);

    const startedAt = Date.now();
    await stopProcessGroup(child, {
      gracefulTimeoutMs: 2_000,
      forceTimeoutMs: 1_000,
    });

    assert.ok(
      Date.now() - startedAt >= descendantDelayMs - 50,
      "shutdown returned before the delayed descendant exited",
    );
  },
);

test("escalates to SIGKILL within a bounded deadline", { skip: windows }, async () => {
  const child = spawn(
    process.execPath,
    [
      "-e",
      "process.on('SIGTERM', () => {}); process.stdout.write('ready\\n'); setInterval(() => {}, 1000)",
    ],
    {
      detached: true,
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  await waitForReady(child);

  const startedAt = Date.now();
  await stopProcessGroup(child, {
    gracefulTimeoutMs: 100,
    forceTimeoutMs: 1_000,
  });

  const elapsedMs = Date.now() - startedAt;
  assert.ok(elapsedMs >= 75, "SIGKILL escalation happened before the grace window");
  assert.ok(elapsedMs < 1_000, "bounded shutdown exceeded its force deadline");
});
