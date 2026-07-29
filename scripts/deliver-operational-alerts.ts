import { deliverOperationalAlerts } from "../src/lib/ops/operational-alert-spool";

function required(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name.toLowerCase()}_required`);
  return value;
}

function requiredAbsoluteDirectory(name: string): string {
  const value = required(name);
  if (!value.startsWith("/") || value.length > 500 || value.includes("\0")) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return value;
}

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

async function main(): Promise<void> {
  const summary = await deliverOperationalAlerts({
    stateDirectory: requiredAbsoluteDirectory("TECPEY_OPS_STATE_DIR"),
    webhookUrl: required("TECPEY_OPS_ALERT_WEBHOOK_URL"),
    bearerToken: process.env.TECPEY_OPS_ALERT_BEARER_TOKEN?.trim() || null,
    limit: boundedIntegerEnv("TECPEY_OPS_ALERT_BATCH_SIZE", 20, 1, 100),
    timeoutMs: boundedIntegerEnv("TECPEY_OPS_ALERT_TIMEOUT_MS", 10_000, 1_000, 30_000),
    maxAttempts: boundedIntegerEnv("TECPEY_OPS_ALERT_MAX_ATTEMPTS", 10, 1, 100),
  });
  console.log(JSON.stringify({ ok: true, ...summary }));
  if (summary.retryable > 0 || summary.quarantined > 0) process.exitCode = 2;
}

void main().catch((error) => {
  const code = error instanceof Error && /^[a-z0-9._:-]{3,120}$/.test(error.message)
    ? error.message
    : "operational_alert_delivery_failed";
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
});
