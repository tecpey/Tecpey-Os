// Exchange reconciliation authority guard — issue #30.
//
// Reconciliation only has value if it stays *detective*. The two ways it stops
// being trustworthy are silent: it starts repairing (rewriting immutable
// financial history), or it starts doing financial arithmetic in JavaScript
// (where 0.1 + 0.2 is not 0.3 and a real delta can round away). Both are
// refused here.

import { readFile } from "node:fs/promises";

const files = {
  authority: "src/lib/trading/exchange-reconciliation.ts",
  cli: "scripts/reconcile-exchange-ledger.ts",
  tests: "src/tests/trading/exchange-reconciliation-postgres.test.ts",
  package: "package.json",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

const failures = [];
const requireText = (target, text, reason) => {
  if (!source[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};
const rejectPattern = (target, pattern, reason) => {
  if (pattern.test(source[target])) failures.push(`${files[target]}: ${reason}`);
};

// Every delta class must remain declared and reported.
for (const code of [
  "wallet_available_ledger_divergence",
  "wallet_held_ledger_divergence",
  "order_quantity_identity_broken",
  "order_fill_trade_divergence",
  "trade_fee_ledger_divergence",
  "terminal_order_residual_hold",
]) {
  requireText("authority", code, `reconciliation must keep the ${code} check`);
}

// Read-only. A reconciliation that can write is a reconciliation that can hide
// the very delta it was built to surface.
for (const mutation of ["INSERT INTO", "UPDATE ", "DELETE FROM", "withTx("]) {
  rejectPattern(
    "authority",
    new RegExp(mutation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `reconciliation must stay read-only and may not ${mutation.trim().toLowerCase()}`,
  );
}

// Financial comparison stays in PostgreSQL NUMERIC.
for (const [pattern, reason] of [
  [/\bparseFloat\s*\(/, "parseFloat is forbidden in the reconciliation authority"],
  [/\bNumber\s*\(/, "financial values may not be coerced to JavaScript numbers"],
  [/\.toFixed\s*\(/, "financial values may not be rounded in JavaScript"],
]) {
  rejectPattern("authority", pattern, reason);
}

// Divergence decisions are made in SQL; comparing rendered NUMERIC text in
// JavaScript reports "0" and "0.000000000000000000" as different values.
requireText(
  "authority",
  "available_diverged",
  "available divergence must be decided in SQL, not by comparing rendered text",
);
requireText(
  "authority",
  "held_diverged",
  "held divergence must be decided in SQL, not by comparing rendered text",
);

// An unreachable database is never a clean result.
requireText(
  "authority",
  "exchange_reconciliation_storage_unavailable",
  "an unavailable database must fail closed rather than report reconciled",
);
requireText(
  "authority",
  "EXCHANGE_RECONCILIATION_POLICY_VERSION",
  "reports must carry a versioned reconciliation policy",
);
requireText(
  "authority",
  "evidenceDigest",
  "reports must carry a canonical evidence digest for snapshot comparison",
);

// The operator command must fail closed on any unexplained delta.
requireText(
  "cli",
  "if (!report.reconciled) process.exit(1);",
  "the reconcile command must exit non-zero when deltas remain",
);

// Adversarial evidence required by issue #30.
requireText(
  "tests",
  "detects an injected one-unit balance discrepancy and fails closed",
  "the injected one-unit discrepancy proof must remain",
);
requireText(
  "tests",
  "detects a terminal order that still holds funds",
  "the residual-hold proof must remain",
);

const packageJson = JSON.parse(source.package);
if (!packageJson.scripts?.["exchange:reconcile"]) {
  failures.push("package: exchange:reconcile command is missing");
}
if (!packageJson.scripts?.["test:exchange-reconciliation"]) {
  failures.push("package: test:exchange-reconciliation is missing");
}

if (failures.length) {
  console.error("Exchange reconciliation authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Exchange reconciliation authority check passed: six delta classes, read-only PostgreSQL NUMERIC comparison, fail-closed storage, versioned policy and adversarial proofs are enforced.",
);
