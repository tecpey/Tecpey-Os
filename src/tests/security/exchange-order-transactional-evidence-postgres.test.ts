import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { withDb, withTx } from "../../lib/db";
import { PLATFORM } from "../../lib/platform-config";
import { hashApiCommand } from "../../lib/security/api-command-idempotency";
import {
  admitExchangeOrderCommand,
} from "../../lib/trading/order-command-service";
import { cancelOrderIdempotently } from "../../lib/trading/order-cancel-authority";
import { ensureWallet } from "../../lib/trading/wallet-service";

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

async function seedBalance(userId: string, asset: string, balance: string): Promise<void> {
  await ensureWallet(userId);
  const result = await withDb(async (client) => {
    await client.query(
      `INSERT INTO wallet_balances (wallet_id, asset, balance, held)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (wallet_id, asset) DO UPDATE
         SET balance = EXCLUDED.balance,
             held = 0,
             updated_at = NOW()`,
      [userId, asset, balance],
    );
    return true;
  });
  assert.equal(result.enabled, true);
}

async function admission(userId: string, idempotencyKey = `evidence-${randomUUID()}`) {
  await seedBalance(userId, "USDT", "1000");
  return admitExchangeOrderCommand({
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    userId,
    idempotencyKey,
    request: {
      market: "BTC-USDT",
      side: "BUY",
      type: "LIMIT",
      quantity: "0.01",
      price: "1000",
      timeInForce: "GTC",
    },
    hold: { asset: "USDT", amount: "10" },
  });
}

async function cleanupUser(userId: string): Promise<void> {
  if (!pool) return;
  await withClient(async (client) => {
    const orders = await client.query<{ id: string }>(
      "SELECT id::text AS id FROM orders WHERE user_id = $1",
      [userId],
    );
    const ids = orders.rows.map((row) => row.id);
    if (ids.length > 0) {
      await client.query(
        "DELETE FROM exchange_order_command_attempts WHERE command_id IN (SELECT id FROM exchange_order_commands WHERE order_id = ANY($1::uuid[]))",
        [ids],
      );
      await client.query(
        "DELETE FROM exchange_order_commands WHERE order_id = ANY($1::uuid[])",
        [ids],
      );
      await client.query(
        "DELETE FROM api_command_receipts WHERE principal_id = $1",
        [userId],
      );
      await client.query(
        "DELETE FROM domain_event_outbox WHERE aggregate_id = ANY($1::text[])",
        [ids],
      );
      await client.query(
        "DELETE FROM wallet_ledger WHERE reference_type = 'order' AND reference_id = ANY($1::text[])",
        [ids],
      );
      await client.query("DELETE FROM orders WHERE id = ANY($1::uuid[])", [ids]);
    }
    await client.query("DELETE FROM wallet_balances WHERE wallet_id = $1", [userId]);
    await client.query("DELETE FROM wallets WHERE id = $1", [userId]);
  });
}

async function installEvidenceRejectionTrigger(): Promise<void> {
  await withClient(async (client) => {
    await client.query(`
      CREATE OR REPLACE FUNCTION tecpey_test_reject_exchange_evidence()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.action = 'exchange.order.admit'
           AND NEW.actor_id LIKE 'exchange-evidence-reject-admit-%' THEN
          RAISE EXCEPTION 'forced_exchange_admission_evidence_rejection';
        END IF;
        IF NEW.action = 'exchange.order.cancel'
           AND NEW.actor_id LIKE 'exchange-evidence-reject-cancel-%' THEN
          RAISE EXCEPTION 'forced_exchange_cancel_evidence_rejection';
        END IF;
        RETURN NEW;
      END;
      $$;

      DROP TRIGGER IF EXISTS exchange_evidence_test_reject
        ON sensitive_mutation_audit_events;
      CREATE TRIGGER exchange_evidence_test_reject
        BEFORE INSERT ON sensitive_mutation_audit_events
        FOR EACH ROW
        EXECUTE FUNCTION tecpey_test_reject_exchange_evidence();
    `);
  });
}

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 8,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
  await installEvidenceRejectionTrigger();
});

after(async () => {
  if (pool) {
    await withClient(async (client) => {
      await client.query(
        "DROP TRIGGER IF EXISTS exchange_evidence_test_reject ON sensitive_mutation_audit_events",
      );
      await client.query(
        "DROP FUNCTION IF EXISTS tecpey_test_reject_exchange_evidence()",
      );
    });
  }
  await pool?.end();
  pool = null;
});

