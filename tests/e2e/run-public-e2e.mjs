import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const e2eRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(e2eRoot, "../..");
const playwrightCli = resolve(e2eRoot, "node_modules/@playwright/test/cli.js");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const runtimeMode =
  process.env.TECPEY_E2E_RUNTIME_MODE === "development"
    ? "development"
    : "production";
const port = process.env.TECPEY_E2E_PORT ?? "3100";
const host = "127.0.0.1";
const baseURL = process.env.TECPEY_E2E_BASE_URL ?? `http://${host}:${port}`;
const serverScript = runtimeMode === "production" ? "start" : "dev";
const outputLimit = 240_000;
const projectTimeoutMs = 90_000;
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

function killProcessGroup(child, signal) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function spawnServer(onOutput) {
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
        process.env.NEXT_PUBLIC_API_BACKEND_URL || baseURL,
      NEXT_PUBLIC_API_SOCKET_URL:
        process.env.NEXT_PUBLIC_API_SOCKET_URL || `ws://${host}:${port}/ws`,
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
        runtimeMode === "production"
          ? process.env.REDIS_URL || "redis://127.0.0.1:6379"
          : process.env.REDIS_URL || "",
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

async function stopServer(server) {
  if (!server || server.exitCode !== null) return;

  killProcessGroup(server, "SIGTERM");
  await Promise.race([
    new Promise((resolvePromise) => server.once("exit", resolvePromise)),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 10_000)),
  ]);

  if (server.exitCode === null) {
    killProcessGroup(server, "SIGKILL");
    await Promise.race([
      new Promise((resolvePromise) => server.once("exit", resolvePromise)),
      new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000)),
    ]);
  }
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

  return await new Promise((resolvePromise) => {
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolvePromise(code);
    };

    const timeout = setTimeout(() => {
      onOutput(
        `Playwright project ${project} exceeded ${projectTimeoutMs}ms and was terminated.\n`,
      );
      killProcessGroup(child, "SIGTERM");
      setTimeout(() => killProcessGroup(child, "SIGKILL"), 5_000).unref?.();
      finish(1);
    }, projectTimeoutMs);
    timeout.unref?.();

    child.once("error", (error) => {
      onOutput(`Playwright process error: ${error.stack || error.message}\n`);
      finish(1);
    });
    child.once("exit", (code, signal) => {
      onOutput(
        `Playwright process exit: code=${code ?? "null"} signal=${signal ?? "none"}\n`,
      );
      finish(signal ? 1 : (code ?? 1));
    });
  });
}

let failed = false;

for (const project of projects) {
  let serverOutput = "";
  let playwrightOutput = "";
  let server;

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
    server = spawnServer(appendServerOutput);
    await waitForServer(server, () => serverOutput);
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
    await stopServer(server);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
}

if (failed) process.exitCode = 1;
