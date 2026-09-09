import { checkDbHealth } from "../src/lib/db";

function boundedIntegerEnv(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw.trim())) throw new Error(`${name.toLowerCase()}_invalid`);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name.toLowerCase()}_out_of_range`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const limitPerSource = boundedIntegerEnv("NEWS_MATERIALIZATION_LIMIT_PER_SOURCE", 300, 1, 300);
  const maximumAttempts = boundedIntegerEnv("NEWS_FEED_MAX_ATTEMPTS", 2, 1, 3);
  const retryBaseDelayMs = boundedIntegerEnv("NEWS_FEED_RETRY_BASE_DELAY_MS", 350, 100, 2_000);

  const database = await checkDbHealth();
  if (database.status !== "ok") {
    throw new Error(`news_capture_database_${database.status}`);
  }
  if (database.schema?.status !== "current") {
    throw new Error(`news_capture_database_schema_${database.schema?.status ?? "unknown"}`);
  }

  console.log(JSON.stringify({
    status: "ok",
    mode: "capture_only",
    aiRequired: false,
    databaseSchema: database.schema.status,
    limitPerSource,
    maximumAttempts,
    retryBaseDelayMs,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: "failed",
    mode: "capture_only",
    aiRequired: false,
    reason: error instanceof Error ? error.message : "unknown",
  }));
  process.exitCode = 1;
});
