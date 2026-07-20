import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const audit = read("src/lib/security/sensitive-mutation-audit.ts");
const evidence = read("src/lib/trading/exchange-order-evidence.ts");
const migration = read("src/lib/db-migrate-exchange-order-evidence.ts");
const finalGateMigration = read(
  "src/lib/db-migrate-exchange-order-final-evidence-gate.ts",
);
const migrationPlan = read("src/lib/db-migration-plan.ts");
const orderRoute = read("src/app/api/orders/route.ts");
const cancelAuthority = read("src/lib/trading/order-cancel-authority.ts");
const cancelRoute = read("src/app/api/orders/[id]/route.ts");
const orderService = read("src/lib/trading/order-service.ts");
const walletService = read("src/lib/trading/wallet-service.ts");
const engine = read("src/lib/trading/engine.ts");
const postgresTest = read("src/tests/security/exchange-order-evidence-postgres.test.ts");
const cancelPostgresTest = read(
  "src/tests/security/exchange-order-cancel-evidence-postgres.test.ts",
);
const finalPostgresTest = read(
  "src/tests/security/exchange-order-final-evidence-postgres.test.ts",
);
const unitTest = read("src/tests/security/exchange-order-evidence.test.ts");
const inventory = read("docs/security/EXCHANGE_ORDER_EVIDENCE_INVENTORY.md");

const failures = [];
const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const rejectText = (source, text, message) => {
  if (source.includes(text)) failures.push(message);
};

for (const action of [
  '"exchange.order.admit"',
  '"exchange.order.finalize"',
  '"exchange.order.reject"',
  '"exchange.order.cancel"',
]) {
  requireText(audit, action, `typed mandatory Exchange action is missing: ${action}`);
}
requireText(
  audit,
  '| "exchange_order"',
  "typed exchange_order audit resource is missing",
);

for (const invariant of [
  "EXCHANGE_ORDER_EVIDENCE_POLICY_VERSION",
  "fingerprintExchangeOrder",
  "fingerprintExchangeMarket",
  "buildExchangeOrderAdmitEvidence",
  "buildExchangeOrderFinalEvidence",
  "buildExchangeOrderCancelEvidence",
  "tradeSetFingerprint",
  "releasedAmount",
  "\\u001f",
]) {
  requireText(evidence, invariant, `bounded Exchange evidence invariant is missing: ${invariant}`);
}
for (const forbidden of [
  "metadata: { orderId",
  "metadata: { userId",
  "tradeIds: tradeIds",
]) {
  rejectText(
    evidence,
    forbidden,
    `Exchange evidence must not expose raw authority material in metadata: ${forbidden}`,
  );
}

