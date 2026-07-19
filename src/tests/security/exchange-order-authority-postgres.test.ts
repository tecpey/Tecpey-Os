import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { D } from "../../lib/trading/decimal";
import { getMatchingEngine } from "../../lib/trading/engine";
import { withExchangeMarketExecutionLock } from "../../lib/trading/market-execution-lock";
import {
  admitExchangeOrderCommand,
  processExchangeOrderCommand,
  readExchangeOrderCommand,
  type ExchangeOrderAdmissionInput,
} from "../../lib/trading/order-command-service";
import { getOrderHoldResidualTx } from "../../lib/trading/wallet-service";
import { PLATFORM } from "../../lib/platform-config";
import { isolateExchangeOrderTestCache } from "./exchange-order-test-environment";

const restoreTestCache = isolateExchangeOrderTestCache();
after(restoreTestCache);

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));

function uniqueMarket(): string {
  return `X${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}USDT`;
}

async function seedMarketAndBalance(input: {
  market: string;
  userId: string;
  available?: string;
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
       VALUES ($1, 'USDT', $2::numeric, 0)
       ON CONFLICT (user_id, asset)
       DO UPDATE SET available_balance = EXCLUDED.available_balance,
                     held_balance = 0,
                     updated_at = NOW()`,
      [input.userId, input.available ?? "100.0000000000"],
    );
  });
  assert.equal(result.enabled, true);
}

function command(input: {
  market: string;
  userId: string;
  key?: string;
  timeInForce?: "GTC" | "IOC" | "FOK";
  quantity?: string;
  price?: string;
  hold?: string;
}): ExchangeOrderAdmissionInput {
  return {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    userId: input.userId,
    idempotencyKey: input.key ?? `exchange-test-${randomUUID()}`,
    request: {
      market: input.market,
      side: "buy",
      type: "limit",
      quantity: input.quantity ?? "0.10000",
      price: input.price ?? "100.00",
      timeInForce: input.timeInForce ?? "FOK",
      clientOrderId: `client-${randomUUID()}`,
    },
    hold: { asset: "USDT", amount: input.hold ?? "10.0000000000" },
  };
}

async function evidenceFor(userId: string, market: string) {
  const result = await withDb(async (client) => {
    const rows = await client.query<{
      orders: string;
      commands: string;
      holds: string;
      releases: string;
    }>(
      `SELECT
        (SELECT COUNT(*)::text FROM orders WHERE user_id = $1 AND market = $2) AS orders,
        (SELECT COUNT(*)::text FROM exchange_order_commands WHERE user_id = $1 AND market = $2) AS commands,
        (SELECT COUNT(*)::text FROM wallet_ledger
          WHERE wallet_id = $1 AND type = 'hold' AND reference_type = 'order') AS holds,
        (SELECT COUNT(*)::text FROM wallet_ledger
          WHERE wallet_id = $1 AND type = 'release' AND reference_type = 'order') AS releases`,
      [userId, market],
    );
    return rows.rows[0]!;
  });
  assert.equal(result.enabled, true);
  if (!result.enabled) throw new Error("test_database_unavailable");
  return result.value;
}

describe("Exchange order PostgreSQL authority", () => {
  it("rolls back the order and command when the committed hold loses the balance race", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const market = uniqueMarket();
    const userId = `exchange-insufficient-${randomUUID()}`;
    await seedMarketAndBalance({ market, userId, available: "5.0000000000" });

    const result = await admitExchangeOrderCommand(command({ market, userId }));
    assert.deepEqual(result, { status: "insufficient_balance" });
    assert.deepEqual(await evidenceFor(userId, market), {
      orders: "0",
      commands: "0",
      holds: "0",
      releases: "0",
    });
  });

  it("serializes concurrent duplicate admission into one order and one exact hold", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const market = uniqueMarket();
    const userId = `exchange-idempotent-${randomUUID()}`;
    await seedMarketAndBalance({ market, userId });
    const input = command({
      market,
      userId,
      key: `same-order-${randomUUID()}`,
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, () => admitExchangeOrderCommand(input)),
    );
    assert.equal(
      results.every((entry) => ["admitted", "replayed"].includes(entry.status)),
      true,
    );
    const committed = results.filter(
      (
        entry,
      ): entry is Extract<
        typeof entry,
        { status: "admitted" | "replayed" }
      > => entry.status === "admitted" || entry.status === "replayed",
    );
    assert.equal(new Set(committed.map((entry) => entry.commandId)).size, 1);
    assert.equal(new Set(committed.map((entry) => entry.order.id)).size, 1);
    assert.equal(
      committed.filter((entry) => entry.status === "admitted").length,
      1,
    );
    assert.deepEqual(await evidenceFor(userId, market), {
      orders: "1",
      commands: "1",
      holds: "1",
      releases: "0",
    });

    const conflict = await admitExchangeOrderCommand({
      ...input,
      request: { ...input.request, quantity: "0.20000" },
      hold: { ...input.hold, amount: "20.0000000000" },
    });
    assert.deepEqual(conflict, { status: "conflict" });
  });

  it("recovers an admitted-but-unprocessed command exactly once after a simulated crash", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const market = uniqueMarket();
    const userId = `exchange-recovery-${randomUUID()}`;
    await seedMarketAndBalance({ market, userId });
    const admitted = await admitExchangeOrderCommand(command({ market, userId }));
    assert.equal(admitted.status, "admitted");
    if (admitted.status !== "admitted") return;

    const before = await readExchangeOrderCommand(admitted.commandId);
    assert.equal(before?.state, "admitted");
    assert.equal(before?.order?.status, "NEW");

    const recovered = await processExchangeOrderCommand(
      admitted.commandId,
      `recovery-${randomUUID()}`,
    );
    assert.equal(recovered.status, "final");
    if (recovered.status !== "final") return;
    assert.equal(recovered.outcome.accepted, false);
    assert.equal(recovered.outcome.reason, "fok_insufficient_liquidity");
    assert.equal(recovered.order.status, "EXPIRED");

    const replay = await processExchangeOrderCommand(
      admitted.commandId,
      `replay-${randomUUID()}`,
    );
    assert.equal(replay.status, "final");
    if (replay.status === "final") {
      assert.deepEqual(replay.outcome, recovered.outcome);
      assert.equal(replay.order.id, recovered.order.id);
    }

    const residual = await withDb((client) =>
      getOrderHoldResidualTx(client, userId, "USDT", admitted.order.id),
    );
    assert.equal(residual.enabled, true);
    if (residual.enabled) assert.equal(D(residual.value).isZero(), true);
    assert.deepEqual(await evidenceFor(userId, market), {
      orders: "1",
      commands: "1",
      holds: "1",
      releases: "1",
    });
  });

  it("does not report terminal rejection when hold release fails, then reconciles on retry", {
    skip: !databaseConfigured,
    timeout: 45_000,
  }, async () => {
    const market = uniqueMarket();
    const userId = `exchange-release-failure-${randomUUID()}`;
    await seedMarketAndBalance({ market, userId });
    const admitted = await admitExchangeOrderCommand(command({ market, userId }));
    assert.equal(admitted.status, "admitted");
    if (admitted.status !== "admitted") return;

    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `test_block_order_release_${suffix}`;
    const triggerName = `test_block_order_release_trigger_${suffix}`;
    const installed = await withDb(async (client) => {
      await client.query(`
        CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF OLD.user_id = '${userId}' AND NEW.held_balance < OLD.held_balance THEN
            RAISE EXCEPTION 'injected_order_release_failure';
          END IF;
          RETURN NEW;
        END;
        $$;
        CREATE TRIGGER ${triggerName}
          BEFORE UPDATE ON wallet_balances
          FOR EACH ROW EXECUTE FUNCTION ${functionName}();
      `);
    });
    assert.equal(installed.enabled, true);

    try {
      const first = await processExchangeOrderCommand(
        admitted.commandId,
        `release-failure-${randomUUID()}`,
      );
      assert.equal(first.status, "queued");
      const failed = await readExchangeOrderCommand(admitted.commandId);
      assert.equal(failed?.state, "retryable");
      assert.equal(failed?.order?.status, "NEW");
      assert.deepEqual(await evidenceFor(userId, market), {
        orders: "1",
        commands: "1",
        holds: "1",
        releases: "0",
      });
    } finally {
      await withDb(async (client) => {
        await client.query(
          `DROP TRIGGER IF EXISTS ${triggerName} ON wallet_balances`,
        );
        await client.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
        await client.query(
          `UPDATE exchange_order_commands
              SET available_at = NOW()
            WHERE id = $1::uuid AND state = 'retryable'`,
          [admitted.commandId],
        );
      });
    }

    const retry = await processExchangeOrderCommand(
      admitted.commandId,
      `release-retry-${randomUUID()}`,
    );
    assert.equal(retry.status, "final");
    if (retry.status === "final") {
      assert.equal(retry.order.status, "EXPIRED");
      assert.equal(retry.outcome.accepted, false);
    }
    assert.deepEqual(await evidenceFor(userId, market), {
      orders: "1",
      commands: "1",
      holds: "1",
      releases: "1",
    });
  });

  it("allows only one cross-instance owner for a market critical section", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const market = uniqueMarket();
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = withExchangeMarketExecutionLock(market, async () => {
      entered();
      await releasePromise;
      return "first";
    });
    await enteredPromise;
    const second = await withExchangeMarketExecutionLock(
      market,
      async () => "second",
      { tryOnly: true },
    );
    assert.deepEqual(second, { acquired: false, reason: "market_busy" });
    release();
    assert.deepEqual(await first, { acquired: true, value: "first" });
  });

  it("serializes cancellation and closes the remaining hold exactly once", {
    skip: !databaseConfigured,
    timeout: 45_000,
  }, async () => {
    const market = uniqueMarket();
    const userId = `exchange-cancel-${randomUUID()}`;
    await seedMarketAndBalance({ market, userId });
    const admitted = await admitExchangeOrderCommand(
      command({
        market,
        userId,
        timeInForce: "GTC",
      }),
    );
    assert.equal(admitted.status, "admitted");
    if (admitted.status !== "admitted") return;

    const processed = await processExchangeOrderCommand(
      admitted.commandId,
      `gtc-${randomUUID()}`,
    );
    assert.equal(processed.status, "final");
    if (processed.status !== "final") return;
    assert.equal(processed.order.status, "NEW");
    assert.equal(processed.outcome.accepted, true);

    const [first, second] = await Promise.all([
      getMatchingEngine().cancelOrder(admitted.order.id, userId),
      getMatchingEngine().cancelOrder(admitted.order.id, userId),
    ]);
    assert.equal(
      [first, second].filter((entry) => entry.cancelled).length,
      1,
    );
    assert.equal(
      [first.reason, second.reason].some((reason) =>
        ["market_busy", "order_already_terminal"].includes(reason ?? ""),
      ),
      true,
    );

    const snapshot = await readExchangeOrderCommand(admitted.commandId);
    assert.equal(snapshot?.order?.status, "CANCELLED");
    assert.deepEqual(await evidenceFor(userId, market), {
      orders: "1",
      commands: "1",
      holds: "1",
      releases: "1",
    });
  });
});
