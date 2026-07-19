import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const engine = read("src/lib/trading/engine.ts");
const math = read("src/lib/trading/matching-financials.ts");
const exactBook = read("src/lib/trading/exact-order-book-store.ts");
const orderPersistence = read("src/lib/trading/matching-order-service.ts");
const wallet = read("src/lib/trading/wallet-balance-service.ts");
const trade = read("src/lib/trading/trade-service.ts");
const cancelRoute = read("src/app/api/orders/[id]/route.ts");
const pureTest = read("src/tests/trading/matching-financials.test.ts");
const postgresTest = read("src/tests/trading/matching-settlement-postgres.test.ts");

const failures = [];
const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const rejectText = (source, text, message) => {
  if (source.includes(text)) failures.push(message);
};

for (const forbidden of [
  "PersistentOrderBookStore",
  "orderToEngineOrder",
  "parseFloat(",
  "1e-10",
  "updateOrderFillTx",
  "setOrderStatus(",
  "releaseFunds(",
  "creditFunds(",
  "debitFunds(",
  "chargeFee(",
]) rejectText(engine, forbidden, `matching engine contains legacy authority: ${forbidden}`);

for (const required of [
  "ExactOrderBookStore",
  "withTx",
  "lockOrdersForMatchTx",
  "applyExactOrderFillTx",
  "calculateExactTradeAmounts",
  "releaseOutstandingOrderHoldTx",
  "PLATFORM_FEE_WALLET_ID",
  "market_buy_depth_reservation_required",
  "fok_atomicity_failed",
]) requireText(engine, required, `matching engine contract missing: ${required}`);

requireText(math, "Decimal.ROUND_DOWN", "settlement must truncate at database scale");
requireText(math, "buyerQuoteDebit", "buyer gross plus fee must be exact");
requireText(math, "platformFeeCredit", "both fees must be conserved to the platform wallet");
rejectText(math, "parseFloat(", "matching financials must not parse floats");
rejectText(math, "Number(", "matching financials must not convert to number");

requireText(exactBook, "remainingQuantity: string", "matching book quantities must remain strings");
requireText(exactBook, "D(level.price)", "matching book price sorting must use Decimal");
rejectText(exactBook, "number;", "exact matching book must not store financial numbers");

requireText(orderPersistence, "FOR UPDATE", "matching orders must be row-locked");
requireText(orderPersistence, "$2::numeric", "fill updates must bind exact PostgreSQL numeric values");
requireText(orderPersistence, "avg_fill_price = CASE", "VWAP must be calculated by PostgreSQL NUMERIC arithmetic");
rejectText(orderPersistence, "number", "matching order persistence must not accept financial numbers");

for (const forbidden of [
  "held_balance = GREATEST",
  "LEAST(available_balance",
  "Math.max(",
  "parseFloat(",
]) rejectText(wallet, forbidden, `wallet settlement silently clamps or floats: ${forbidden}`);
for (const required of [
  "held_balance >= $3::numeric",
  "available_balance >= $3::numeric",
  "releaseOutstandingOrderHoldTx",
  "fee_ledger_write_failed",
]) requireText(wallet, required, `wallet settlement contract missing: ${required}`);

requireText(trade, "price: string", "trade persistence price must be a string");
requireText(trade, "quantity: string", "trade persistence quantity must be a string");
rejectText(trade, "price: number", "trade persistence must not accept numeric price");
rejectText(trade, "quantity: number", "trade persistence must not accept numeric quantity");

requireText(cancelRoute, "getMatchingEngine().cancelOrder", "cancel route must use the atomic engine boundary");
rejectText(cancelRoute, "cancelOrder(id, userId)", "cancel route must not commit status before engine settlement");
rejectText(cancelRoute, "postRelease", "cancel route must not release funds separately");

requireText(pureTest, "platform conservation exactly", "exact fee-conservation test is required");
requireText(postgresTest, "conserves base, quote and both fees", "PostgreSQL end-to-end conservation test is required");
requireText(postgresTest, '"0.0000600000"', "platform fee conservation assertion is required");
requireText(postgresTest, 'held: "0.0000000000"', "terminal zero-held assertions are required");

if (failures.length) {
  console.error("Exchange matching/settlement authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Exchange matching/settlement authority check passed.");
