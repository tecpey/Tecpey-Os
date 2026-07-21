import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { D } from "../../lib/trading/decimal";
import {
  admitExchangeOrderCommand,
  processExchangeOrderCommand,
} from "../../lib/trading/order-command-service";
import { EXCHANGE_FEE_WALLET_ID } from "../../lib/trading/matching-settlement-authority";
import { PLATFORM } from "../../lib/platform-config";
import { isolateExchangeOrderTestCache } from "./exchange-order-test-environment";

const restoreTestCache = isolateExchangeOrderTestCache();
after(restoreTestCache);

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));

type Balance = {
  user_id: string;
  asset: string;
  available: string;
  held: string;
};

async function admitAndProcess(input: {
  userId: string;
  market: string;
  side: "buy" | "sell";
  quantity: string;
  price: string;
  timeInForce?: "GTC" | "IOC" | "FOK";
  holdAsset: string;
  holdAmount: string;
}) {
  const admitted = await admitExchangeOrderCommand({
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    userId: input.userId,
    idempotencyKey: `decimal-${randomUUID()}`,
    request: {
      market: input.market,
      side: input.side,
      type: "limit",
      quantity: input.quantity,
      price: input.price,
      timeInForce: input.timeInForce ?? "GTC",
    },
    hold: { asset: input.holdAsset, amount: input.holdAmount },
  });
  assert.equal(admitted.status, "admitted");
  if (admitted.status !== "admitted") throw new Error("test_order_not_admitted");
  const processed = await processExchangeOrderCommand(
    admitted.commandId,
    `decimal-worker-${randomUUID()}`,
  );
  assert.equal(
    processed.status,
    "final",
    `exchange command did not finalize: ${JSON.stringify(processed)}`,
  );
  if (processed.status !== "final") throw new Error("test_order_not_final");
  return { admitted, processed };
}

function byBalance(rows: Balance[]): Map<string, Balance> {
  return new Map(rows.map((row) => [`${row.user_id}:${row.asset}`, row]));
}

function assertAmount(actual: string | undefined, expected: string): void {
  assert.equal(D(actual ?? "NaN").eq(expected), true, `${actual} != ${expected}`);
}

