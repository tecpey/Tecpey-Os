import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const route = read("src/app/api/orders/route.ts");
const cancelRoute = read("src/app/api/orders/[id]/route.ts");
const validation = read("src/lib/trading/validation.ts");
const financials = read("src/lib/trading/order-financials.ts");
const wallet = read("src/lib/trading/wallet-service.ts");
const command = read("src/lib/trading/order-command-service.ts");
const engine = read("src/lib/trading/engine.ts");
const marketLock = read("src/lib/trading/market-execution-lock.ts");
const migration = read("src/lib/db-migrate-exchange-order-admission.ts");
const migrationPlan = read("src/lib/db-migration-plan.ts");
const worker = read("scripts/run-exchange-order-worker.ts");
const pkg = read("package.json");
const workflow = read(".github/workflows/ci.yml");
const pureTest = read("src/tests/trading/order-admission.test.ts");
const commandTest = read("src/tests/security/exchange-order-command.test.ts");
const postgresTest = read("src/tests/trading/order-admission-postgres.test.ts");
const migrationTest = read("src/tests/database/migration-integration.test.ts");

const failures = [];
const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const rejectText = (source, text, message) => {
  if (source.includes(text)) failures.push(message);
};

for (const [text, message] of [
  ["getCanonicalSession(req, { strictRevocation: true })", "order placement must require strict revocation authority"],
  ["admitExchangeOrderCommand", "route must delegate financial admission to the durable command authority"],
  ["processExchangeOrderCommand", "route must process only through the recoverable command boundary"],
  ["idempotency_key_required", "route must require a stable idempotency identity"],
  ["getActiveMarketStrict", "route must fail closed when authoritative market state is unavailable"],
  ["calculateOrderHold", "order route must use exact hold calculation"],
  ["getAvailableBalanceAmount", "order route must read exact balance strings"],
  ["D(available).lt(hold.amount)", "order preflight must compare Decimal values"],
  ["holdAmount: hold.amount", "audit evidence must retain the exact hold string"],
  ['typeof body.quantity !== "string"', "quantity must be supplied as an exact JSON string"],
  ['body.price !== undefined && typeof body.price !== "string"', "price must be supplied as an exact JSON string"],
  ['body.stopPrice !== undefined && typeof body.stopPrice !== "string"', "stopPrice must be supplied as an exact JSON string"],
]) requireText(route, text, message);

requireText(cancelRoute, "getCanonicalSession(req, { strictRevocation: true })", "order cancellation must require strict revocation authority");
requireText(cancelRoute, "getMatchingEngine().cancelOrder", "cancellation must enter the matching ownership boundary");
requireText(cancelRoute, "retryable: true", "ambiguous cancellation failures must be explicitly retryable");

for (const forbidden of [
  "parseFloat(",
  "holdAmount: number",
  "holdAmount.toFixed",
  "available < holdAmount",
  "String(body.quantity",
  "String(body.price",
  "String(body.stopPrice",
  "createOrderTx(",
  "holdOrderFundsTx(",
  "getMatchingEngine().placeOrder",
]) rejectText(route, forbidden, `order route bypasses durable admission or contains unsafe financial authority: ${forbidden}`);

for (const forbidden of ["parseFloat(", "Math.round(", "1e-10", "Number.isFinite("]) {
  rejectText(validation, forbidden, `order validation contains forbidden floating-point logic: ${forbidden}`);
}
requireText(validation, "isExactIncrement", "validation must enforce exact tick and step increments");
requireText(validation, "parsePositiveOrderDecimal", "validation must reject non-canonical decimal input");
requireText(validation, "multiplyOrderDecimals", "order-value bounds must use full-precision multiplication");
requireText(validation, "parseOrderDecimal(market.maxOrderValue)", "zero-formatted maxOrderValue must parse before unlimited comparison");

requireText(financials, "Decimal.clone", "hold multiplication must use isolated sufficient precision");
requireText(financials, "order_hold_scale_exceeded", "holds requiring database rounding must fail closed");
requireText(financials, "DATABASE_AMOUNT_SCALE = 10", "hold calculation must bind database scale");
requireText(financials, "marketBuyMaxQuoteAmount", "market buys must be bounded by a server-validated maximum quote amount");
rejectText(financials, "Decimal.ROUND_UP", "admission must not create holds downstream release cannot reproduce");

for (const text of [
  "getAvailableBalanceAmount",
  "holdOrderFundsTx",
  "releaseOrderHoldResidualTx",
  "assertOrderHoldClosedTx",
  "exchange-order-hold:",
  "order_hold_ledger_mismatch",
  "order_hold_over_released",
  "order_terminal_hold_not_closed",
]) requireText(wallet, text, `wallet authority is missing invariant: ${text}`);

