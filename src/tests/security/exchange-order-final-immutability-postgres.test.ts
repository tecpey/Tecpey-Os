import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { PLATFORM } from "../../lib/platform-config";
import {
  admitExchangeOrderCommand,
  processExchangeOrderCommand,
} from "../../lib/trading/order-command-service";
import { fingerprintExchangeOrder } from "../../lib/trading/exchange-order-evidence";
import { isolateExchangeOrderTestCache } from "./exchange-order-test-environment";

const restoreTestCache = isolateExchangeOrderTestCache();
after(restoreTestCache);

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);

function uniqueMarket(): string {
  return `I${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}USDT`;
}

async function seedMarketAndBalance(market: string, userId: string): Promise<void> {
  const result = await withDb(async (client) => {
    await client.query(
      `INSERT INTO markets
        (symbol, base_asset, quote_asset, status, tick_size, step_size,
         min_order_value, max_order_value, price_precision,
         quantity_precision, maker_fee, taker_fee)
       VALUES ($1, $2, 'USDT', 'active', '0.01', '0.00001',
               '1', '1000000', 2, 5, '0.001', '0.001')
       ON CONFLICT (symbol) DO NOTHING`,
      [market, market.replace(/USDT$/, "")],
    );
    await client.query(
      `INSERT INTO wallet_balances
        (user_id, asset, available_balance, held_balance)
       VALUES ($1, 'USDT', '100.0000000000', 0)
       ON CONFLICT (user_id, asset)
       DO UPDATE SET available_balance = EXCLUDED.available_balance,
                     held_balance = 0,
                     updated_at = NOW()`,
      [userId],
    );
  });
  assert.equal(result.enabled, true);
}

describe("Exchange final command immutability", () => {
  it(
    "rejects every post-final state or result rewrite without changing evidence",
    { skip: !databaseConfigured, timeout: 45_000 },
    async () => {
      const market = uniqueMarket();
      const userId = `final-immutable-${randomUUID()}`;
      await seedMarketAndBalance(market, userId);

      const admitted = await admitExchangeOrderCommand({
        tenantId: PLATFORM.DEFAULT_TENANT_ID,
        userId,
        idempotencyKey: `final-immutable-${randomUUID()}`,
        request: {
          market,
          side: "buy",
          type: "limit",
          quantity: "0.10000",
          price: "100.00",
          timeInForce: "GTC",
          clientOrderId: `client-${randomUUID()}`,
        },
        hold: { asset: "USDT", amount: "10.0100000000" },
      });
      assert.equal(admitted.status, "admitted");
      if (admitted.status !== "admitted") {
        throw new Error("test_order_not_admitted");
      }

      const processed = await processExchangeOrderCommand(
        admitted.commandId,
        `final-immutable-worker-${randomUUID()}`,
      );
      assert.equal(processed.status, "final");
      if (processed.status !== "final") {
        throw new Error("test_order_not_final");
      }
      assert.equal(processed.outcome.accepted, true);

      await assert.rejects(
        () =>
          withDb((client) =>
            client.query(
              `UPDATE exchange_order_commands
                  SET result = jsonb_set(result, '{accepted}', 'false'::jsonb),
                      updated_at = NOW()
                WHERE id = $1::uuid`,
              [admitted.commandId],
            ),
          ),
        /exchange order final command outcome is immutable/,
      );

      await assert.rejects(
        () =>
          withDb((client) =>
            client.query(
              `UPDATE exchange_order_commands
                  SET state = 'retryable',
                      finalized_at = NULL,
                      updated_at = NOW()
                WHERE id = $1::uuid`,
              [admitted.commandId],
            ),
          ),
        /exchange order final command outcome is immutable/,
      );

      const authority = await withDb(async (client) => {
        const command = await client.query<{
          state: string;
          accepted: boolean;
          order_status: string;
          trade_ids: unknown;
          reason: string | null;
        }>(
          `SELECT state,
                  (result->>'accepted')::boolean AS accepted,
                  result->>'orderStatus' AS order_status,
                  result->'tradeIds' AS trade_ids,
                  result->>'reason' AS reason
             FROM exchange_order_commands
            WHERE id = $1::uuid`,
          [admitted.commandId],
        );
        const evidence = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM sensitive_mutation_audit_events
            WHERE resource_id = $1
              AND action = 'exchange.order.finalize'`,
          [fingerprintExchangeOrder(admitted.order.id)],
        );
        return {
          command: command.rows[0],
          evidenceCount: Number(evidence.rows[0]?.count ?? "0"),
        };
      });
      assert.equal(authority.enabled, true);
      if (!authority.enabled) throw new Error("test_database_unavailable");
      assert.equal(authority.value.command?.state, "final");
      assert.equal(authority.value.command?.accepted, true);
      assert.equal(
        authority.value.command?.order_status,
        processed.outcome.orderStatus,
      );
      assert.deepEqual(
        authority.value.command?.trade_ids,
        processed.outcome.tradeIds,
      );
      assert.equal(
        authority.value.command?.reason,
        processed.outcome.reason ?? null,
      );
      assert.equal(authority.value.evidenceCount, 1);
    },
  );
});
