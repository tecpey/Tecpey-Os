import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  stopServerAndWaitForRedisDrain,
  waitForProcessGroupCompletion,
} from "./process-lifecycle.mjs";
import { createRedisWebNodeObserver } from "./redis-node-isolation.mjs";
import { startRedisRestStub } from "./redis-rest-stub.mjs";

const e2eRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(e2eRoot, "../..");
const playwrightCli = resolve(e2eRoot, "node_modules/@playwright/test/cli.js");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const runtimeMode =
  process.env.TECPEY_E2E_RUNTIME_MODE === "development"
    ? "development"
    : "production";
const port = process.env.TECPEY_E2E_PORT ?? "3100";
const redisRestPort = Number.parseInt(
  process.env.TECPEY_E2E_REDIS_REST_PORT ?? "3199",
  10,
);
const redisRestToken =
  process.env.UPSTASH_REDIS_REST_TOKEN ??
  "deterministic-browser-qa-redis-rest-token";
const runtimeRedisUrl =
  runtimeMode === "production"
    ? process.env.REDIS_URL || "redis://127.0.0.1:6379"
    : process.env.REDIS_URL || "";
const host = "127.0.0.1";
const baseURL = process.env.TECPEY_E2E_BASE_URL ?? `http://${host}:${port}`;
// Identifies this invocation across the per-project Playwright processes. See
// where it is passed into the child environment for what it protects.
const runId = `${process.pid.toString(36)}-${Date.now().toString(36)}`;
const serverScript = runtimeMode === "production" ? "start" : "dev";
const outputLimit = 240_000;
// Playwright's own per-test timeout is 90s (playwright.config.mjs). This value
// is the runner's whole-project backstop for a genuinely wedged `playwright
// test` process — it bounds an entire project run (all of its tests), so it
// must sit comfortably ABOVE the sum of the per-test budgets for one project
// (currently up to ~5 tests × 90s). When it was itself 90s, a single legitimately slow
// test on a loaded mobile-emulated runner (e.g. firefox-en-mobile) could eat
// the whole project budget, and this backstop SIGKILLed the entire run — losing
// the report and failing — before Playwright's own per-test timeout could fail
// just that test gracefully. Kept as a true last-resort backstop: 5×90s + 60s.
const perTestTimeoutMs = 90_000;
const maxTestsPerProject = 5;
const projectTimeoutMs = perTestTimeoutMs * maxTestsPerProject + 60_000;
const projects = [
  "chromium-fa-mobile",
  "chromium-en-desktop",
  "firefox-fa-desktop",
  "firefox-en-mobile",
];

function boundedAppend(current, chunk) {
  return `${current}${String(chunk)}`.slice(-outputLimit);
}

function persistDiagnostics(project, serverOutput, playwrightOutput) {
  writeFileSync(
    resolve(e2eRoot, `server-output-${project}.log`),
    serverOutput || "TecPey server emitted no captured stdout/stderr.\n",
    "utf8",
  );
  writeFileSync(
    resolve(e2eRoot, `playwright-output-${project}.log`),
    playwrightOutput || "Playwright emitted no captured stdout/stderr.\n",
    "utf8",
  );
}

async function fetchWithDeadline(url, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: { Accept: "application/json, */*;q=0.8" },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function spawnServer(onOutput, redisRestUrl) {
  const child = spawn(npmCommand, ["run", serverScript], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      NODE_ENV: runtimeMode,
      PORT: port,
      TECPEY_BIND_HOST: host,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || baseURL,
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || baseURL,
      NEXT_PUBLIC_API_BACKEND_URL:
        process.env.NEXT_PUBLIC_API_BACKEND_URL ||
        (runtimeMode === "production"
          ? "https://api.e2e.tecpey.test"
          : baseURL),
      NEXT_PUBLIC_API_SOCKET_URL:
        process.env.NEXT_PUBLIC_API_SOCKET_URL ||
        (runtimeMode === "production"
          ? "wss://stream.e2e.tecpey.test/ws"
          : `ws://${host}:${port}/ws`),
      TECPEY_SESSION_SECRET:
        process.env.TECPEY_SESSION_SECRET ||
        "e2e-session-secret-32-characters-minimum",
      TECPEY_REFRESH_SECRET:
        process.env.TECPEY_REFRESH_SECRET ||
        "e2e-refresh-secret-32-characters-minimum",
      TECPEY_ACADEMY_AUTH_SECRET:
        process.env.TECPEY_ACADEMY_AUTH_SECRET ||
        "e2e-academy-auth-secret-32-characters",
      CERTIFICATE_SIGNING_SECRET:
        process.env.CERTIFICATE_SIGNING_SECRET ||
        "e2e-certificate-secret-32-characters",
      TECPEY_WITHDRAWAL_PRICE_SECRET:
        process.env.TECPEY_WITHDRAWAL_PRICE_SECRET ||
        "e2e-withdrawal-price-secret-32-characters",
      TECPEY_OFFLINE_SYNC_SECRET:
        process.env.TECPEY_OFFLINE_SYNC_SECRET ||
        "e2e-offline-sync-secret-32-characters",
      REDIS_URL:
        runtimeRedisUrl,
      UPSTASH_REDIS_REST_URL: redisRestUrl,
      UPSTASH_REDIS_REST_TOKEN: redisRestToken,
    },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (chunk) => {
    onOutput(chunk);
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    onOutput(chunk);
    process.stderr.write(chunk);
  });
  return child;
}

