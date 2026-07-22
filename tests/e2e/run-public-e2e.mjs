import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const e2eRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(e2eRoot, "../..");
const playwrightCli = resolve(e2eRoot, "node_modules/@playwright/test/cli.js");
const serverLogPath = resolve(e2eRoot, "server-output.log");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const port = process.env.TECPEY_E2E_PORT ?? "3100";
const baseURL = process.env.TECPEY_E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

let serverOutput = "";
let server;

function appendServerOutput(chunk) {
  serverOutput = `${serverOutput}${String(chunk)}`.slice(-80_000);
}

function persistServerOutput() {
  writeFileSync(
    serverLogPath,
    serverOutput || "TecPey server emitted no captured stdout/stderr.\n",
    "utf8",
  );
}

function stopServer() {
  if (!server || server.killed) return;
  try {
    if (process.platform === "win32") server.kill("SIGTERM");
    else process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
}

async function fetchWithDeadline(url, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: { Accept: "text/html, */*;q=0.8" },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  let lastError = new Error("server_not_started");

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `TecPey Browser QA server exited with ${server.exitCode}.\n${serverOutput}`,
      );
    }

    try {
      const response = await fetchWithDeadline(`${baseURL}/`);
      if (response.status === 200) {
        await response.body?.cancel();
        return;
      }
      lastError = new Error(`root returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }

  throw new Error(
    `TecPey Browser QA server did not become ready: ${lastError}.\n${serverOutput}`,
  );
}

async function runPlaywright() {
  const child = spawn(
    process.execPath,
    [playwrightCli, "test", "--config=playwright.config.mjs"],
    {
      cwd: e2eRoot,
      env: {
        ...process.env,
        TECPEY_E2E_BASE_URL: baseURL,
      },
      stdio: "inherit",
    },
  );

  return await new Promise((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (signal) {
        rejectPromise(new Error(`Playwright terminated by ${signal}`));
        return;
      }
      resolvePromise(code ?? 1);
    });
  });
}

try {
  console.log(`Browser QA: starting isolated TecPey server on ${baseURL}.`);
  server = spawn(npmCommand, ["run", "dev"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: port,
      NEXT_PUBLIC_SITE_URL: baseURL,
      REDIS_URL: "",
      NEXT_PUBLIC_API_URL: "",
      NEXT_PUBLIC_API_BACKEND_URL: "",
      NEXT_PUBLIC_API_SOCKET_URL: "",
      NEXT_PUBLIC_EXTRA_CONNECT_SRC: "",
      TECPEY_SESSION_SECRET: "e2e-session-secret-32-characters-minimum",
      TECPEY_REFRESH_SECRET: "e2e-refresh-secret-32-characters-minimum",
      TECPEY_ACADEMY_AUTH_SECRET: "e2e-academy-auth-secret-32-characters",
      CERTIFICATE_SIGNING_SECRET: "e2e-certificate-secret-32-characters",
      TECPEY_WITHDRAWAL_PRICE_SECRET: "e2e-withdrawal-price-secret-32-characters",
      TECPEY_OFFLINE_SYNC_SECRET: "e2e-offline-sync-secret-32-characters",
    },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout?.on("data", appendServerOutput);
  server.stderr?.on("data", appendServerOutput);

  await waitForServer();
  console.log("Browser QA: TecPey server is ready; starting Playwright.");
  const exitCode = await runPlaywright();
  if (exitCode !== 0) process.exitCode = exitCode;
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  if (serverOutput) console.error(`\nTecPey server output:\n${serverOutput}`);
  process.exitCode = 1;
} finally {
  persistServerOutput();
  stopServer();
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
}
