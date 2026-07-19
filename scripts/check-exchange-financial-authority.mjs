import fs from "node:fs";

const validation = fs.readFileSync("src/lib/trading/validation.ts", "utf8");
const failures = [];

for (const forbidden of [
  "parseFloat(",
  "Math.round(",
  "1e-10",
  "Number(request.quantity)",
  "Number(request.price)",
]) {
  if (validation.includes(forbidden)) {
    failures.push(`order validation must not use floating-point financial arithmetic: ${forbidden}`);
  }
}

for (const required of [
  'import Decimal from "decimal.js"',
  "value.mod(increment).isZero()",
  "price.mul(quantity)",
  "Decimal.ROUND_HALF_UP",
  "invalid_market_step_size",
  "invalid_market_tick_size",
]) {
  if (!validation.includes(required)) {
    failures.push(`Decimal-safe order validation boundary missing: ${required}`);
  }
}

if (failures.length) {
  console.error("Exchange financial authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Exchange financial authority check passed for order validation slice.");
