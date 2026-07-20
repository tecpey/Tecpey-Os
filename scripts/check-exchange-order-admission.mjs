import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const route = read("src/app/api/orders/route.ts");
const cancelRoute = read("src/app/api/orders/[id]/route.ts");
const cancelAuthority = read("src/lib/trading/order-cancel-authority.ts");
const validation = read("src/lib/trading/validation.ts");
const financials = read("src/lib/trading/order-financials.ts");
const wallet = read("src/lib/trading/wallet-service.ts");
const command = read("src/lib/trading/order-command-service.ts");
const engine = read("src/lib/trading/engine.ts");
const marketLock = read("src/lib/trading/market-execution-lock.ts");
const recovery = read("src/lib/trading/order-book-recovery.ts");
const market = read("src/lib/trading/market-service.ts");
const migration = read("src/lib/db-migrate-exchange-order-admission.ts");
const migrationPlan = read("src/lib/db-migration-plan.ts");
const worker = read("scripts/run-exchange-order-worker.ts");
const pkg = read("package.json");
const workflow = `${read(".github/workflows/ci.yml")}\n${read(".github/workflows/exchange-authority.yml")}`;
const pureTest = read("src/tests/trading/order-admission.test.ts");
const commandTest = read("src/tests/security/exchange-order-command.test.ts");
const postgresHoldTest = read("src/tests/trading/order-admission-postgres.test.ts");
const postgresAuthorityTest = read("src/tests/security/exchange-order-authority-postgres.test.ts");
const cancelIdempotencyTest = read("src/tests/security/exchange-order-cancel-idempotency-postgres.test.ts");
const orderBookAuthorityTest = read("src/tests/security/exchange-order-book-authority.test.ts");
const feeSettlementTest = read("src/tests/security/exchange-order-fee-settlement.test.ts");
const marketProtectionTest = read("src/tests/security/exchange-order-market-protection.test.ts");
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
  ["maxQuoteAmount", "market buys must declare an exact maximum quote amount"],
  ["calculateOrderHold", "order route must use exact hold calculation"],
  ["getAvailableBalanceAmount", "order route must read exact balance strings"],
  ["D(available).lt(hold.amount)", "order preflight must compare Decimal values"],
  ["hold: { asset: hold.asset, amount: hold.amount }", "route must pass the exact hold string into the transactional command authority"],
  ["order_reconciliation_required", "terminal command failure must be surfaced as a release blocker"],
  ['state: processing.status', "non-final execution must return explicit processing state"],
  ['typeof body.quantity !== "string"', "quantity must be supplied as an exact JSON string"],
  ['body.price !== undefined && typeof body.price !== "string"', "price must be supplied as an exact JSON string"],
  ['body.stopPrice !== undefined && typeof body.stopPrice !== "string"', "stopPrice must be supplied as an exact JSON string"],
]) requireText(route, text, message);

for (const [text, message] of [
  ["getCanonicalSession(req, { strictRevocation: true })", "order cancellation must require strict revocation authority"],
  ["cancelOrderIdempotently", "cancellation must delegate to the durable idempotent authority"],
  ["parseApiIdempotencyKey", "cancellation must require a validated Idempotency-Key"],
  ["hashApiCommand", "cancellation must bind an immutable canonical request hash"],
  ["retryable: true", "ambiguous cancellation failures must be explicitly retryable"],
  ["order_processing", "cancellation must not race a non-final admission command"],
  ["Idempotency-Replayed", "cancellation responses must expose exact replay state"],
]) requireText(cancelRoute, text, message);
rejectText(cancelRoute, "getMatchingEngine().cancelOrder", "route cancellation may not bypass the durable PostgreSQL authority");

for (const [text, message] of [
  ["withExchangeMarketExecutionLock", "cancellation must enter the distributed market ownership boundary"],
  ["claimApiCommandTx", "cancellation must claim a durable tenant/principal-scoped receipt"],
  ["completeApiCommandTx", "terminal cancellation results must be replayable"],
  ["releaseOrderHoldResidualTx", "cancellation must release the exact residual hold"],
  ["assertOrderHoldClosedTx", "cancellation must prove the order hold is closed"],
  ["persistMissingOrderResult", "terminal order_not_found results must be persisted"],
  ["idempotency_conflict", "changed-payload key reuse must fail closed"],
  ["PLATFORM.DEFAULT_TENANT_ID", "cancellation receipts must be tenant scoped"],
]) requireText(cancelAuthority, text, message);

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
requireText(financials, "market_buy_max_quote_required", "market buys must be bounded by an explicit quote maximum");
requireText(financials, "market_buy_max_quote_below_best_ask", "known best ask may not exceed the declared quote authority");
requireText(financials, "maximumBuyFeeRate", "limit-buy holds must reserve the greater possible maker/taker fee");
requireText(financials, "buyReserve", "buy holds must bind notional and fee reserve atomically");
rejectText(financials, "Decimal.ROUND_UP", "admission must not create asymmetric hold rounding");