async function waitForServer(server, getOutput) {
  const deadline = Date.now() + 120_000;
  let lastError = new Error("server_not_started");

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `TecPey Browser QA server exited with ${server.exitCode}.\n${getOutput()}`,
      );
    }

    try {
      const response = await fetchWithDeadline(`${baseURL}/api/health`);
      if (response.status === 200) {
        await response.body?.cancel();
        return;
      }
      lastError = new Error(`health returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }

  throw new Error(
    `TecPey Browser QA server did not become ready: ${lastError}.\n${getOutput()}`,
  );
}

async function runPlaywrightProject(project, onOutput) {
  const child = spawn(
    process.execPath,
    [
      playwrightCli,
      "test",
      "--config=playwright.config.mjs",
      `--project=${project}`,
    ],
    {
      cwd: e2eRoot,
      env: {
        ...process.env,
        TECPEY_E2E_BASE_URL: baseURL,
        TECPEY_E2E_PROJECT: project,
        // One identifier shared by all four projects of this invocation. The
        // QA-051 collector refuses to merge shards that do not name the same
        // run, which is what stops a shard left behind by an earlier, partial
        // run from being folded into a later bundle.
        TECPEY_A11Y_RUN_ID: runId,
      },
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout?.on("data", (chunk) => {
    onOutput(chunk);
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    onOutput(chunk);
    process.stderr.write(chunk);
  });

  return await waitForProcessGroupCompletion(child, {
    timeoutMs: projectTimeoutMs,
    onTimeout() {
      onOutput(
        `Playwright project ${project} exceeded ${projectTimeoutMs}ms and was terminated.\n`,
      );
    },
    onError(error) {
      onOutput(`Playwright process error: ${error.stack || error.message}\n`);
    },
    onExit(code, signal) {
      onOutput(
        `Playwright process exit: code=${code ?? "null"} signal=${signal ?? "none"}\n`,
      );
    },
    onShutdownError(error) {
      const message = `Playwright process-group shutdown failed for ${project}: ${
        error.stack || error.message
      }`;
      onOutput(`${message}\n`);
      // Also print to the live job log. A shutdown failure no longer fails an
      // already-green run, but the *-output.log artifacts are uploaded only on
      // job failure (`if: failure()`), so the buffered record would otherwise be
      // lost on exactly the passing-leak case this needs to stay visible for.
      console.warn(message);
    },
  });
}

let activeServer;
let redisRestStub;
let redisNodeObserver;
let cleanupPromise;

async function stopActiveServer() {
  const server = activeServer;
  activeServer = undefined;
  await stopServerAndWaitForRedisDrain(server, redisNodeObserver);
}

async function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    const serverResult = await Promise.allSettled([stopActiveServer()]);
    redisNodeObserver?.close();
    redisNodeObserver = undefined;
    const stubResult = await Promise.allSettled([redisRestStub?.stop()]);
    redisRestStub = undefined;
    const failures = [...serverResult, ...stubResult]
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures, "Browser QA cleanup failed");
    }
  })();
  return cleanupPromise;
}

for (const [signal, exitCode] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.once(signal, () => {
    void cleanup().then(
      () => process.exit(exitCode),
      (error) => {
        console.error(error);
        process.exit(exitCode);
      },
    );
  });
}

async function run() {
  let failed = false;
  redisRestStub = await startRedisRestStub({
    port: redisRestPort,
    token: redisRestToken,
  });
  console.log(
    `Browser QA: authenticated Redis REST stub ready on ${redisRestStub.url}.`,
  );
  if (runtimeRedisUrl) {
    redisNodeObserver = await createRedisWebNodeObserver(runtimeRedisUrl);
    await redisNodeObserver.waitForDrain();
    console.log("Browser QA: Redis web-node registry is empty.");
  }

  for (const project of projects) {
    let serverOutput = "";
    let playwrightOutput = "";

    const appendServerOutput = (chunk) => {
      serverOutput = boundedAppend(serverOutput, chunk);
    };
    const appendPlaywrightOutput = (chunk) => {
      playwrightOutput = boundedAppend(playwrightOutput, chunk);
    };

    try {
      console.log(
        `Browser QA: starting isolated ${runtimeMode} server for ${project} on ${baseURL}.`,
      );
      activeServer = spawnServer(appendServerOutput, redisRestStub.url);
      await waitForServer(activeServer, () => serverOutput);
      console.log(`Browser QA: server ready; running ${project}.`);

      const exitCode = await runPlaywrightProject(project, appendPlaywrightOutput);
      if (exitCode !== 0) failed = true;
    } catch (error) {
      const diagnostic =
        error instanceof Error ? error.stack || error.message : String(error);
      appendPlaywrightOutput(`Browser QA infrastructure error: ${diagnostic}\n`);
      console.error(diagnostic);
      failed = true;
    } finally {
      persistDiagnostics(project, serverOutput, playwrightOutput);
      await stopActiveServer();
      console.log(`Browser QA: ${project} process and Redis isolation complete.`);
    }
  }

  if (failed) process.exitCode = 1;
}

try {
  await run();
} catch (error) {
  console.error(
    `Browser QA infrastructure error: ${error instanceof Error ? error.stack || error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
