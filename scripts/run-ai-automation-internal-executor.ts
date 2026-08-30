import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { completeNextApprovedNoEffectAiAutomationRun } from "../src/lib/ai/automation-store";
import {
  AI_AUTOMATION_EXECUTOR_BINDINGS,
} from "../src/lib/ai/automation-executor-registry";
import { managedAiLaunchStatus } from "../src/lib/ai/managed-ai-launch-policy";

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

if (process.env.AI_AUTOMATION_INTERNAL_EXECUTOR_ENABLED !== "true") {
  throw new Error("ai_automation_internal_executor_disabled");
}
if (!managedAiLaunchStatus().ready) {
  throw new Error("ai_automation_tenant_isolation_unresolved");
}
if (!AI_AUTOMATION_EXECUTOR_BINDINGS.some(
  (binding) => binding.externalEffect === "none" && binding.launchReady,
)) {
  throw new Error("ai_automation_internal_executor_not_launch_ready");
}

const executorId =
  `ai-automation-internal:${hostname()}:${process.pid}:${randomUUID()}`;
const pollMs = boundedIntegerEnv(
  "AI_AUTOMATION_POLL_MS",
  2_000,
  500,
  30_000,
);
const runOnce = process.env.AI_AUTOMATION_RUN_ONCE === "true";
let stopping = false;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stop(signal: string): void {
  if (stopping) return;
  stopping = true;
  console.log("[ai-automation-internal-executor] stopping", {
    signal,
    executorId,
  });
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

async function run(): Promise<void> {
  console.log("[ai-automation-internal-executor] started", {
    executorId,
    pollMs,
    runOnce,
  });
  do {
    try {
      const completed = await completeNextApprovedNoEffectAiAutomationRun({
        executorId,
      });
      if (completed) {
        console.log("[ai-automation-internal-executor] completed", {
          runId: completed.id,
          workflowId: completed.workflowId,
        });
      }
      if (runOnce) break;
      if (!completed) await sleep(pollMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[ai-automation-internal-executor] iteration failed", {
        message,
      });
      if (runOnce) throw error;
      await sleep(Math.max(1_000, pollMs));
    }
  } while (!stopping);
  console.log("[ai-automation-internal-executor] stopped", { executorId });
}

void run().catch((error) => {
  console.error("[ai-automation-internal-executor] fatal", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