requireText(market, "getActiveMarketStrict", "strict active-market authority is required");
requireText(market, "market_storage_unavailable", "strict market reads must fail closed on storage outage");

for (const text of [
  "getAvailableBalanceAmount",
  "holdOrderFundsTx",
  "releaseOrderHoldResidualTx",
  "assertOrderHoldClosedTx",
  "releaseMatchedOrderFundsTx",
  "matchedReleaseAmountTx",
  "debitTradeFundsTx",
  "creditTradeFundsTx",
  "chargeTradeFeeTx",
  "exchange-order-hold:",
  "order_hold_ledger_mismatch",
  "order_hold_over_released",
  "order_terminal_hold_not_closed",
  "wallet_storage_unavailable",
]) requireText(wallet, text, `wallet authority is missing invariant: ${text}`);
requireText(wallet, "Decimal.ROUND_UP", "per-fill buy release must make the fee reserve spendable before fee debit");
requireText(wallet, "maker_fee", "matched limit-buy release must cover the maximum reserved fee rate");
rejectText(wallet, "GREATEST(0, held_balance", "order release may not conceal held-balance skew");

for (const [text, message] of [
  ["hashExchangeOrderCommand", "command identity must be canonical and immutable"],
  ["pg_advisory_xact_lock", "duplicate admissions must serialize in PostgreSQL"],
  ["exchange_order_commands", "command ledger must be durable"],
  ['if (!held) throw new Error("insufficient_balance")', "insufficient hold must roll back the inserted order"],
  ["recoverExpiredCommandLease", "expired processing ownership must recover"],
  ["attempt_count = attempt_count + 1", "processing attempts must be durable"],
  ["lease_expires_at", "processing ownership must expire"],
  ["reconstructCommittedOutcome", "crash recovery must reconstruct committed execution"],
  ["assertOrderHoldClosedTx", "terminal command finalization must prove no residual hold"],
  ["listRecoverableExchangeOrderCommands", "worker must scan admitted/retryable/expired commands"],
  ["exchange_order_storage_unavailable", "worker discovery must fail closed on storage outage"],
  ["state = 'final'", "command response must be backed by committed final state"],
]) requireText(command, text, message);
rejectText(command, "void with", "financial evidence must never be fire-and-forget");

requireText(engine, "withExchangeMarketExecutionLock", "matching and cancellation require distributed market ownership");
requireText(engine, "rebuildMarketBookFromAuthority", "matching must rebuild from PostgreSQL authority before execution");
requireText(engine, "validateLockedOrdersTx", "maker and taker rows must be locked and revalidated");
requireText(engine, "current.market !== order.market", "incoming order market identity must be revalidated under lock");
requireText(engine, "maker.market !== order.market", "maker market identity must be revalidated under lock");
requireText(engine, "!D(maker.price).eq(fill.maker.pricePerUnit)", "maker price must match the authoritative locked row");
requireText(engine, "!D(maker.remaining_quantity).eq(fill.maker.remaining)", "maker remaining quantity must match the rebuilt authority snapshot");
requireText(engine, "commitTerminalOrder", "rejection and expiry must commit terminal state plus hold closure atomically");
requireText(engine, "assertOrderHoldClosedTx", "engine terminal paths must verify hold closure");
requireText(engine, "plannedBuyerFee", "market-buy protection must include buyer fees");
requireText(engine, "plannedSpend", "market-buy quote cap must compare total spend, not only notional");
requireText(engine, "market_price_protection", "market buys must not spend beyond the committed hold authority");
for (const forbidden of [
  "releaseFundsTx(",
  "debitFundsTx(",
  "creditFundsTx(",
  "chargeFeeTx(",
  "catch { /* best-effort */ }",
]) rejectText(engine, forbidden, `engine contains fail-open financial behavior: ${forbidden}`);
requireText(marketLock, "pg_try_advisory_lock", "market ownership must be shared across processes");
requireText(marketLock, "pg_advisory_unlock", "market ownership must always be released");
requireText(recovery, "tecpeyEngineBooks?.delete", "local matching cache must be cleared before rebuild");
requireText(recovery, "JOIN exchange_order_commands", "maker liquidity must be joined to durable command authority");
requireText(recovery, "command.state = 'final'", "non-final admitted commands must be excluded from maker liquidity");
requireText(recovery, "command.result->>'accepted'", "only accepted final commands may become maker liquidity");
rejectText(recovery, '.keys("tecpey:order:*"', "book recovery may not scan the Redis keyspace");

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
  "legacy open orders must be reconciled",
]) requireText(migration, text, `migration is missing durable command invariant: ${text}`);
requireText(migrationPlan, "runExchangeOrderAdmissionMigrations", "canonical migration plan must install order command authority");
requireText(worker, "listRecoverableExchangeOrderCommands", "worker must discover recoverable commands");
requireText(worker, "processExchangeOrderCommand", "worker must use the canonical processor");
requireText(worker, "EXCHANGE_ORDER_WORKER_CONCURRENCY", "worker concurrency must be bounded");
requireText(worker, "failedTerminal", "worker must fail health on terminal reconciliation debt");

