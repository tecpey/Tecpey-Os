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
]) requireText(route, text, message);

for (const forbidden of [
  "parseFloat(",
  "holdAmount: number",
  "1e-10",
  "holdAmount.toFixed",
  "available < holdAmount",
]) rejectText(route, forbidden, `order route contains forbidden floating-point authority: ${forbidden}`);

for (const forbidden of ["parseFloat(", "Math.round(", "1e-10", "Number.isFinite("]) {
  rejectText(validation, forbidden, `order validation contains forbidden floating-point logic: ${forbidden}`);
}
requireText(validation, "isExactIncrement", "validation must enforce exact tick and step increments");
requireText(validation, "parsePositiveOrderDecimal", "validation must reject non-canonical decimal input");
requireText(validation, "multiplyOrderDecimals", "order-value bounds must use full-precision multiplication");
requireText(
  validation,
  "parseOrderDecimal(market.maxOrderValue)",
  "zero-formatted maxOrderValue must parse before unlimited comparison",
);

requireText(financials, "Decimal.clone", "hold multiplication must use isolated sufficient precision");
requireText(financials, "order_hold_scale_exceeded", "holds requiring database rounding must fail closed");
requireText(financials, "DATABASE_AMOUNT_SCALE = 10", "hold calculation must bind the database amount scale");
requireText(financials, "DATABASE_AMOUNT_INTEGER_DIGITS = 20", "hold calculation must bind the database integer range");
requireText(financials, "PLAIN_DECIMAL", "financial input must use a plain-decimal grammar");
rejectText(financials, "Decimal.ROUND_UP", "admission must not create holds that downstream release cannot reproduce yet");

requireText(wallet, "getAvailableBalanceAmount", "wallet service must expose an exact balance string");
requireText(wallet, "holdOrderFundsTx", "wallet service must expose an exact order hold transaction");
requireText(wallet, "order_hold_ledger_mismatch", "order hold must fail closed when ledger evidence diverges");
requireText(wallet, "D(ledgerAmount).eq(canonical)", "order hold ledger evidence must match exactly");

requireText(pureTest, "binary-unsafe decimal boundaries", "precision regression test is required");
requireText(pureTest, "large exact product beyond the legacy global precision", "large-product regression evidence is required");
requireText(pureTest, "fails closed when a hold would require scale rounding", "scale-rejection evidence is required");
requireText(pureTest, "zero maxOrderValue as unlimited", "unlimited-cap regression evidence is required");
requireText(postgresTest, "Promise.all", "concurrent PostgreSQL hold evidence is required");
requireText(postgresTest, '"0.0500000000"', "exact available balance assertion is required");
requireText(postgresTest, '"0.1000000001"', "exact held and ledger amount assertion is required");

if (failures.length) {
  console.error("Exchange order admission authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Exchange order admission authority check passed.");
