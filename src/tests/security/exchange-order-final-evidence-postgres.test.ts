import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { PLATFORM } from "../../lib/platform-config";
import {
  admitExchangeOrderCommand,
  hashExchangeOrderCommand,
  processExchangeOrderCommand,
  type ExchangeOrderAdmissionInput,
} from "../../lib/trading/order-command-service";
import { D } from "../../lib/trading/decimal";
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
  return `F${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}USDT`;
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

function admission(input: {
  market: string;
  userId: string;
  timeInForce: "GTC" | "FOK";
}): ExchangeOrderAdmissionInput {
  return {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    userId: input.userId,
    idempotencyKey: `final-evidence-${randomUUID()}`,
    request: {
      market: input.market,
      side: "buy",
      type: "limit",
      quantity: "0.10000",
      price: "100.00",
      timeInForce: input.timeInForce,
      clientOrderId: `client-${randomUUID()}`,
    },
    hold: { asset: "USDT", amount: "10.0100000000" },
  };
}

async function commandState(commandId: string) {
  const result = await withDb(async (client) => {
    const rows = await client.query<{
      state: string;
      last_error_code: string | null;
    }>(
      `SELECT state, last_error_code
         FROM exchange_order_commands
        WHERE id = $1::uuid`,
      [commandId],
    );
    return rows.rows[0]!;
  });
  assert.equal(result.enabled, true);
  if (!result.enabled) throw new Error("test_database_unavailable");
  return result.value;
}