requireText(pkg, '"exchange:check"', "package must expose exchange authority guard");
requireText(pkg, '"test:exchange-order-authority"', "package must expose focused exchange tests");
requireText(pkg, '"exchange:worker"', "package must expose recovery worker");
requireText(pkg, "npm run exchange:check", "release gate must execute exchange guard");
requireText(pkg, "npm run test:exchange-order-authority", "release gate must execute focused exchange tests");
requireText(workflow, "Exchange order admission authority guard", "CI must execute exchange guard");
requireText(workflow, "Exchange order authority tests", "CI must execute focused exchange tests");
requireText(workflow, "Upload Exchange authority diagnostics", "focused CI must preserve failure diagnostics");

for (const evidence of [
  "binary-unsafe decimal boundaries",
  "large exact product beyond the legacy global precision",
  "fails closed when a hold would require scale rounding",
  "zero maxOrderValue as unlimited",
  "requires explicit market-buy maximum quote authority",
  "reserves the greater maker or taker fee",
]) requireText(pureTest, evidence, `missing decimal regression evidence: ${evidence}`);
requireText(commandTest, "stable canonical hash", "exact retry identity evidence is required");
requireText(commandTest, "financial or principal fact changes", "changed command identity evidence is required");
requireText(postgresHoldTest, "Promise.all", "concurrent PostgreSQL hold evidence is required");
requireText(postgresHoldTest, '"0.0500000000"', "exact available balance assertion is required");
requireText(postgresHoldTest, '"0.1000000001"', "exact held and ledger amount assertion is required");
for (const evidence of [
  "rolls back the order and command when the committed hold loses the balance race",
  "serializes concurrent duplicate admission",
  "admitted-but-unprocessed command exactly once",
  "does not report terminal rejection when hold release fails",
  "one cross-instance owner for a market critical section",
  "serializes cancellation and closes the remaining hold exactly once",
]) requireText(postgresAuthorityTest, evidence, `missing adversarial PostgreSQL evidence: ${evidence}`);
for (const evidence of [
  "persists and replays order_not_found",
  "idempotency_conflict",
  "api_command_receipts",
]) requireText(cancelIdempotencyTest, evidence, `missing durable cancellation idempotency evidence: ${evidence}`);
requireText(orderBookAuthorityTest, "excludes admitted or processing commands", "non-final maker exclusion evidence is required");
requireText(orderBookAuthorityTest, "getLevels(market, \"buy\").length, 0", "pre-final order-book exclusion assertion is required");
requireText(feeSettlementTest, "exactly the committed notional plus fee reserve", "real crossing settlement must prove fee-covered admission");
requireText(feeSettlementTest, "buyerFilled.outcome.tradeIds.length, 1", "fee-covered settlement must prove a real trade");
requireText(feeSettlementTest, "D(row.residual).isZero()", "fee-covered settlement must prove zero order-hold residuals");
requireText(marketProtectionTest, "quote cap covers notional but not fee", "negative market-buy total-spend evidence is required");
requireText(marketProtectionTest, 'rejected.outcome.reason, "market_price_protection"', "insufficient total quote authority must be a committed rejection");
requireText(marketProtectionTest, "D(evidence.value.residual).isZero()", "market-price rejection must prove hold closure");
requireText(migrationTest, "0027_exchange_order_admission_authority.sql", "migration integration must verify exchange command migration");
requireText(migrationTest, "exchange_order_commands_identity_no_update", "migration integration must verify immutable command evidence");
requireText(migrationTest, "exchange_order_command_attempts_no_update", "migration integration must verify immutable attempt evidence");

if (failures.length) {
  console.error("Exchange order admission authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Exchange order admission authority check passed: strict sessions, exact fee-covered financial admission, immutable placement and cancellation idempotency, crash recovery, distributed market ownership, locked maker revalidation, final-command maker liquidity and terminal hold closure are enforced.");
