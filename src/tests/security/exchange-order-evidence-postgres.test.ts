import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { PLATFORM } from "../../lib/platform-config";
import {
  admitExchangeOrderCommand,
  hashExchangeOrderCommand,
  type ExchangeOrderAdmissionInput,
} from "../../lib/trading/order-command-service";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));

function uniqueMarket(): string {
  return `E${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}USDT`;
}

async function seedMarketAndBalance(input: {
  market: string;
  userId: string;
}): Promise<void> {
  const result = await withDb(async (client) => {
    await client.query(
      `INSERT INTO markets
        (symbol, base_asset, quote_asset, status, tick_size, step_size,
         min_order_value, max_order_value, price_precision,
         quantity_precision, maker_fee, taker_fee)
       VALUES ($1, $2, 'USDT', 'active', '0.01', '0.00001', '1', '1000000', 2, 5, '0.001', '0.001')
       ON CONFLICT (symbol) DO NOTHING`,
      [input.market, input.market.replace(/USDT$/, "")],
    );
    await client.query(
      `INSERT INTO wallet_balances
        (user_id, asset, available_balance, held_balance)
       VALUES ($1, 'USDT', '100.0000000000', 0)
       ON CONFLICT (user_id, asset)
       DO UPDATE SET available_balance = EXCLUDED.available_balance,
                     held_balance = 0,
                     updated_at = NOW()`,
      [input.userId],
    );
  });
  assert.equal(result.enabled, true);
}

function command(input: {
  market: string;
  userId: string;
  key?: string;
}): ExchangeOrderAdmissionInput {
  return {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    userId: input.userId,
    idempotencyKey: input.key ?? `exchange-evidence-${randomUUID()}`,
    request: {
      market: input.market,
      side: "buy",
      type: "limit",
      quantity: "0.10000",
      price: "100.00",
      timeInForce: "GTC",
      clientOrderId: `client-${randomUUID()}`,
    },
    hold: { asset: "USDT", amount: "10.0100000000" },
  };
}

async function mutationCounts(userId: string, market: string) {
  const result = await withDb(async (client) => {
    const rows = await client.query<{
      orders: string;
      commands: string;
      holds: string;
      evidence: string;
    }>(
      `SELECT
        (SELECT COUNT(*)::text FROM orders WHERE user_id = $1 AND market = $2) AS orders,
        (SELECT COUNT(*)::text FROM exchange_order_commands WHERE user_id = $1 AND market = $2) AS commands,
        (SELECT COUNT(*)::text FROM wallet_ledger
          WHERE wallet_id = $1 AND type = 'hold' AND reference_type = 'order') AS holds,
        (SELECT COUNT(*)::text FROM sensitive_mutation_audit_events
          WHERE actor_id = $1 AND action = 'exchange.order.admit') AS evidence`,
      [userId, market],
    );
    return rows.rows[0]!;
  });
  assert.equal(result.enabled, true);
  if (!result.enabled) throw new Error("test_database_unavailable");
  return result.value;
}

describe("Exchange order transactional admission evidence", () => {
  it("commits exactly one typed admission event with the order, hold, ledger and command", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const market = uniqueMarket();
    const userId = `exchange-evidence-${randomUUID()}`;
    await seedMarketAndBalance({ market, userId });
    const input = command({
      market,
      userId,
      key: `same-evidence-${randomUUID()}`,
    });

    const results = await Promise.all(
      Array.from({ length: 6 }, () => admitExchangeOrderCommand(input)),
    );
    assert.equal(
      results.every((entry) => ["admitted", "replayed"].includes(entry.status)),
      true,
    );
    const successful = results.filter(
      (
        entry,
      ): entry is Extract<
        typeof entry,
        { status: "admitted" | "replayed" }
      > => entry.status === "admitted" || entry.status === "replayed",
    );
    assert.equal(successful.filter((entry) => entry.status === "admitted").length, 1);
    assert.equal(new Set(successful.map((entry) => entry.order.id)).size, 1);
    assert.deepEqual(await mutationCounts(userId, market), {
      orders: "1",
      commands: "1",
      holds: "1",
      evidence: "1",
    });

    const evidence = await withDb(async (client) => {
      const rows = await client.query<{
        actor_type: string;
        resource_type: string;
        resource_id: string;
        correlation_id: string;
        request_hash: string;
        metadata: Record<string, unknown>;
      }>(
        `SELECT actor_type, resource_type, resource_id, correlation_id,
                request_hash, metadata
           FROM sensitive_mutation_audit_events
          WHERE actor_id = $1 AND action = 'exchange.order.admit'
          LIMIT 1`,
        [userId],
      );
      return rows.rows[0]!;
    });
    assert.equal(evidence.enabled, true);
    if (!evidence.enabled) return;

    const row = evidence.value;
    const orderId = successful[0]!.order.id;
    assert.equal(row.actor_type, "user");
    assert.equal(row.resource_type, "exchange_order");
    assert.equal(row.resource_id.includes(orderId), false);
    assert.equal(row.correlation_id.includes(input.idempotencyKey), false);
    assert.equal(row.request_hash, hashExchangeOrderCommand(input));
    assert.equal(row.metadata.policyVersion, "exchange-order-evidence-v1");
    assert.equal(row.metadata.side, "buy");
    assert.equal(row.metadata.orderType, "limit");
    assert.equal(row.metadata.timeInForce, "GTC");
    assert.equal(row.metadata.holdAsset, "USDT");
    assert.equal(row.metadata.holdRepresentation, "wallet_ledger");
    assert.equal(JSON.stringify(row.metadata).includes(orderId), false);
    assert.equal(JSON.stringify(row.metadata).includes(userId), false);
  });

  it("rolls back order, hold, ledger, command and domain event when mandatory evidence is rejected", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const market = uniqueMarket();
    const userId = `exchange-evidence-reject-${randomUUID()}`;
    await seedMarketAndBalance({ market, userId });
    const input = command({ market, userId });
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `test_reject_exchange_evidence_${suffix}`;
    const triggerName = `test_reject_exchange_evidence_trigger_${suffix}`;

    const installed = await withDb(async (client) => {
      await client.query(`
        CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.action = 'exchange.order.admit' AND NEW.actor_id = '${userId}' THEN
            RAISE EXCEPTION 'injected_exchange_evidence_rejection';
          END IF;
          RETURN NEW;
        END;
        $$;
        CREATE TRIGGER ${triggerName}
          BEFORE INSERT ON sensitive_mutation_audit_events
          FOR EACH ROW EXECUTE FUNCTION ${functionName}();
      `);
    });
    assert.equal(installed.enabled, true);

    try {
      const result = await admitExchangeOrderCommand(input);
      assert.deepEqual(result, { status: "unavailable" });
      assert.deepEqual(await mutationCounts(userId, market), {
        orders: "0",
        commands: "0",
        holds: "0",
        evidence: "0",
      });

      const domainEvents = await withDb(async (client) => {
        const rows = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM order_events event
             JOIN orders ON orders.id = event.order_id
            WHERE orders.user_id = $1 AND orders.market = $2`,
          [userId, market],
        );
        return rows.rows[0]?.count ?? "0";
      });
      assert.equal(domainEvents.enabled, true);
      if (domainEvents.enabled) assert.equal(domainEvents.value, "0");
    } finally {
      await withDb((client) =>
        client.query(`
          DROP TRIGGER IF EXISTS ${triggerName} ON sensitive_mutation_audit_events;
          DROP FUNCTION IF EXISTS ${functionName}();
        `),
      );
    }
  });
});
