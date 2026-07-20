import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const audit = read("src/lib/security/sensitive-mutation-audit.ts");
const evidence = read("src/lib/trading/exchange-order-evidence.ts");
const migration = read("src/lib/db-migrate-exchange-order-evidence.ts");
const migrationPlan = read("src/lib/db-migration-plan.ts");
const cancelAuthority = read("src/lib/trading/order-cancel-authority.ts");
const cancelRoute = read("src/app/api/orders/[id]/route.ts");
const postgresTest = read("src/tests/security/exchange-order-evidence-postgres.test.ts");
const cancelPostgresTest = read("src/tests/security/exchange-order-cancel-evidence-postgres.test.ts");
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
  "tecpey_append_exchange_order_admission_evidence",
  "AFTER INSERT ON exchange_order_commands",
  "INSERT INTO sensitive_mutation_audit_events",
  "'exchange.order.admit'",
  "'exchange_order'",
  "evidence.actor_id = command.user_id",
  "evidence.resource_id = 'exchange-order-'",
  "evidence.correlation_id = 'exchange-order-admit-'",
  "NEW.request_hash",
  "NEW.hold_amount::text",
  "holdRepresentation",
  "wallet_ledger",
  "chr(31)",
  "sha256(",
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
rejectText(
  migration,
  "chr(0)",
  "PostgreSQL text evidence hashing cannot use a NUL separator",
);
if (/\bdigest\(\s*convert_to\(/m.test(migration)) {
  failures.push(
    "Exchange evidence SQL must not depend on the pgcrypto digest(convert_to(...)) function",
  );
}

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
const cancelReceiptIndex = cancelAuthority.indexOf("await completeApiCommandTx(client, scope", cancelAuditIndex);
if (cancelAuditIndex < 0 || cancelReceiptIndex < 0 || cancelReceiptIndex <= cancelAuditIndex) {
  failures.push(
    "mandatory cancellation evidence must commit before the successful API command receipt",
  );
}
for (const forbidden of [
  "writeAudit(",
  "order_cancelled",
  'from "@/lib/security/audit-log"',
]) {
  rejectText(
    cancelRoute,
    forbidden,
    `order cancellation route cannot retain best-effort audit authority: ${forbidden}`,
  );
}
requireText(
  cancelRoute,
  "cancelOrderIdempotently",
  "order cancellation route must delegate to the canonical transactional authority",
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
  "residual: \"10.0100000000\"",
]) {
  requireText(
    cancelPostgresTest,
    evidenceText,
    `missing PostgreSQL Exchange cancellation evidence proof: ${evidenceText}`,
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
  "Exchange order evidence authority check passed: typed bounded events, extension-free admission trigger, transactional cancellation evidence, route-side audit removal, canonical migration ordering and rollback/replay evidence are permanent.",
);
