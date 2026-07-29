import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import {
  hasLiveProcessGroupMember,
  parseLinuxProcessStat,
  stopProcessGroup,
  stopServerAndWaitForRedisDrain,
  waitForProcessGroupCompletion,
} from "./process-lifecycle.mjs";

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

function forceKillFixture(child) {
  if (!child?.pid || windows) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

test("parses Linux process stats without trusting the command field", () => {
  assert.deepEqual(
    parseLinuxProcessStat("42 (next server (qa)) S 1 123 123 0 -1"),
    { pid: 42, state: "S", processGroupId: 123 },
  );
});

test("treats zombie-only Linux process groups as stopped", () => {
  const zombieStats = [
    "42 (npm exec next) Z 1 123 123 0 -1",
    "43 (next-server) X 1 123 123 0 -1",
    "44 (unrelated) S 1 999 999 0 -1",
  ];
  assert.equal(hasLiveProcessGroupMember(123, zombieStats), false);
  assert.equal(
    hasLiveProcessGroupMember(123, [
      ...zombieStats,
      "45 (live descendant) S 1 123 123 0 -1",
    ]),
    true,
  );
});

test(
  "waits for descendants after the process-group leader exits",
  { skip: windows },
  async () => {
    const descendantDelayMs = 300;
    const child = spawnDelayedDescendantGroup(descendantDelayMs);
    try {
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
    } finally {
      forceKillFixture(child);
    }
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
  try {
    await waitForReady(child);

    const startedAt = Date.now();
    await stopProcessGroup(child, {
      gracefulTimeoutMs: 100,
      forceTimeoutMs: 1_000,
    });

    const elapsedMs = Date.now() - startedAt;
    assert.ok(elapsedMs >= 75, "SIGKILL escalation happened before the grace window");
    assert.ok(elapsedMs < 1_000, "bounded shutdown exceeded its force deadline");
  } finally {
    forceKillFixture(child);
  }
});

test("a timed-out child resolves only after process-group shutdown settles", async () => {
  const child = new EventEmitter();
  let releaseShutdown;
  const shutdown = new Promise((resolvePromise) => {
    releaseShutdown = resolvePromise;
  });
  let completed = false;

  const completion = waitForProcessGroupCompletion(child, {
    timeoutMs: 1,
    stop: async () => shutdown,
  }).then((code) => {
    completed = true;
    return code;
  });

  await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  child.emit("exit", null, "SIGTERM");
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.equal(
    completed,
    false,
    "the next project became eligible while timed-out descendants were still stopping",
  );

  releaseShutdown();
  assert.equal(await completion, 1);
  assert.equal(completed, true);
});

test("a non-timeout leader exit resolves only after process-group shutdown settles", async () => {
  const child = new EventEmitter();
  let releaseShutdown;
  const shutdown = new Promise((resolvePromise) => {
    releaseShutdown = resolvePromise;
  });
  let stopCalls = 0;
  let completed = false;

  const completion = waitForProcessGroupCompletion(child, {
    timeoutMs: 1_000,
    stop: async () => {
      stopCalls += 1;
      await shutdown;
    },
  }).then((code) => {
    completed = true;
    return code;
  });

  child.emit("exit", 0, null);
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.equal(stopCalls, 1);
  assert.equal(
    completed,
    false,
    "the next project became eligible while normal-exit descendants were still stopping",
  );

  releaseShutdown();
  assert.equal(await completion, 0);
  assert.equal(completed, true);
});

test("a non-timeout process-group shutdown failure fails the project", async () => {
  const child = new EventEmitter();
  const shutdownError = new Error("descendant_still_running");
  let observedShutdownError;
  const completion = waitForProcessGroupCompletion(child, {
    timeoutMs: 1_000,
    stop: async () => {
      throw shutdownError;
    },
    onShutdownError(error) {
      observedShutdownError = error;
    },
  });

  child.emit("exit", 0, null);
  assert.equal(await completion, 1);
  assert.equal(observedShutdownError, shutdownError);
});

test("cleanup skips Redis drain when no server process was started", async () => {
  let drainCalls = 0;
  const redisNodeObserver = {
    async waitForDrain() {
      drainCalls += 1;
    },
  };

  await stopServerAndWaitForRedisDrain(undefined, redisNodeObserver);
  assert.equal(drainCalls, 0);
});

test(
  "does not permit the next server until descendants and Redis both drain",
  { skip: windows },
  async () => {
    const child = spawnDelayedDescendantGroup(200);
    try {
      await waitForReady(child);
      let redisDrained = false;
      let isolationComplete = false;
      const redisNodeObserver = {
        async waitForDrain() {
          await new Promise((resolvePromise) => setTimeout(resolvePromise, 350));
          redisDrained = true;
        },
      };

      const isolation = stopServerAndWaitForRedisDrain(child, redisNodeObserver, {
        process: { gracefulTimeoutMs: 2_000, forceTimeoutMs: 1_000 },
      }).then(() => {
        isolationComplete = true;
      });

      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
      assert.equal(
        isolationComplete,
        false,
        "the next server became eligible before delayed deregistration",
      );

      await isolation;
      assert.equal(redisDrained, true);
      assert.equal(
        isolationComplete,
        true,
        "the next server must become eligible only after full isolation",
      );
    } finally {
      forceKillFixture(child);
    }
  },
);