for (const invariant of [
  'FILENAME = "0037_exchange_order_transactional_evidence.sql"',
  "legacy exchange order commands require explicit reconciliation",
  "legacy final exchange order commands require explicit final evidence reconciliation",
  "tecpey_append_exchange_order_admission_evidence",
  "AFTER INSERT ON exchange_order_commands",
  "tecpey_append_exchange_order_final_evidence",
  "OrderAccepted",
  "OrderPartiallyFilled",
  "OrderFilled",
  "OrderExpired",
  "OrderRejected",
  "trade_count_value > 10000",
  "hold_residual_value <> 0",
  "'exchange.order.admit'",
  "'exchange.order.finalize'",
  "'exchange.order.reject'",
  "'exchange_order'",
  "'exchange-order-worker'",
  "evidence.actor_id = command.user_id",
  "evidence.resource_id = 'exchange-order-'",
  "evidence.correlation_id = 'exchange-order-admit-'",
  "NEW.request_hash",
  "NEW.hold_amount::text",
  "holdRepresentation",
  "wallet_ledger",
  "tradeSetFingerprint",
  "holdClosed",
  "chr(31)",
  "sha256(",
]) {
  requireText(
    migration,
    invariant,
    `transactional Exchange evidence migration is missing: ${invariant}`,
  );
}
for (const forbidden of [
  "ON CONFLICT DO NOTHING",
  "chr(0)",
]) {
  rejectText(
    migration,
    forbidden,
    `mandatory Exchange evidence migration contains forbidden authority behavior: ${forbidden}`,
  );
}
if (/\bdigest\(\s*convert_to\(/m.test(migration)) {
  failures.push(
    "Exchange evidence SQL must not depend on the pgcrypto digest(convert_to(...)) function",
  );
}

for (const invariant of [
  'FILENAME = "0038_exchange_order_final_evidence_gate.sql"',
  "CREATE CONSTRAINT TRIGGER exchange_order_final_evidence",
  "DEFERRABLE INITIALLY DEFERRED",
  "tecpey_append_exchange_order_final_evidence",
  "tecpey_require_exchange_order_final_evidence",
  "BEFORE UPDATE OF state, result ON exchange_order_commands",
  "exchange order final command result is invalid",
  "exchange order final evidence is missing or mismatched",
  "evidence.actor_type = 'service'",
  "evidence.actor_id = 'exchange-order-worker'",
  "evidence.action = expected_action",
  "evidence.resource_id = expected_resource",
  "evidence.correlation_id = expected_correlation",
  "evidence.request_hash = NEW.request_hash",
  "evidence.metadata->>'finalState' = expected_final_state",
]) {
  requireText(
    finalGateMigration,
    invariant,
    `final Exchange command evidence gate is missing: ${invariant}`,
  );
}
for (const forbidden of ["NOT DEFERRABLE", "ON CONFLICT DO NOTHING", "chr(0)"]) {
  rejectText(
    finalGateMigration,
    forbidden,
    `final Exchange evidence gate contains forbidden behavior: ${forbidden}`,
  );
}

for (const invariant of [
  'import { runExchangeOrderEvidenceMigrations } from "./db-migrate-exchange-order-evidence"',
  'import { runExchangeOrderFinalEvidenceGateMigrations } from "./db-migrate-exchange-order-final-evidence-gate"',
  "await runSensitiveMutationAuditMigrations(client)",
  "await runExchangeOrderEvidenceMigrations(client)",
  "await runExchangeOrderFinalEvidenceGateMigrations(client)",
]) {
  requireText(
    migrationPlan,
    invariant,
    `canonical migration plan is missing Exchange evidence authority: ${invariant}`,
  );
}
const sensitiveIndex = migrationPlan.indexOf("await runSensitiveMutationAuditMigrations(client)");
const exchangeIndex = migrationPlan.indexOf("await runExchangeOrderEvidenceMigrations(client)");
const finalGateIndex = migrationPlan.indexOf(
  "await runExchangeOrderFinalEvidenceGateMigrations(client)",
);
if (
  sensitiveIndex < 0 ||
  exchangeIndex <= sensitiveIndex ||
  finalGateIndex <= exchangeIndex
) {
  failures.push(
    "Exchange evidence migrations must execute after sensitive audit authority and in admission-then-final-gate order",
  );
}

for (const invariant of [
  'import { writeSensitiveMutationAuditTx } from "@/lib/security/sensitive-mutation-audit"',
  "buildExchangeOrderCancelEvidence",
  "cancellationEvidenceContext",
  "const releasedAmount = await releaseOrderHoldResidualTx",
  "releasedAmount,",
  "await writeSensitiveMutationAuditTx(",
  "await completeApiCommandTx(client, scope",
]) {
  requireText(
    cancelAuthority,
    invariant,
    `transactional cancellation evidence invariant is missing: ${invariant}`,
  );
}
const cancelAuditIndex = cancelAuthority.indexOf("await writeSensitiveMutationAuditTx(");
const cancelReceiptIndex = cancelAuthority.indexOf(
  "await completeApiCommandTx(client, scope",
  cancelAuditIndex,
);
if (cancelAuditIndex < 0 || cancelReceiptIndex <= cancelAuditIndex) {
  failures.push(
    "mandatory cancellation evidence must commit before the successful API command receipt",
  );
}

for (const route of [
  { name: "placement", source: orderRoute },
  { name: "cancellation", source: cancelRoute },
]) {
  for (const forbidden of [
    "writeAudit(",
    "order_placed",
    "order_cancelled",
    'from "@/lib/security/audit-log"',
  ]) {
    rejectText(
      route.source,
      forbidden,
      `${route.name} route cannot retain best-effort audit authority: ${forbidden}`,
    );
  }
}
for (const invariant of [
  "admitExchangeOrderCommand",
  "processExchangeOrderCommand",
  "getCanonicalSession(req, { strictRevocation: true })",
]) {
  requireText(
    orderRoute,
    invariant,
    `placement route must retain canonical transactional authority: ${invariant}`,
  );
}
requireText(
  cancelRoute,
  "cancelOrderIdempotently",
  "order cancellation route must delegate to the canonical transactional authority",
);

for (const forbidden of [
  "createOrder(",
  "cancelOrder(",
  "postHold(",
  "postRelease(",
  "getMatchingEngine().cancelOrder(",
]) {
  rejectText(
    orderRoute,
    forbidden,
    `placement route cannot call a legacy split authority: ${forbidden}`,
  );
  rejectText(
    cancelRoute,
    forbidden,
    `cancellation route cannot call a legacy split authority: ${forbidden}`,
  );
}
requireText(
  orderService,
  "createOrderTx",
  "transactional order creation helper must remain available",
);
requireText(
  walletService,
  "releaseOrderHoldResidualTx",
  "ledger-derived residual hold release must remain authoritative",
);
requireText(
  engine,
  "commitTerminalOrder",
  "matching engine must retain the transactional terminal-order path",
);

for (const evidenceText of [
  "commits exactly one typed admission event with the order, hold, ledger and command",
  "rolls back order, hold, ledger, command and domain event when mandatory evidence is rejected",
  "Promise.all",
  "injected_exchange_evidence_rejection",
  "orders: \"0\"",
  "commands: \"0\"",
  "holds: \"0\"",
  "evidence: \"0\"",
]) {
  requireText(
    postgresTest,
    evidenceText,
    `missing PostgreSQL Exchange admission evidence proof: ${evidenceText}`,
  );
}
for (const evidenceText of [
  "commits one cancellation event with exact hold release and replays without duplication",
  "rolls back cancellation, hold release, domain event and API receipt when mandatory evidence fails",
  "injected_cancel_evidence_rejection",
  "status: \"NEW\"",
  "releases: \"0\"",
  "events: \"0\"",
  "receipts: \"0\"",
  "residual: \"10.01\"",
]) {
  requireText(
    cancelPostgresTest,
    evidenceText,
    `missing PostgreSQL Exchange cancellation evidence proof: ${evidenceText}`,
  );
}
for (const evidenceText of [
  "blocks a forged final command and commits one accepted finalization event",
  "commits rejected terminal evidence only after exact hold closure",
  "rolls back terminal order state and hold release when rejected evidence fails, then recovers",
  "injected_final_evidence_rejection",
  "exchange.order.finalize",
  "exchange.order.reject",
  "state, \"retryable\"",
  "residual, \"10.01\"",
  "holdClosed, true",
]) {
  requireText(
    finalPostgresTest,
    evidenceText,
    `missing PostgreSQL Exchange final outcome proof: ${evidenceText}`,
  );
}
for (const evidenceText of [
  "without raw order identity",
  "order-independent trade fingerprint",
  "committed terminal rejection",
  "scientific notation, negative release and unbounded reason values",
]) {
  requireText(
    unitTest,
    evidenceText,
    `missing bounded Exchange evidence unit proof: ${evidenceText}`,
  );
}

for (const contract of [
  "Production mutation-path inventory",
  "Current evidence systems and their roles",
  "Mandatory typed evidence design",
  "Required adversarial evidence",
  "NO-GO for #186 completion",
]) {
  requireText(inventory, contract, `Exchange evidence inventory contract is missing: ${contract}`);
}

if (failures.length > 0) {
  console.error("Exchange order evidence authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Exchange order evidence authority check passed: typed bounded admission/final/reject/cancel evidence, deferred financial finalization, exact command gate, route-side audit removal, canonical migration ordering and rollback/replay/recovery proofs are permanent.",
);
