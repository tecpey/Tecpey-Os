import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { processAiAutomationIteration } from "../src/lib/ai/automation-worker";

function boundedIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name.toLowerCase()}_invalid`);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name.toLowerCase()}_out_of_range`);
  }
  return parsed;
}

if (process.env.AI_AUTOMATION_WORKER_ENABLED !== "true") {
  throw new Error("ai_automation_worker_disabled");
}

const workerId = `ai-automation:${hostname()}:${process.pid}:${randomUUID()}`;
const pollMs = boundedIntegerEnv("AI_AUTOMATION_POLL_MS", 2_000, 500, 30_000);
const runOnce = process.env.AI_AUTOMATION_RUN_ONCE === "true";
let stopping = false;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stop(signal: string): void {
  if (stopping) return;
  stopping = true;
  console.log("[ai-automation-worker] stopping", { signal, workerId });
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

async function run(): Promise<void> {
  console.log("[ai-automation-worker] started", { workerId, pollMs, runOnce });
  do {
    try {
      const result = await processAiAutomationIteration({ workerId });
      if (result.status !== "idle" || result.recovered > 0) {
        console.log("[ai-automation-worker] iteration", result);
      }
      if (runOnce) break;
      if (result.status === "idle") await sleep(pollMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[ai-automation-worker] iteration failed", { message });
      if (runOnce) throw error;
      await sleep(Math.max(1_000, pollMs));
    }
  } while (!stopping);
  console.log("[ai-automation-worker] stopped", { workerId });
}

void run().catch((error) => {
  console.error("[ai-automation-worker] fatal", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
