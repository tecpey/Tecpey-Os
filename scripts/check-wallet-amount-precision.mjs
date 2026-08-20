import { readFile } from "node:fs/promises";

const guardedFiles = [
  "src/lib/wallet/providers/bitcoin.ts",
  "src/lib/wallet/providers/ethereum.ts",
  "src/lib/wallet/fee/engine.ts",
  "src/lib/security/withdrawal-admission-service.ts",
  "src/lib/security/security-notifications.ts",
];

const forbidden = [
  [/\bparseFloat\s*\(/, "parseFloat is forbidden for wallet/provider financial amounts"],
  [/\bMath\.round\s*\(/, "Math.round is forbidden for wallet/provider financial amounts"],
  [/\bNumber\s*\(\s*(?:networkFeeWei|selection\.fee|valuation\.evidence\.amountUsd|maxPriorityFeeGwei)/, "Number(...) is forbidden for wallet/provider financial amounts"],
  [/(?:amountUsd|networkFeeWei|networkFeeSats|selection\.fee|totalLamports)\.toFixed\s*\(/, "native number .toFixed() is forbidden for wallet/provider financial amounts"],
  [/\*\s*1e(?:8|9|18)\b/, "floating exponent multipliers are forbidden for atomic wallet amounts"],
  [/\/\s*1e(?:8|9|18)\b/, "floating exponent divisors are forbidden for atomic wallet amounts"],
];

const failures = [];

for (const path of guardedFiles) {
  const source = await readFile(path, "utf8");
  for (const [pattern, message] of forbidden) {
    if (pattern.test(source)) failures.push(`${path}: ${message}`);
  }
}

const helper = await readFile("src/lib/wallet/amount.ts", "utf8");
for (const token of [
  "parseDecimalToAtomicUnits",
  "parseAtomicOrDecimalAmountInput",
  "formatAtomicUnits",
  "ceilDiv",
  "multiplyByBasisPointsCeil",
]) {
  if (!helper.includes(token)) failures.push(`src/lib/wallet/amount.ts: missing ${token}`);
}

if (failures.length > 0) {
  console.error("Wallet amount precision guard failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Wallet amount precision guard passed.");
