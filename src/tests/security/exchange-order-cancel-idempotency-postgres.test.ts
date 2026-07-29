import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { PLATFORM } from "../../lib/platform-config";
import { hashApiCommand } from "../../lib/security/api-command-idempotency";
import { cancelOrderIdempotently } from "../../lib/trading/order-cancel-authority";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);
let pool: Pool | null = null;

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 4,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Order cancellation terminal idempotency", () => {
  it(
    "persists and replays order_not_found while rejecting changed payload reuse",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const orderId = randomUUID();
      const userId = `order-cancel-user-${randomUUID()}`;
      const idempotencyKey = `order-cancel-${randomUUID()}`;
      const requestHash = hashApiCommand({ orderId });

      try {
        assert.deepEqual(
          await cancelOrderIdempotently({
            orderId,
            userId,
            idempotencyKey,
            requestHash,
          }),
          { cancelled: false, orderId, reason: "order_not_found" },
        );
        assert.deepEqual(
          await cancelOrderIdempotently({
            orderId,
            userId,
            idempotencyKey,
            requestHash,
          }),
          { cancelled: false, orderId, reason: "order_not_found" },
        );
        assert.deepEqual(
          await cancelOrderIdempotently({
            orderId,
            userId,
            idempotencyKey,
            requestHash: hashApiCommand({ orderId, changed: true }),
          }),
          { cancelled: false, orderId, reason: "idempotency_conflict" },
        );

        await withClient(async (client) => {
          const receipt = await client.query<{
            status: string;
            http_status: number;
            response_body: Record<string, unknown>;
          }>(
            `SELECT status, http_status, response_body
               FROM api_command_receipts
              WHERE tenant_id = $1
                AND principal_type = 'user'
                AND principal_id = $2
                AND operation = 'order.cancel'
                AND idempotency_key = $3`,
            [PLATFORM.DEFAULT_TENANT_ID, userId, idempotencyKey],
          );
          assert.equal(receipt.rows[0]?.status, "completed");
          assert.equal(receipt.rows[0]?.http_status, 404);
          assert.deepEqual(receipt.rows[0]?.response_body, {
            cancelled: false,
            orderId,
            reason: "order_not_found",
          });
        });
      } finally {
        if (pool) {
          await withClient((client) =>
            client.query(
              `DELETE FROM api_command_receipts
                WHERE tenant_id = $1
                  AND principal_type = 'user'
                  AND principal_id = $2
                  AND operation = 'order.cancel'
                  AND idempotency_key = $3`,
              [PLATFORM.DEFAULT_TENANT_ID, userId, idempotencyKey],
            ),
          );
        }
      }
    },
  );
});
