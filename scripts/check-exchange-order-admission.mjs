import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const route = read("src/app/api/orders/route.ts");
const validation = read("src/lib/trading/validation.ts");
const financials = read("src/lib/trading/order-financials.ts");
const wallet = read("src/lib/trading/wallet-service.ts");
const pureTest = read("src/tests/trading/order-admission.test.ts");
const postgresTest = read("src/tests/trading/order-admission-postgres.test.ts");

const failures = [];
const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const rejectText = (source, text, message) => {
  if (source.includes(text)) failures.push(message);
};

for (const [text, message] of [
  ["calculateOrderHold", "order route must use exact hold calculation"],
  ["getAvailableBalanceAmount", "order route must read exact balance strings"],
  ["holdOrderFundsTx", "order route must use the exact atomic hold boundary"],
  ["D(available).lt(hold.amount)", "order preflight must compare Decimal values"],
  ["holdAmount: hold.amount", "audit evidence must retain the exact hold string"],
  ['typeof body.quantity !== "string"', "quantity must be supplied as an exact JSON string"],
  ['body.price !== undefined && typeof body.price !== "string"', "price must be supplied as an exact JSON string"],
  ['body.stopPrice !== undefined && typeof body.stopPrice !== "string"', "stopPrice must be supplied as an exact JSON string"],
  ['market_buy_depth_reservation_required', "market buys must fail closed until depth reservation exists"],
]) requireText(route, text, message);

for (const forbidden of [
  "parseFloat(",
  "holdAmount: number",
  "1e-10",
  "holdAmount.toFixed",
  "available < holdAmount",
  "String(body.quantity",
  "String(body.price",
  "String(body.stopPrice",
  "bestAskPrice",
]) rejectText(route, forbidden, `order route contains forbidden floating-point/coercion authority: ${forbidden}`);

for (const forbidden of ["parseFloat(", "Math.round(", "1e-10", "Number.isFinite("]) {
  rejectText(validation, forbidden, `order validation contains forbidden floating-point logic: ${forbidden}`);
}
requireText(validation, "isExactIncrement", "validation must enforce exact tick and step increments");
requireText(validation, "parsePositiveOrderDecimal", "validation must reject non-canonical decimal input");
requireText(validation, "multiplyOrderDecimals", "order-value bounds must use full-precision multiplication");
requireText(validation, "parseOrderDecimal(market.maxOrderValue)", "zero-formatted maxOrderValue must parse before unlimited comparison");

requireText(financials, "Decimal.clone", "hold multiplication must use isolated sufficient precision");
requireText(financials, "toReserveAmount", "limit-buy hold must reserve at database scale");
requireText(financials, "Decimal.ROUND_UP", "reservation must never underfund a permitted limit fill");
requireText(financials, "maximumFeeRate", "buy holds must reserve the maximum configured fee rate");
requireText(financials, "market_buy_depth_reservation_required", "financial hold helper must reject market buys");
requireText(financials, "DATABASE_AMOUNT_SCALE = 10", "hold calculation must bind the database amount scale");
requireText(financials, "DATABASE_AMOUNT_INTEGER_DIGITS = 20", "hold calculation must bind the database integer range");
requireText(financials, "PLAIN_DECIMAL", "financial input must use a plain-decimal grammar");

requireText(wallet, "getAvailableBalanceAmount", "wallet service must expose an exact balance string");
requireText(wallet, "holdOrderFundsTx", "wallet service must expose an exact order hold transaction");
requireText(wallet, "order_hold_ledger_mismatch", "order hold must fail closed when ledger evidence diverges");
requireText(wallet, "D(ledgerAmount).eq(canonical)", "order hold ledger evidence must match exactly");
rejectText(wallet, "as unknown as number", "exact holds must not use a compile-time number cast");

requireText(pureTest, "binary-unsafe decimal boundaries", "precision regression test is required");
requireText(pureTest, "large exact product and its fee reserve", "large-product fee-reserve evidence is required");
requireText(pureTest, "rounds reservation upward", "reservation rounding evidence is required");
requireText(pureTest, "zero maxOrderValue as unlimited", "unlimited-cap regression evidence is required");
requireText(pureTest, "market buys until depth reservation", "market-buy fail-closed evidence is required");
requireText(postgresTest, "Promise.all", "concurrent PostgreSQL hold evidence is required");
requireText(postgresTest, '"0.0500000000"', "exact available balance assertion is required");
requireText(postgresTest, '"0.1000000001"', "exact held and ledger amount assertion is required");

if (failures.length) {
  console.error("Exchange order admission authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Exchange order admission authority check passed.");