describe("Exchange order transaction-coupled evidence", () => {
  it(
    "commits order, exact hold, command and secret-free admission evidence atomically",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const userId = `exchange-evidence-admit-${randomUUID()}`;
      const idempotencyKey = `evidence-admit-${randomUUID()}`;
      try {
        const result = await admission(userId, idempotencyKey);
        assert.equal(result.status, "admitted");
        if (result.status !== "admitted") return;

        const state = await withClient(async (client) => {
          const audit = await client.query<{
            action: string;
            resource_type: string;
            document: string;
            metadata: Record<string, unknown>;
          }>(
            `SELECT action, resource_type, row_to_json(event)::text AS document, metadata
               FROM sensitive_mutation_audit_events event
              WHERE actor_id = $1
                AND action = 'exchange.order.admit'
              ORDER BY created_at DESC
              LIMIT 1`,
            [userId],
          );
          const hold = await client.query<{ held: string }>(
            `SELECT held::text AS held
               FROM wallet_balances
              WHERE wallet_id = $1 AND asset = 'USDT'`,
            [userId],
          );
          return {
            audit: audit.rows[0],
            held: hold.rows[0]?.held,
          };
        });

        assert.equal(state.audit.action, "exchange.order.admit");
        assert.equal(state.audit.resource_type, "exchange_order");
        assert.equal(state.audit.metadata.holdAmount, "10");
        assert.equal(state.audit.metadata.quantity, "0.01");
        assert.equal(state.held, "10");
        for (const raw of [userId, idempotencyKey, result.order.id, result.commandId]) {
          assert.equal(state.audit.document.includes(raw), false);
        }
      } finally {
        await cleanupUser(userId);
      }
    },
  );

  it(
    "rolls back order, hold and command when mandatory admission evidence is rejected",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const userId = `exchange-evidence-reject-admit-${randomUUID()}`;
      try {
        const result = await admission(userId);
        assert.equal(result.status, "unavailable");

        const counts = await withClient(async (client) => {
          const rows = await client.query<{
            orders: string;
            commands: string;
            ledger: string;
            held: string;
          }>(
            `SELECT
               (SELECT COUNT(*)::text FROM orders WHERE user_id = $1) AS orders,
               (SELECT COUNT(*)::text FROM exchange_order_commands WHERE user_id = $1) AS commands,
               (SELECT COUNT(*)::text FROM wallet_ledger WHERE wallet_id = $1 AND reference_type = 'order') AS ledger,
               (SELECT COALESCE(held, 0)::text FROM wallet_balances WHERE wallet_id = $1 AND asset = 'USDT') AS held`,
            [userId],
          );
          return rows.rows[0];
        });
        assert.deepEqual(counts, {
          orders: "0",
          commands: "0",
          ledger: "0",
          held: "0",
        });
      } finally {
        await cleanupUser(userId);
      }
    },
  );

  it(
    "commits cancellation, complete hold release, receipt and typed evidence together",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const userId = `exchange-evidence-cancel-${randomUUID()}`;
      try {
        const admitted = await admission(userId);
        assert.equal(admitted.status, "admitted");
        if (admitted.status !== "admitted") return;

        const idempotencyKey = `evidence-cancel-${randomUUID()}`;
        const requestHash = hashApiCommand({
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          principalType: "user",
          principalId: userId,
          operation: "exchange.order.cancel",
          orderId: admitted.order.id,
        });
        const cancelled = await cancelOrderIdempotently({
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          userId,
          orderId: admitted.order.id,
          idempotencyKey,
          requestHash,
        });
        assert.equal(cancelled.status, "success");

        const state = await withClient(async (client) => {
          const order = await client.query<{ status: string }>(
            "SELECT status FROM orders WHERE id = $1",
            [admitted.order.id],
          );
          const balance = await client.query<{ held: string }>(
            "SELECT held::text AS held FROM wallet_balances WHERE wallet_id = $1 AND asset = 'USDT'",
            [userId],
          );
          const audit = await client.query<{
            document: string;
            metadata: Record<string, unknown>;
          }>(
            `SELECT row_to_json(event)::text AS document, metadata
               FROM sensitive_mutation_audit_events event
              WHERE actor_id = $1
                AND action = 'exchange.order.cancel'
              ORDER BY created_at DESC
              LIMIT 1`,
            [userId],
          );
          return {
            status: order.rows[0]?.status,
            held: balance.rows[0]?.held,
            audit: audit.rows[0],
          };
        });
        assert.equal(state.status, "CANCELLED");
        assert.equal(state.held, "0");
        assert.equal(state.audit.metadata.heldAmount, "10");
        assert.equal(state.audit.metadata.releasedAmount, "10");
        assert.equal(state.audit.metadata.residualHold, "0");
        for (const raw of [userId, idempotencyKey, admitted.order.id]) {
          assert.equal(state.audit.document.includes(raw), false);
        }
      } finally {
        await cleanupUser(userId);
      }
    },
  );

  it(
    "rolls back cancellation and hold release when mandatory cancel evidence is rejected",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const userId = `exchange-evidence-reject-cancel-${randomUUID()}`;
      try {
        const admitted = await admission(userId);
        assert.equal(admitted.status, "admitted");
        if (admitted.status !== "admitted") return;

        const idempotencyKey = `evidence-cancel-${randomUUID()}`;
        const requestHash = hashApiCommand({
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          principalType: "user",
          principalId: userId,
          operation: "exchange.order.cancel",
          orderId: admitted.order.id,
        });
        await assert.rejects(
          cancelOrderIdempotently({
            tenantId: PLATFORM.DEFAULT_TENANT_ID,
            userId,
            orderId: admitted.order.id,
            idempotencyKey,
            requestHash,
          }),
          /forced_exchange_cancel_evidence_rejection/,
        );

        const state = await withClient(async (client) => {
          const order = await client.query<{ status: string }>(
            "SELECT status FROM orders WHERE id = $1",
            [admitted.order.id],
          );
          const balance = await client.query<{ held: string }>(
            "SELECT held::text AS held FROM wallet_balances WHERE wallet_id = $1 AND asset = 'USDT'",
            [userId],
          );
          const receipts = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM api_command_receipts
              WHERE principal_id = $1
                AND operation = 'exchange.order.cancel'`,
            [userId],
          );
          return {
            status: order.rows[0]?.status,
            held: balance.rows[0]?.held,
            receipts: Number(receipts.rows[0]?.count ?? "0"),
          };
        });
        assert.equal(state.status, "NEW");
        assert.equal(state.held, "10");
        assert.equal(state.receipts, 0);
      } finally {
        await cleanupUser(userId);
      }
    },
  );

  it(
    "rejects and rolls back a trade that lacks complete wallet settlement",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const makerId = `exchange-trade-maker-${randomUUID()}`;
      const takerId = `exchange-trade-taker-${randomUUID()}`;
      const makerOrderId = randomUUID();
      const takerOrderId = randomUUID();
      const tradeId = randomUUID();
      try {
        await assert.rejects(
          withTx(async (client) => {
            await client.query(
              `INSERT INTO orders
                 (id, user_id, market, side, type, quantity, remaining_quantity,
                  status, time_in_force)
               VALUES
                 ($1, $2, 'BTC-USDT', 'SELL', 'LIMIT', 0.1, 0.1, 'NEW', 'GTC'),
                 ($3, $4, 'BTC-USDT', 'BUY', 'LIMIT', 0.1, 0.1, 'NEW', 'GTC')`,
              [makerOrderId, makerId, takerOrderId, takerId],
            );
            await client.query(
              `INSERT INTO trades
                 (id, market, maker_order_id, taker_order_id, maker_user_id,
                  taker_user_id, side, price, quantity)
               VALUES ($1, 'BTC-USDT', $2, $3, $4, $5, 'BUY', 1000, 0.1)`,
              [tradeId, makerOrderId, takerOrderId, makerId, takerId],
            );
            return true;
          }),
          /exchange_trade_settlement_incomplete/,
        );

        const count = await withClient(async (client) => {
          const result = await client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM trades WHERE id = $1",
            [tradeId],
          );
          return Number(result.rows[0]?.count ?? "0");
        });
        assert.equal(count, 0);
      } finally {
        await withClient(async (client) => {
          await client.query("DELETE FROM orders WHERE id = ANY($1::uuid[])", [
            [makerOrderId, takerOrderId],
          ]);
        });
      }
    },
  );

  it(
    "commits fill and settlement evidence only with complete debit and credit legs",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const sellerId = `exchange-settle-seller-${randomUUID()}`;
      const buyerId = `exchange-settle-buyer-${randomUUID()}`;
      const makerOrderId = randomUUID();
      const takerOrderId = randomUUID();
      const tradeId = randomUUID();
      try {
        await seedBalance(sellerId, "BTC", "1");
        await seedBalance(sellerId, "USDT", "0");
        await seedBalance(buyerId, "BTC", "0");
        await seedBalance(buyerId, "USDT", "1000");

        const transaction = await withTx(async (client) => {
          await client.query(
            `INSERT INTO orders
               (id, user_id, market, side, type, quantity, remaining_quantity,
                status, time_in_force)
             VALUES
               ($1, $2, 'BTC-USDT', 'SELL', 'LIMIT', 0.1, 0.1, 'NEW', 'GTC'),
               ($3, $4, 'BTC-USDT', 'BUY', 'LIMIT', 0.1, 0.1, 'NEW', 'GTC')`,
            [makerOrderId, sellerId, takerOrderId, buyerId],
          );
          await client.query(
            `INSERT INTO trades
               (id, market, maker_order_id, taker_order_id, maker_user_id,
                taker_user_id, side, price, quantity)
             VALUES ($1, 'BTC-USDT', $2, $3, $4, $5, 'BUY', 1000, 0.1)`,
            [tradeId, makerOrderId, takerOrderId, sellerId, buyerId],
          );
          for (const leg of [
            [buyerId, "USDT", "trade_debit", "100"],
            [sellerId, "USDT", "trade_credit", "100"],
            [sellerId, "BTC", "trade_debit", "0.1"],
            [buyerId, "BTC", "trade_credit", "0.1"],
          ] as const) {
            await client.query(
              `INSERT INTO wallet_ledger
                 (wallet_id, asset, type, amount, balance_after,
                  reference_type, reference_id)
               VALUES ($1, $2, $3, $4, 0, 'trade', $5)`,
              [leg[0], leg[1], leg[2], leg[3], tradeId],
            );
          }
          return true;
        });
        assert.equal(transaction.enabled, true);

        const evidence = await withClient(async (client) => {
          const rows = await client.query<{
            action: string;
            resource_type: string;
            document: string;
            metadata: Record<string, unknown>;
          }>(
            `SELECT action, resource_type, row_to_json(event)::text AS document, metadata
               FROM sensitive_mutation_audit_events event
              WHERE actor_type = 'service'
                AND actor_id = 'matching-engine'
                AND action IN ('exchange.order.fill', 'exchange.order.settle')
                AND resource_id = tecpey_exchange_evidence_hash('exchange-trade', $1)
              ORDER BY action`,
            [tradeId],
          );
          return rows.rows;
        });
        assert.equal(evidence.length, 2);
        assert.deepEqual(
          evidence.map((row) => row.action),
          ["exchange.order.fill", "exchange.order.settle"],
        );
        const settlement = evidence.find(
          (row) => row.action === "exchange.order.settle",
        );
        assert.equal(settlement?.resource_type, "order_settlement");
        assert.equal(settlement?.metadata.debitCount, 2);
        assert.equal(settlement?.metadata.creditCount, 2);
        for (const row of evidence) {
          for (const raw of [
            tradeId,
            makerOrderId,
            takerOrderId,
            sellerId,
            buyerId,
          ]) {
            assert.equal(row.document.includes(raw), false);
          }
        }
      } finally {
        await withClient(async (client) => {
          await client.query(
            "DELETE FROM wallet_ledger WHERE reference_type = 'trade' AND reference_id = $1",
            [tradeId],
          );
          await client.query("DELETE FROM trades WHERE id = $1", [tradeId]);
          await client.query("DELETE FROM orders WHERE id = ANY($1::uuid[])", [
            [makerOrderId, takerOrderId],
          ]);
          await client.query("DELETE FROM wallet_balances WHERE wallet_id = ANY($1::text[])", [
            [sellerId, buyerId],
          ]);
          await client.query("DELETE FROM wallets WHERE id = ANY($1::text[])", [
            [sellerId, buyerId],
          ]);
        });
      }
    },
  );
});