describe("Exchange Decimal settlement conservation", () => {
  it("conserves quote, base and both fees across two partial maker fills", {
    skip: !databaseConfigured,
    timeout: 60_000,
  }, async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
    const baseAsset = `D${suffix}`;
    const market = `${baseAsset}USDT`;
    const buyerId = `decimal-buyer-${randomUUID()}`;
    const sellerOneId = `decimal-seller-one-${randomUUID()}`;
    const sellerTwoId = `decimal-seller-two-${randomUUID()}`;

    const setup = await withDb(async (client) => {
      await client.query(
        `INSERT INTO markets
          (symbol, base_asset, quote_asset, status, tick_size, step_size,
           min_order_value, max_order_value, price_precision,
           quantity_precision, maker_fee, taker_fee)
         VALUES ($1, $2, 'USDT', 'active', '0.0000000001', '0.0000000001',
                 '0.0000000001', '1000000', 10, 10, '0.001', '0.001')`,
        [market, baseAsset],
      );
      await client.query(
        `INSERT INTO wallet_balances
          (user_id, asset, available_balance, held_balance)
         VALUES
          ($1, 'USDT', '1.0000000000', 0),
          ($2, $4, '1.0000000000', 0),
          ($3, $4, '1.0000000000', 0)`,
        [buyerId, sellerOneId, sellerTwoId, baseAsset],
      );
      return true;
    });
    assert.equal(setup.enabled, true);
    if (!setup.enabled) return;

    const makerOne = await admitAndProcess({
      userId: sellerOneId,
      market,
      side: "sell",
      quantity: "0.1000000000",
      price: "0.1000000000",
      holdAsset: baseAsset,
      holdAmount: "0.1000000000",
    });
    assert.equal(makerOne.processed.outcome.accepted, true);
    assert.equal(makerOne.processed.order.status, "NEW");

    const makerTwo = await admitAndProcess({
      userId: sellerTwoId,
      market,
      side: "sell",
      quantity: "0.2000000000",
      price: "0.2000000000",
      holdAsset: baseAsset,
      holdAmount: "0.2000000000",
    });
    assert.equal(makerTwo.processed.outcome.accepted, true);
    assert.equal(makerTwo.processed.order.status, "NEW");

    const taker = await admitAndProcess({
      userId: buyerId,
      market,
      side: "buy",
      quantity: "0.3000000000",
      price: "0.2000000000",
      holdAsset: "USDT",
      holdAmount: "0.0600600000",
    });
    assert.equal(taker.processed.outcome.accepted, true);
    assert.equal(taker.processed.outcome.tradeIds.length, 2);
    assert.equal(taker.processed.order.status, "FILLED");
    assertAmount(taker.processed.order.avgFillPrice ?? undefined, "0.1666666666");
    assertAmount(taker.processed.order.remainingQuantity, "0");

    const evidence = await withDb(async (client) => {
      const balances = await client.query<Balance>(
        `SELECT user_id, asset,
                available_balance::text AS available,
                held_balance::text AS held
           FROM wallet_balances
          WHERE user_id = ANY($1::text[])
            AND asset = ANY($2::text[])
          ORDER BY user_id, asset`,
        [[buyerId, sellerOneId, sellerTwoId, EXCHANGE_FEE_WALLET_ID], [baseAsset, "USDT"]],
      );
      const trades = await client.query<{
        price: string;
        quantity: string;
        fee_buyer: string;
        fee_seller: string;
      }>(
        `SELECT price::text, quantity::text,
                fee_buyer::text, fee_seller::text
           FROM trades
          WHERE id = ANY($1::uuid[])
          ORDER BY price`,
        [taker.processed.outcome.tradeIds],
      );
      const residuals = await client.query<{ reference_id: string; residual: string }>(
        `SELECT reference_id,
                SUM(CASE WHEN type = 'hold' THEN amount
                         WHEN type = 'release' THEN -amount
                         ELSE 0 END)::text AS residual
           FROM wallet_ledger
          WHERE reference_type = 'order'
            AND reference_id = ANY($1::text[])
          GROUP BY reference_id
          ORDER BY reference_id`,
        [[makerOne.admitted.order.id, makerTwo.admitted.order.id, taker.admitted.order.id]],
      );
      const platformCredits = await client.query<{ amount: string }>(
        `SELECT amount::text
           FROM wallet_ledger
          WHERE wallet_id = $1
            AND asset = 'USDT'
            AND type = 'trade_credit'
            AND reference_id = ANY($2::text[])
          ORDER BY amount`,
        [EXCHANGE_FEE_WALLET_ID, taker.processed.outcome.tradeIds],
      );
      return {
        balances: balances.rows,
        trades: trades.rows,
        residuals: residuals.rows,
        platformCredits: platformCredits.rows,
      };
    });
    assert.equal(evidence.enabled, true);
    if (!evidence.enabled) return;

    assert.deepEqual(evidence.value.trades, [
      {
        price: "0.1000000000",
        quantity: "0.1000000000",
        fee_buyer: "0.0000100000",
        fee_seller: "0.0000100000",
      },
      {
        price: "0.2000000000",
        quantity: "0.2000000000",
        fee_buyer: "0.0000400000",
        fee_seller: "0.0000400000",
      },
    ]);
    assert.equal(evidence.value.residuals.length, 3);
    assert.equal(
      evidence.value.residuals.every((row) => D(row.residual).isZero()),
      true,
    );
    assert.equal(evidence.value.platformCredits.length, 2);
    assertAmount(evidence.value.platformCredits[0]?.amount, "0.0000200000");
    assertAmount(evidence.value.platformCredits[1]?.amount, "0.0000800000");

    const platformCreditTotal = evidence.value.platformCredits.reduce(
      (sum, row) => sum.plus(D(row.amount)),
      D(0),
    );
    assertAmount(platformCreditTotal.toFixed(10), "0.0001000000");

    const balances = byBalance(evidence.value.balances);
    assertAmount(balances.get(`${buyerId}:USDT`)?.available, "0.9499500000");
    assertAmount(balances.get(`${buyerId}:USDT`)?.held, "0");
    assertAmount(balances.get(`${buyerId}:${baseAsset}`)?.available, "0.3000000000");
    assertAmount(balances.get(`${sellerOneId}:${baseAsset}`)?.available, "0.9000000000");
    assertAmount(balances.get(`${sellerOneId}:USDT`)?.available, "0.0099900000");
    assertAmount(balances.get(`${sellerTwoId}:${baseAsset}`)?.available, "0.8000000000");
    assertAmount(balances.get(`${sellerTwoId}:USDT`)?.available, "0.0399600000");

    const platformAfter = balances.get(`${EXCHANGE_FEE_WALLET_ID}:USDT`);
    assert.ok(platformAfter, "platform fee wallet balance must exist");
    assert.equal(D(platformAfter.available).gte(platformCreditTotal), true);

    const quoteTotal = [
      balances.get(`${buyerId}:USDT`)?.available,
      balances.get(`${sellerOneId}:USDT`)?.available,
      balances.get(`${sellerTwoId}:USDT`)?.available,
      platformCreditTotal.toFixed(10),
    ].reduce((sum, value) => sum.plus(D(value ?? "0")), D(0));
    assertAmount(quoteTotal.toFixed(10), "1.0000000000");

    const baseTotal = [
      balances.get(`${buyerId}:${baseAsset}`)?.available,
      balances.get(`${sellerOneId}:${baseAsset}`)?.available,
      balances.get(`${sellerTwoId}:${baseAsset}`)?.available,
    ].reduce((sum, value) => sum.plus(D(value ?? "0")), D(0));
    assertAmount(baseTotal.toFixed(10), "2.0000000000");
  });
});
