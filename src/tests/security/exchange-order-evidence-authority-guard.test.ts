import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

const files = {
  audit: "src/lib/security/sensitive-mutation-audit.ts",
  evidence: "src/lib/trading/exchange-order-evidence.ts",
  migration: "src/lib/db-migrate-exchange-order-evidence.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  orderRoute: "src/app/api/orders/route.ts",
  cancelRoute: "src/app/api/orders/[id]/route.ts",
  command: "src/lib/trading/order-command-service.ts",
  cancel: "src/lib/trading/order-cancel-authority.ts",
  engine: "src/lib/trading/engine.ts",
  orderService: "src/lib/trading/order-service.ts",
  tradeService: "src/lib/trading/trade-service.ts",
  evidenceTests: "src/tests/security/exchange-order-transactional-evidence-postgres.test.ts",
};

async function sourceMap(): Promise<Record<keyof typeof files, string>> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(files).map(async ([key, filename]) => [
        key,
        await readFile(filename, "utf8"),
      ]),
    ),
  ) as Record<keyof typeof files, string>;
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const filename = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(filename) : [filename];
    }),
  );
  return nested.flat();
}

describe("Exchange order evidence source authority", () => {
  it("requires every financial transition to have typed transaction-coupled evidence", async () => {
    const source = await sourceMap();

    for (const action of [
      "exchange.order.admit",
      "exchange.order.accept",
      "exchange.order.reject",
      "exchange.order.cancel",
      "exchange.order.fill",
      "exchange.order.settle",
    ]) {
      assert.match(source.audit, new RegExp(action.replaceAll(".", "\\.")));
      assert.match(source.migration, new RegExp(action.replaceAll(".", "\\.")));
    }
    for (const resource of ["exchange_order", "order_cancel", "order_settlement"]) {
      assert.match(source.audit, new RegExp(resource));
      assert.match(source.migration, new RegExp(resource));
    }

    for (const forbidden of [
      '"orderid"',
      '"order_id"',
      '"tradeid"',
      '"trade_id"',
      '"walletid"',
      '"wallet_id"',
    ]) {
      assert.equal(source.audit.includes(forbidden), true);
      assert.equal(source.migration.includes(forbidden.replaceAll('"', "'")), true);
    }

    for (const helper of [
      "fingerprintExchangeOrder",
      "fingerprintExchangeTrade",
      "writeExchangeOrderEvidenceTx",
    ]) {
      assert.equal(source.evidence.includes(helper), true);
    }
    for (const helper of [
      "tecpey_exchange_evidence_hash",
      "tecpey_insert_exchange_evidence",
    ]) {
      assert.equal(source.migration.includes(helper), true);
    }

    for (const invariant of [
      'FILENAME = "0037_exchange_order_evidence_authority.sql"',
      "exchange_order_command_admission_evidence",
      "exchange_order_command_final_evidence",
      "exchange_order_terminal_evidence",
      "exchange_trade_settlement_evidence",
      "DEFERRABLE INITIALLY DEFERRED",
      "exchange_order_terminal_hold_not_closed",
      "exchange_trade_settlement_incomplete",
    ]) {
      assert.equal(source.migration.includes(invariant), true, invariant);
    }
    assert.equal(
      source.migrationPlan.includes("runExchangeOrderEvidenceMigrations"),
      true,
    );

    for (const route of [source.orderRoute, source.cancelRoute]) {
      assert.equal(route.includes("writeAudit("), false);
      assert.equal(route.includes("strictRevocation: true"), true);
    }
    assert.equal(source.orderRoute.includes("admitExchangeOrderCommand"), true);
    assert.equal(source.cancelRoute.includes("cancelOrderIdempotently"), true);

    for (const invariant of [
      "createOrderTx",
      "holdOrderFundsTx",
      "exchange_order_commands",
      "withTx",
    ]) {
      assert.equal(source.command.includes(invariant), true, invariant);
    }
    for (const invariant of [
      "FOR UPDATE",
      "releaseOrderResidualTx",
      "assertOrderHoldClosedTx",
      "completeApiCommandTx",
      "withTx",
    ]) {
      assert.equal(source.cancel.includes(invariant), true, invariant);
    }
    for (const invariant of [
      "createTradeTx",
      "releaseMatchedOrderFundsTx",
      "debitBalanceTx",
      "creditBalanceTx",
      "updateOrderFillTx",
      "commitDomainEventTx",
      "withTx",
    ]) {
      assert.equal(source.engine.includes(invariant), true, invariant);
    }

    assert.equal(source.orderService.includes("createOrderTx"), true);
    assert.equal(source.orderService.includes("updateOrderFillTx"), true);
    assert.equal(source.tradeService.includes("createTradeTx"), true);

    for (const evidence of [
      "commits order, exact hold, command and secret-free admission evidence atomically",
      "rolls back order, hold and command when mandatory admission evidence is rejected",
      "commits cancellation, complete hold release, receipt and typed evidence together",
      "rolls back cancellation and hold release when mandatory cancel evidence is rejected",
      "rejects and rolls back a trade that lacks complete wallet settlement",
      "commits fill and settlement evidence only with complete debit and credit legs",
    ]) {
      assert.equal(source.evidenceTests.includes(evidence), true, evidence);
    }
  });

  it("forbids public API routes from invoking legacy order or trade mutation wrappers", async () => {
    const apiFiles = (await listFiles("src/app/api")).filter((filename) =>
      /\.(?:ts|tsx)$/.test(filename),
    );
    const forbiddenCalls = [
      "createOrder(",
      "updateOrderFill(",
      "setOrderStatus(",
      "cancelOrder(",
      "createTrade(",
    ];

    for (const filename of apiFiles) {
      const source = await readFile(filename, "utf8");
      for (const forbiddenCall of forbiddenCalls) {
        assert.equal(
          source.includes(forbiddenCall),
          false,
          `${filename} invokes legacy mutation ${forbiddenCall}`,
        );
      }
    }
  });
});
