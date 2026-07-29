const pollIntervalMs = 25;

function processGroupExists(child) {
  if (!child?.pid) return false;
  if (process.platform === "win32") {
    return child.exitCode === null && child.signalCode === null;
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

  throw new Error(`process_group_shutdown_timeout:${child.pid}`);
}