async function finalEvidence(userId: string, orderId: string) {
  const result = await withDb(async (client) => {
    const rows = await client.query<{
      actor_type: string;
      actor_id: string;
      action: string;
      outcome: string;
      resource_id: string;
      correlation_id: string;
      request_hash: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT actor_type, actor_id, action, outcome, resource_id,
              correlation_id, request_hash, metadata
         FROM sensitive_mutation_audit_events
        WHERE resource_id = $1
          AND action IN ('exchange.order.finalize', 'exchange.order.reject')
        ORDER BY created_at, id`,
      [fingerprintExchangeOrder(orderId)],
    );
    const residual = await getOrderHoldResidualTx(client, userId, "USDT", orderId);
    const state = await client.query<{ status: string }>(
      "SELECT status FROM orders WHERE id = $1::uuid AND user_id = $2",
      [orderId, userId],
    );
    const releases = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM wallet_ledger
        WHERE wallet_id = $1 AND type = 'release'
          AND reference_type = 'order' AND reference_id = $2`,
      [userId, orderId],
    );
    const events = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM order_events
        WHERE order_id = $1::uuid
          AND event_type IN ('OrderAccepted', 'OrderPartiallyFilled', 'OrderFilled', 'OrderExpired', 'OrderRejected')`,
      [orderId],
    );
    return {
      rows: rows.rows,
      residual: D(residual).toFixed(),
      status: state.rows[0]?.status ?? null,
      releases: releases.rows[0]?.count ?? "0",
      events: events.rows[0]?.count ?? "0",
    };
  });
  assert.equal(result.enabled, true);
  if (!result.enabled) throw new Error("test_database_unavailable");
  return result.value;
}

describe("Exchange order final outcome mandatory evidence", () => {
  it("blocks a forged final command and commits one accepted finalization event", {
    skip: !databaseConfigured,
    timeout: 45_000,
  }, async () => {
    const market = uniqueMarket();
    const userId = `final-evidence-accepted-${randomUUID()}`;
    await seedMarketAndBalance(market, userId);
    const input = admission({ market, userId, timeInForce: "GTC" });
    const admitted = await admitExchangeOrderCommand(input);
    assert.equal(admitted.status, "admitted");
    if (admitted.status !== "admitted") throw new Error("test_order_not_admitted");

    const forged = await withDb((client) =>
      client.query(
        `UPDATE exchange_order_commands
            SET state = 'final',
                result = $2::jsonb,
                finalized_at = NOW()
          WHERE id = $1::uuid`,
        [
          admitted.commandId,
          JSON.stringify({
            accepted: true,
            tradeIds: [],
            orderStatus: "NEW",
          }),
        ],
      ),
    );
    assert.equal(forged.enabled, false);
    assert.equal((await commandState(admitted.commandId)).state, "admitted");

    const processed = await processExchangeOrderCommand(
      admitted.commandId,
      `final-evidence-worker-${randomUUID()}`,
    );
    assert.equal(processed.status, "final");
    if (processed.status !== "final") throw new Error("test_order_not_final");
    assert.equal(processed.outcome.accepted, true);
    assert.equal(processed.order.status, "NEW");

    const evidence = await finalEvidence(userId, processed.order.id);
    assert.equal(evidence.rows.length, 1);
    const row = evidence.rows[0]!;
    assert.equal(row.actor_type, "service");
    assert.equal(row.actor_id, "exchange-order-worker");
    assert.equal(row.action, "exchange.order.finalize");
    assert.equal(row.outcome, "success");
    assert.equal(row.resource_id, fingerprintExchangeOrder(processed.order.id));
    assert.equal(row.request_hash, hashExchangeOrderCommand(input));
    assert.equal(row.correlation_id.includes(admitted.commandId), false);
    assert.equal(row.metadata.marketFingerprint, fingerprintExchangeMarket(market));
    assert.equal(row.metadata.finalState, "NEW");
    assert.equal(row.metadata.accepted, true);
    assert.equal(row.metadata.tradeCount, 0);
    assert.equal(row.metadata.tradeSetFingerprint, null);
    assert.equal(row.metadata.holdClosed, false);
    assert.equal(evidence.residual, "10.01");
    assert.equal(evidence.releases, "0");
    assert.equal(evidence.events, "1");
    assert.equal((await commandState(admitted.commandId)).state, "final");
  });

  it("commits rejected terminal evidence only after exact hold closure", {
    skip: !databaseConfigured,
    timeout: 45_000,
  }, async () => {
    const market = uniqueMarket();
    const userId = `final-evidence-rejected-${randomUUID()}`;
    await seedMarketAndBalance(market, userId);
    const input = admission({ market, userId, timeInForce: "FOK" });
    const admitted = await admitExchangeOrderCommand(input);
    assert.equal(admitted.status, "admitted");
    if (admitted.status !== "admitted") throw new Error("test_order_not_admitted");

    const processed = await processExchangeOrderCommand(
      admitted.commandId,
      `reject-evidence-worker-${randomUUID()}`,
    );
    assert.equal(processed.status, "final");
    if (processed.status !== "final") throw new Error("test_order_not_final");
    assert.equal(processed.outcome.accepted, false);
    assert.equal(processed.outcome.reason, "fok_insufficient_liquidity");
    assert.equal(processed.order.status, "EXPIRED");

    const evidence = await finalEvidence(userId, processed.order.id);
    assert.equal(evidence.rows.length, 1);
    const row = evidence.rows[0]!;
    assert.equal(row.action, "exchange.order.reject");
    assert.equal(row.outcome, "rejected");
    assert.equal(row.request_hash, hashExchangeOrderCommand(input));
    assert.equal(row.metadata.finalState, "EXPIRED");
    assert.equal(row.metadata.accepted, false);
    assert.equal(row.metadata.reasonCode, "fok_insufficient_liquidity");
    assert.equal(row.metadata.tradeCount, 0);
    assert.equal(row.metadata.holdClosed, true);
    assert.equal(evidence.residual, "0");
    assert.equal(evidence.releases, "1");
    assert.equal(evidence.events, "1");
    assert.equal((await commandState(admitted.commandId)).state, "final");
  });

  it("rolls back terminal order state and hold release when rejected evidence fails, then recovers", {
    skip: !databaseConfigured,
    timeout: 60_000,
  }, async () => {
    const market = uniqueMarket();
    const userId = `final-evidence-failure-${randomUUID()}`;
    await seedMarketAndBalance(market, userId);
    const input = admission({ market, userId, timeInForce: "FOK" });
    const admitted = await admitExchangeOrderCommand(input);
    assert.equal(admitted.status, "admitted");
    if (admitted.status !== "admitted") throw new Error("test_order_not_admitted");
    const resourceId = fingerprintExchangeOrder(admitted.order.id);
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `test_reject_final_evidence_${suffix}`;
    const triggerName = `test_reject_final_evidence_trigger_${suffix}`;

    const installed = await withDb(async (client) => {
      await client.query(`
        CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.action = 'exchange.order.reject'
            AND NEW.resource_id = '${resourceId}'
          THEN
            RAISE EXCEPTION 'injected_final_evidence_rejection';
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
      const failed = await processExchangeOrderCommand(
        admitted.commandId,
        `reject-failure-worker-${randomUUID()}`,
      );
      assert.equal(failed.status, "queued");
      if (failed.status !== "queued") throw new Error("test_command_not_retryable");
      assert.equal(failed.reason, "matching_failed");

      const evidence = await finalEvidence(userId, admitted.order.id);
      assert.equal(evidence.rows.length, 0);
      assert.equal(evidence.status, "NEW");
      assert.equal(evidence.residual, "10.01");
      assert.equal(evidence.releases, "0");
      assert.equal(evidence.events, "0");
      const state = await commandState(admitted.commandId);
      assert.equal(state.state, "retryable");
      assert.equal(state.last_error_code, "matching_failed");
    } finally {
      await withDb((client) =>
        client.query(`
          DROP TRIGGER IF EXISTS ${triggerName} ON sensitive_mutation_audit_events;
          DROP FUNCTION IF EXISTS ${functionName}();
        `),
      );
    }

    const recovered = await processExchangeOrderCommand(
      admitted.commandId,
      `reject-recovery-worker-${randomUUID()}`,
    );
    assert.equal(recovered.status, "final");
    if (recovered.status !== "final") throw new Error("test_command_not_recovered");
    assert.equal(recovered.outcome.accepted, false);
    assert.equal(recovered.order.status, "EXPIRED");

    const evidence = await finalEvidence(userId, admitted.order.id);
    assert.equal(evidence.rows.length, 1);
    assert.equal(evidence.rows[0]?.action, "exchange.order.reject");
    assert.equal(evidence.status, "EXPIRED");
    assert.equal(evidence.residual, "0");
    assert.equal(evidence.releases, "1");
    assert.equal(evidence.events, "1");
    assert.equal((await commandState(admitted.commandId)).state, "final");
  });
});
