import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { PLATFORM } from "../../lib/platform-config";
import { hashApiCommand } from "../../lib/security/api-command-idempotency";
import { cancelOrderIdempotently } from "../../lib/trading/order-cancel-authority";
import {
  admitExchangeOrderCommand,
  processExchangeOrderCommand,
  type ExchangeOrderAdmissionInput,
} from "../../lib/trading/order-command-service";
import {
  fingerprintExchangeMarket,
  fingerprintExchangeOrder,
} from "../../lib/trading/exchange-order-evidence";
import { getOrderHoldResidualTx } from "../../lib/trading/wallet-service";
import { isolateExchangeOrderTestCache } from "./exchange-order-test-environment";

const restoreTestCache = isolateExchangeOrderTestCache();
after(restoreTestCache);

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));

function uniqueMarket(): string {
  return `C${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}USDT`;
}

async function seedMarketAndBalance(market: string, userId: string): Promise<void> {
  const result = await withDb(async (client) => {
    await client.query(
      `INSERT INTO markets
        (symbol, base_asset, quote_asset, status, tick_size, step_size,
         min_order_value, max_order_value, price_precision,
         quantity_precision, maker_fee, taker_fee)
       VALUES ($1, $2, 'USDT', 'active', '0.01', '0.00001', '1', '1000000', 2, 5, '0.001', '0.001')
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

function admission(market: string, userId: string): ExchangeOrderAdmissionInput {
  return {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    userId,
    idempotencyKey: `admit-cancel-${randomUUID()}`,
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
  };
}

async function createCancelableOrder(market: string, userId: string) {
  await seedMarketAndBalance(market, userId);
  const admitted = await admitExchangeOrderCommand(admission(market, userId));
  assert.equal(admitted.status, "admitted");
  if (admitted.status !== "admitted") throw new Error("test_order_not_admitted");

  const finalized = await processExchangeOrderCommand(
    admitted.commandId,
    `cancel-evidence-worker-${randomUUID()}`,
  );
  assert.equal(finalized.status, "final");
  if (finalized.status !== "final") throw new Error("test_order_not_final");
  assert.equal(finalized.outcome.accepted, true);
  assert.equal(finalized.order.status, "NEW");
  return finalized.order;
}

async function cancellationState(userId: string, orderId: string) {
  const result = await withDb(async (client) => {
    const order = await client.query<{ status: string }>(
      "SELECT status FROM orders WHERE id = $1::uuid AND user_id = $2",
      [orderId, userId],
    );
    const counts = await client.query<{
      releases: string;
      evidence: string;
      events: string;
      receipts: string;
    }>(
      `SELECT
        (SELECT COUNT(*)::text FROM wallet_ledger
          WHERE wallet_id = $1 AND type = 'release'
            AND reference_type = 'order' AND reference_id = $2) AS releases,
        (SELECT COUNT(*)::text FROM sensitive_mutation_audit_events
          WHERE actor_id = $1 AND action = 'exchange.order.cancel') AS evidence,
        (SELECT COUNT(*)::text FROM order_events
          WHERE order_id = $2::uuid AND event_type = 'OrderCancelled') AS events,
        (SELECT COUNT(*)::text FROM api_command_receipts
          WHERE tenant_id = $3 AND principal_type = 'user'
            AND principal_id = $1 AND operation = 'order.cancel') AS receipts`,
      [userId, orderId, PLATFORM.DEFAULT_TENANT_ID],
    );
    const residual = await getOrderHoldResidualTx(client, userId, "USDT", orderId);
    return {
      status: order.rows[0]?.status ?? null,
      ...counts.rows[0]!,
      residual,
    };
  });
  assert.equal(result.enabled, true);
  if (!result.enabled) throw new Error("test_database_unavailable");
  return result.value;
}

describe("Exchange order cancellation mandatory evidence", () => {
  it("commits one cancellation event with exact hold release and replays without duplication", {
    skip: !databaseConfigured,
    timeout: 45_000,
  }, async () => {
    const market = uniqueMarket();
    const userId = `cancel-evidence-${randomUUID()}`;
    const order = await createCancelableOrder(market, userId);
    const idempotencyKey = `cancel-command-${randomUUID()}`;
    const requestHash = hashApiCommand({ orderId: order.id });

    const first = await cancelOrderIdempotently({
      orderId: order.id,
      userId,
      idempotencyKey,
      requestHash,
    });
    assert.deepEqual(first, { cancelled: true, orderId: order.id, replayed: false });

    const replay = await cancelOrderIdempotently({
      orderId: order.id,
      userId,
      idempotencyKey,
      requestHash,
    });
    assert.deepEqual(replay, { cancelled: true, orderId: order.id, replayed: true });

    assert.deepEqual(await cancellationState(userId, order.id), {
      status: "CANCELLED",
      releases: "1",
      evidence: "1",
      events: "1",
      receipts: "1",
      residual: "0",
    });

    const evidence = await withDb(async (client) => {
      const rows = await client.query<{
        resource_id: string;
        correlation_id: string;
        request_hash: string;
        metadata: Record<string, unknown>;
      }>(
        `SELECT resource_id, correlation_id, request_hash, metadata
           FROM sensitive_mutation_audit_events
          WHERE actor_id = $1 AND action = 'exchange.order.cancel'
          LIMIT 1`,
        [userId],
      );
      return rows.rows[0]!;
    });
    assert.equal(evidence.enabled, true);
    if (!evidence.enabled) return;
    assert.equal(evidence.value.resource_id, fingerprintExchangeOrder(order.id));
    assert.equal(evidence.value.request_hash, requestHash);
    assert.equal(evidence.value.correlation_id.includes(idempotencyKey), false);
    assert.equal(
      evidence.value.metadata.marketFingerprint,
      fingerprintExchangeMarket(market),
    );
    assert.equal(evidence.value.metadata.previousState, undefined);
    assert.equal(evidence.value.metadata.stateTransition, "NEW->CANCELLED");
    assert.equal(evidence.value.metadata.holdAsset, "USDT");
    assert.equal(evidence.value.metadata.releasedAmount, "10.01");
    assert.equal(evidence.value.metadata.holdClosed, true);
    assert.equal(JSON.stringify(evidence.value).includes(order.id), false);
  });

  it("rolls back cancellation, hold release, domain event and API receipt when mandatory evidence fails", {
    skip: !databaseConfigured,
    timeout: 45_000,
  }, async () => {
    const market = uniqueMarket();
    const userId = `cancel-evidence-reject-${randomUUID()}`;
    const order = await createCancelableOrder(market, userId);
    const idempotencyKey = `cancel-reject-${randomUUID()}`;
    const requestHash = hashApiCommand({ orderId: order.id });
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `test_reject_cancel_evidence_${suffix}`;
    const triggerName = `test_reject_cancel_evidence_trigger_${suffix}`;

    const installed = await withDb(async (client) => {
      await client.query(`
        CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.action = 'exchange.order.cancel' AND NEW.actor_id = '${userId}' THEN
            RAISE EXCEPTION 'injected_cancel_evidence_rejection';
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
      const rejected = await cancelOrderIdempotently({
        orderId: order.id,
        userId,
        idempotencyKey,
        requestHash,
      });
      assert.deepEqual(rejected, {
        cancelled: false,
        orderId: order.id,
        reason: "cancel_failed",
      });
      assert.deepEqual(await cancellationState(userId, order.id), {
        status: "NEW",
        releases: "0",
        evidence: "0",
        events: "0",
        receipts: "0",
        residual: "10.0100000000",
      });
    } finally {
      await withDb((client) =>
        client.query(`
          DROP TRIGGER IF EXISTS ${triggerName} ON sensitive_mutation_audit_events;
          DROP FUNCTION IF EXISTS ${functionName}();
        `),
      );
    }

    const retry = await cancelOrderIdempotently({
      orderId: order.id,
      userId,
      idempotencyKey,
      requestHash,
    });
    assert.deepEqual(retry, { cancelled: true, orderId: order.id, replayed: false });
    assert.deepEqual(await cancellationState(userId, order.id), {
      status: "CANCELLED",
      releases: "1",
      evidence: "1",
      events: "1",
      receipts: "1",
      residual: "0",
    });
  });
});
