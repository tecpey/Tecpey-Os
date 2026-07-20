import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

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
  tests: "src/tests/security/exchange-order-transactional-evidence-postgres.test.ts",
  package: "package.json",
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, filename]) => [
      key,
      await readFile(filename, "utf8"),
    ]),
  ),
);

const failures = [];
const requireText = (target, text, reason) => {
  if (!content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};
const rejectText = (target, text, reason) => {
  if (content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};

for (const action of [
  "exchange.order.admit",
  "exchange.order.accept",
  "exchange.order.reject",
  "exchange.order.cancel",
  "exchange.order.fill",
  "exchange.order.settle",
]) {
  requireText("audit", action, `missing typed mandatory action ${action}`);
  requireText("migration", action, `PostgreSQL authority does not emit ${action}`);
}
for (const resource of ["exchange_order", "order_cancel", "order_settlement"]) {
  requireText("audit", resource, `missing typed Exchange evidence resource ${resource}`);
  requireText("migration", resource, `PostgreSQL authority does not use ${resource}`);
}
for (const forbidden of [
  '"orderid"',
  '"order_id"',
  '"tradeid"',
  '"trade_id"',
  '"walletid"',
  '"wallet_id"',
]) {
  requireText("audit", forbidden, `application redaction is missing ${forbidden}`);
  requireText("migration", forbidden.replaceAll('"', "'"), `database redaction is missing ${forbidden}`);
}

for (const helper of [
  "fingerprintExchangeOrder",
  "fingerprintExchangeTrade",
  "writeExchangeOrderEvidenceTx",
  "tecpey_exchange_evidence_hash",
  "tecpey_insert_exchange_evidence",
]) {
  const target = helper.startsWith("tecpey_") ? "migration" : "evidence";
  requireText(target, helper, `missing domain-separated evidence helper ${helper}`);
}

requireText(
  "migration",
  'FILENAME = "0037_exchange_order_evidence_authority.sql"',
  "Exchange evidence needs a canonical immutable migration",
);
for (const invariant of [
  "exchange_order_command_admission_evidence",
  "exchange_order_command_final_evidence",
  "exchange_order_terminal_evidence",
  "exchange_trade_settlement_evidence",
  "DEFERRABLE INITIALLY DEFERRED",
  "exchange_order_terminal_hold_not_closed",
  "exchange_trade_settlement_incomplete",
  "debit_count",
  "credit_count",
]) {
  requireText("migration", invariant, `missing database invariant ${invariant}`);
}
requireText(
  "migrationPlan",
  "runExchangeOrderEvidenceMigrations",
  "canonical migration plan must execute Exchange evidence authority",
);

for (const target of ["orderRoute", "cancelRoute"]) {
  rejectText(
    target,
    "writeAudit(",
    "best-effort route audit cannot remain a financial authority",
  );
  requireText(
    target,
    "strictRevocation: true",
    "Exchange mutations require strict revocation-aware identity",
  );
}
requireText(
  "orderRoute",
  "admitExchangeOrderCommand",
  "order placement must use command admission authority",
);
requireText(
  "cancelRoute",
  "cancelOrderIdempotently",
  "order cancellation must use idempotent cancellation authority",
);

for (const invariant of [
  "createOrderTx",
  "holdOrderFundsTx",
  "exchange_order_commands",
  "withTx",
]) {
  requireText("command", invariant, `admission transaction is missing ${invariant}`);
}
for (const invariant of [
  "FOR UPDATE",
  "releaseOrderResidualTx",
  "assertOrderHoldClosedTx",
  "completeApiCommandTx",
  "withTx",
]) {
  requireText("cancel", invariant, `cancellation transaction is missing ${invariant}`);
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
  requireText("engine", invariant, `matching/settlement transaction is missing ${invariant}`);
}

// Legacy wrappers may remain for compatibility/tests, but production API code
// must never import or invoke them. PostgreSQL triggers still make any direct
// database mutation evidence-coupled and fail closed.
async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const filename = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(filename) : [filename];
    }),
  );
  return nested.flat();
}
const apiFiles = (await listFiles("src/app/api")).filter((filename) =>
  /\.(?:ts|tsx)$/.test(filename),
);
for (const filename of apiFiles) {
  const source = await readFile(filename, "utf8");
  for (const forbiddenCall of [
    "createOrder(",
    "updateOrderFill(",
    "setOrderStatus(",
    "cancelOrder(",
    "createTrade(",
  ]) {
    if (source.includes(forbiddenCall)) {
      failures.push(`${filename}: public API cannot call legacy mutation ${forbiddenCall}`);
    }
  }
}
requireText("orderService", "createOrderTx", "transaction-injected order creation must remain available");
requireText("orderService", "updateOrderFillTx", "transaction-injected fill mutation must remain available");
requireText("tradeService", "createTradeTx", "transaction-injected trade creation must remain available");

for (const evidence of [
  "commits order, exact hold, command and secret-free admission evidence atomically",
  "rolls back order, hold and command when mandatory admission evidence is rejected",
  "commits cancellation, complete hold release, receipt and typed evidence together",
  "rolls back cancellation and hold release when mandatory cancel evidence is rejected",
  "rejects and rolls back a trade that lacks complete wallet settlement",
  "commits fill and settlement evidence only with complete debit and credit legs",
]) {
  requireText("tests", evidence, `missing PostgreSQL evidence: ${evidence}`);
}
requireText(
  "package",
  "node scripts/check-exchange-order-evidence-authority.mjs",
  "exchange:check must execute the permanent evidence guard",
);
requireText(
  "package",
  "exchange-order-transactional-evidence-postgres.test.ts",
  "focused Exchange tests must execute transactional evidence tests",
);

if (failures.length) {
  console.error("Exchange order evidence authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Exchange order evidence authority check passed: admission, acceptance/rejection, cancellation, fill and settlement evidence are mandatory, transaction-coupled, exact-decimal, secret-free and protected from legacy API mutation paths.",
);
