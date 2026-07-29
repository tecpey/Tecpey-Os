import { readdirSync, readFileSync } from "node:fs";

const pollIntervalMs = 25;

export function parseLinuxProcessStat(stat) {
  const commandEnd = stat.lastIndexOf(")");
  if (commandEnd < 0) return null;

  const pid = Number.parseInt(stat.slice(0, stat.indexOf(" ")), 10);
  const fields = stat.slice(commandEnd + 2).trim().split(/\s+/);
  const state = fields[0];
  const processGroupId = Number.parseInt(fields[2], 10);
  if (!Number.isInteger(pid) || !state || !Number.isInteger(processGroupId)) {
    return null;
  }
  return { pid, state, processGroupId };
}

export function hasLiveProcessGroupMember(processGroupId, stats) {
  return inspectLinuxProcessGroup(processGroupId, stats).hasLiveMember;
}

export function inspectLinuxProcessGroup(processGroupId, stats) {
  let observed = false;
  for (const stat of stats) {
    const process = parseLinuxProcessStat(stat);
    if (process?.processGroupId !== processGroupId) continue;
    observed = true;
    if (process.state !== "Z" && process.state !== "X") {
      return { observed, hasLiveMember: true };
    }
  }
  return { observed, hasLiveMember: false };
}

const unavailableProcfsCodes = new Set(["ENOENT", "EACCES", "EPERM"]);

function procfsUnavailable(error) {
  return unavailableProcfsCodes.has(error?.code);
}

export function inspectLinuxProcessGroupFromProcfs(
  processGroupId,
  {
    readDirectory = () => readdirSync("/proc", { withFileTypes: true }),
    readStat = (pid) => readFileSync(`/proc/${pid}/stat`, "utf8"),
  } = {},
) {
  let entries;
  try {
    entries = readDirectory();
  } catch (error) {
    if (procfsUnavailable(error)) return null;
    throw error;
  }

  const stats = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    try {
      stats.push(readStat(entry.name));
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ESRCH") continue;
      if (procfsUnavailable(error)) return null;
      throw error;
    }
  }
  const result = inspectLinuxProcessGroup(processGroupId, stats);
  return result.observed ? result.hasLiveMember : null;
}

function linuxProcessGroupExists(processGroupId) {
  return inspectLinuxProcessGroupFromProcfs(processGroupId);
}

function processGroupExists(child) {
  if (!child?.pid) return false;
  if (process.platform === "win32") {
    return child.exitCode === null && child.signalCode === null;
  }
  if (process.platform === "linux") {
    const linuxResult = linuxProcessGroupExists(child.pid);
    if (linuxResult !== null) return linuxResult;
  }

  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

function signalProcessGroup(child, signal) {
  if (!child?.pid || !processGroupExists(child)) return;

  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function waitForProcessGroupExit(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (processGroupExists(child) && Date.now() < deadline) {
    await new Promise((resolvePromise) =>
      setTimeout(resolvePromise, pollIntervalMs),
    );
  }
  return !processGroupExists(child);
}

export async function stopProcessGroup(
  child,
  { gracefulTimeoutMs = 10_000, forceTimeoutMs = 5_000 } = {},
) {
  if (!child?.pid || !processGroupExists(child)) return;

  signalProcessGroup(child, "SIGTERM");
  if (await waitForProcessGroupExit(child, gracefulTimeoutMs)) return;

  signalProcessGroup(child, "SIGKILL");
  if (await waitForProcessGroupExit(child, forceTimeoutMs)) return;

  throw new Error(
    `process_group_shutdown_timeout:pid=${child.pid}:` +
      `leader_exit=${child.exitCode ?? "running"}:` +
      `leader_signal=${child.signalCode ?? "none"}`,
  );
}

export async function waitForProcessGroupCompletion(
  child,
  {
    timeoutMs,
    stop = stopProcessGroup,
    onTimeout = () => {},
    onError = () => {},
    onExit = () => {},
    onShutdownError = () => {},
  },
) {
  return await new Promise((resolvePromise) => {
    let settled = false;
    let timedOut = false;
    let shutdownStarted = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolvePromise(code);
    };
    const finishAfterShutdown = (code) => {
      if (settled || shutdownStarted) return;
      shutdownStarted = true;
      clearTimeout(timeout);
      void Promise.resolve()
        .then(() => stop(child))
        .then(
          () => finish(code),
          (error) => {
            onShutdownError(error);
            finish(1);
          },
        );
    };

    const timeout = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      onTimeout();
      finishAfterShutdown(1);
    }, timeoutMs);
    timeout.unref?.();

    child.once("error", (error) => {
      onError(error);
      if (!timedOut) finish(1);
    });
    child.once("exit", (code, signal) => {
      onExit(code, signal);
      if (!timedOut) finishAfterShutdown(signal ? 1 : (code ?? 1));
    });
  });
}

export async function stopServerAndWaitForRedisDrain(
  child,
  redisNodeObserver,
  { process: processOptions, redis: redisOptions } = {},
) {
  if (!child?.pid) return;

  const results = await Promise.allSettled([
    stopProcessGroup(child, processOptions),
    redisNodeObserver?.waitForDrain(redisOptions),
  ]);
  const failures = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);
  if (failures.length > 0) {
    throw new AggregateError(failures, "Browser QA server isolation failed");
  }
}
