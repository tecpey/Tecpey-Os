import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const audit = read("src/lib/security/sensitive-mutation-audit.ts");
const evidence = read("src/lib/trading/exchange-order-evidence.ts");
const migration = read("src/lib/db-migrate-exchange-order-evidence.ts");
const migrationPlan = read("src/lib/db-migration-plan.ts");
const postgresTest = read("src/tests/security/exchange-order-evidence-postgres.test.ts");
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
]) {
  requireText(evidence, invariant, `bounded Exchange evidence invariant is missing: ${invariant}`);
}
for (const forbidden of [
  "metadata: { orderId",
  "metadata: { userId",
  "tradeIds: tradeIds",
  "correlationSeed:",
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
  "tecpey_append_exchange_order_admission_evidence",
  "AFTER INSERT ON exchange_order_commands",
  "INSERT INTO sensitive_mutation_audit_events",
  "'exchange.order.admit'",
  "'exchange_order'",
  "NEW.request_hash",
  "NEW.hold_amount::text",
  "holdRepresentation",
  "wallet_ledger",
]) {
  requireText(
    migration,
    invariant,
    `transactional Exchange admission evidence migration is missing: ${invariant}`,
  );
}
rejectText(
  migration,
  "ON CONFLICT DO NOTHING",
  "mandatory Exchange admission evidence must not silently suppress conflicts",
);

requireText(
  migrationPlan,
  'import { runExchangeOrderEvidenceMigrations } from "./db-migrate-exchange-order-evidence"',
  "canonical migration plan must import Exchange evidence migration",
);
const sensitiveIndex = migrationPlan.indexOf("await runSensitiveMutationAuditMigrations(client)");
const exchangeIndex = migrationPlan.indexOf("await runExchangeOrderEvidenceMigrations(client)");
if (sensitiveIndex < 0 || exchangeIndex < 0 || exchangeIndex <= sensitiveIndex) {
  failures.push(
    "Exchange evidence migration must execute after sensitive mutation audit authority",
  );
}

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
    `missing PostgreSQL Exchange evidence proof: ${evidenceText}`,
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
  "Exchange order evidence authority check passed: typed bounded events, fail-closed transactional admission trigger, canonical migration ordering, legacy cutover guard and rollback/replay evidence are permanent.",
);
