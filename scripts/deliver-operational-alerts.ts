import { deliverOperationalAlerts } from "../src/lib/ops/operational-alert-spool";
import { deliverOperationalSignals } from "../src/lib/ops/operational-signal-spool";

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
  const stateDirectory = requiredAbsoluteDirectory("TECPEY_OPS_STATE_DIR");
  const webhookUrl = required("TECPEY_OPS_ALERT_WEBHOOK_URL");
  const bearerToken =
    process.env.TECPEY_OPS_ALERT_BEARER_TOKEN?.trim() || null;
  const limit = boundedIntegerEnv(
    "TECPEY_OPS_ALERT_BATCH_SIZE",
    20,
    1,
    100,
  );
  const timeoutMs = boundedIntegerEnv(
    "TECPEY_OPS_ALERT_TIMEOUT_MS",
    10_000,
    1_000,
    30_000,
  );
  const maxAttempts = boundedIntegerEnv(
    "TECPEY_OPS_ALERT_MAX_ATTEMPTS",
    10,
    1,
    100,
  );
  const now = new Date();

  const [alerts, signals] = await Promise.all([
    deliverOperationalAlerts({
      stateDirectory,
      webhookUrl,
      bearerToken,
      limit,
      timeoutMs,
      maxAttempts,
      now,
    }),
    deliverOperationalSignals({
      stateDirectory,
      webhookUrl,
      bearerToken,
      limit,
      timeoutMs,
      maxAttempts,
      now,
    }),
  ]);

  console.log(JSON.stringify({ ok: true, alerts, signals }));
  if (
    alerts.retryable > 0 ||
    alerts.quarantined > 0 ||
    signals.retryable > 0 ||
    signals.quarantined > 0
  ) {
    process.exitCode = 2;
  }
}

void main().catch((error) => {
  const code =
    error instanceof Error && /^[a-z0-9._:-]{3,120}$/.test(error.message)
      ? error.message
      : "operational_delivery_failed";
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
});