for (const [text, message] of [
  ["hashExchangeOrderCommand", "command identity must be canonical and immutable"],
  ["pg_advisory_xact_lock", "duplicate admissions must serialize in PostgreSQL"],
  ["exchange_order_commands", "command ledger must be durable"],
  ["holdOrderFundsTx", "order creation, hold and command evidence must share one transaction"],
  ["recoverExpiredCommandLease", "expired processing ownership must recover"],
  ["attempt_count = attempt_count + 1", "processing attempts must be durable"],
  ["lease_expires_at", "processing ownership must expire"],
  ["reconstructCommittedOutcome", "crash recovery must reconstruct committed execution"],
  ["assertOrderHoldClosedTx", "terminal command finalization must prove no residual hold"],
  ["listRecoverableExchangeOrderCommands", "worker must scan admitted/retryable/expired commands"],
  ["state = 'final'", "command response must be backed by committed final state"],
]) requireText(command, text, message);
rejectText(command, "void with", "financial evidence must never be fire-and-forget");

requireText(engine, "withExchangeMarketExecutionLock", "matching and cancellation require distributed market ownership");
requireText(engine, "rebuildMarketBookFromAuthority", "matching must rebuild from PostgreSQL authority before execution");
requireText(engine, "commitTerminalOrder", "rejection and expiry must commit terminal state plus hold closure atomically");
requireText(engine, "assertOrderHoldClosedTx", "engine terminal paths must verify hold closure");
requireText(marketLock, "pg_try_advisory_lock", "market ownership must be shared across processes");
requireText(marketLock, "pg_advisory_unlock", "market ownership must always be released");

for (const text of [
  "CREATE TABLE IF NOT EXISTS exchange_order_commands",
  "UNIQUE (tenant_id, user_id, idempotency_key)",
  "order_id UUID NOT NULL UNIQUE",
  "exchange_order_commands_identity_no_update",
  "exchange_order_commands_no_delete",
  "exchange_order_command_attempts_no_update",
  "exchange_order_command_attempts_no_delete",
  "exchange_order_commands_claim_idx",
  "exchange_order_commands_lease_idx",
]) requireText(migration, text, `migration is missing durable command invariant: ${text}`);
requireText(migrationPlan, "runExchangeOrderAdmissionMigrations", "canonical migration plan must install order command authority");
requireText(worker, "listRecoverableExchangeOrderCommands", "worker must discover recoverable commands");
requireText(worker, "processExchangeOrderCommand", "worker must use the canonical processor");
requireText(worker, "EXCHANGE_ORDER_WORKER_CONCURRENCY", "worker concurrency must be bounded");

requireText(pkg, '"exchange:check"', "package must expose exchange authority guard");
requireText(pkg, '"test:exchange-order-authority"', "package must expose focused exchange tests");
requireText(pkg, '"exchange:worker"', "package must expose recovery worker");
requireText(pkg, "npm run exchange:check", "release gate must execute exchange guard");
requireText(pkg, "npm run test:exchange-order-authority", "release gate must execute focused exchange tests");
requireText(workflow, "Exchange order admission authority guard", "CI must execute exchange guard");
requireText(workflow, "Exchange order authority tests", "CI must execute focused exchange tests");

requireText(pureTest, "binary-unsafe decimal boundaries", "precision regression test is required");
requireText(pureTest, "large exact product beyond the legacy global precision", "large-product regression evidence is required");
requireText(pureTest, "fails closed when a hold would require scale rounding", "scale-rejection evidence is required");
requireText(commandTest, "stable canonical hash", "exact retry identity evidence is required");
requireText(commandTest, "financial or principal fact changes", "changed command identity evidence is required");
requireText(postgresTest, "Promise.all", "concurrent PostgreSQL hold evidence is required");
requireText(postgresTest, '"0.0500000000"', "exact available balance assertion is required");
requireText(postgresTest, '"0.1000000001"', "exact held and ledger amount assertion is required");
requireText(migrationTest, "0027_exchange_order_admission_authority.sql", "migration integration must verify exchange command migration");
requireText(migrationTest, "exchange_order_commands_identity_no_update", "migration integration must verify immutable command evidence");
requireText(migrationTest, "exchange_order_command_attempts_no_update", "migration integration must verify immutable attempt evidence");

if (failures.length) {
  console.error("Exchange order admission authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Exchange order admission authority check passed: strict sessions, exact financial admission, immutable idempotency, recoverable leased processing, distributed market ownership, authoritative book rebuild and terminal hold closure are enforced.");
