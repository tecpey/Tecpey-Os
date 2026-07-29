import { withDb } from "../src/lib/db";
import { purgeExpiredApiCommandReceipts } from "../src/lib/security/api-command-idempotency";

const DEFAULT_BATCH_SIZE = 1_000;
const DEFAULT_MAX_BATCHES = 20;

function boundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`invalid integer; expected ${min}-${max}`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const batchSize = boundedInteger(
    process.env.API_COMMAND_RECEIPT_PURGE_BATCH_SIZE,
    DEFAULT_BATCH_SIZE,
    1,
    5_000,
  );
  const maxBatches = boundedInteger(
    process.env.API_COMMAND_RECEIPT_PURGE_MAX_BATCHES,
    DEFAULT_MAX_BATCHES,
    1,
    100,
  );

  let totalDeleted = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result = await withDb((client) =>
      purgeExpiredApiCommandReceipts(client, batchSize),
    );
    if (!result.enabled) {
      throw new Error("api_command_receipt_storage_unavailable");
    }
    totalDeleted += result.value;
    if (result.value < batchSize) break;
  }

  console.log(
    JSON.stringify({
      ok: true,
      deleted: totalDeleted,
      batchSize,
      maxBatches,
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "unknown_error",
    }),
  );
  process.exitCode = 1;
});
