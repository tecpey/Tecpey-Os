import { readFile } from "node:fs/promises";

const files = {
  route: "src/app/api/auth/withdraw/route.ts",
  producer: "src/lib/security/withdrawal-price-producer.ts",
  confirmation: "src/lib/wallet/confirmation/engine.ts",
  settlement: "src/lib/security/withdrawal-settlement-authority.ts",
  migration: "src/lib/db-migrate-withdrawal-settlement.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  producerTests: "src/tests/security/withdrawal-price-producer.test.ts",
  settlementTests: "src/tests/security/withdrawal-settlement-postgres.test.ts",
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);
const failures = [];
const requireText = (target, text, reason) => {
  if (!content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};
const rejectText = (target, text, reason) => {
  if (content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};

requireText("route", "ensureWithdrawalPriceSnapshot", "normal admission must own price production");
requireText("route", "price_consensus_unavailable", "missing consensus must fail closed");
requireText("producer", "coinbaseQuote", "Coinbase must contribute direct-USD evidence");
requireText("producer", "krakenQuote", "Kraken must contribute direct-USD evidence");
requireText("producer", "coinGeckoQuote", "CoinGecko must provide broad asset coverage");
requireText("producer", "providers.size < 2", "consensus must require distinct providers");
requireText("producer", "MAX_SPREAD_RATIO", "provider disagreement must be bounded");
requireText("producer", "recordWithdrawalPriceSnapshot", "consensus must be signed and persisted");
rejectText("producer", "amountUsd", "producer may not accept browser withdrawal valuation");

requireText("confirmation", "settleConfirmedWithdrawal", "confirmation completion must settle held funds");
rejectText("confirmation", "state = 'completed'", "confirmation engine may not bypass settlement authority");
requireText("settlement", "held_balance = held_balance -", "settlement must consume the exact hold");
requireText("settlement", "type = 'withdraw'", "settlement must verify withdraw ledger idempotency");
requireText("settlement", "'withdraw'", "settlement must write withdraw ledger evidence");
requireText("settlement", "state = 'completed'", "state completion must share the settlement transaction");
requireText("settlement", "funds_reserved_at = NULL", "completed metadata must clear reservation evidence");
requireText("settlement", "withTx", "settlement must be atomic");

requireText("migration", "'completed', 'rejected', 'blocked', 'cancelled'", "all terminal states must clear reservation metadata");
requireText("migration", "withdrawals_terminal_reservation_cleared", "terminal metadata must have a DB constraint");
requireText("migrationPlan", "runWithdrawalSettlementMigrations", "settlement migration must be canonical");

requireText("producerTests", "requires at least two distinct fresh providers", "provider quorum needs regression tests");
requireText("producerTests", "rejects provider disagreement", "spread rejection needs regression tests");
requireText("settlementTests", "writes one withdraw ledger entry exactly once", "completion settlement needs PostgreSQL evidence");
requireText("settlementTests", '"replayed"', "settlement retry must be idempotent");

if (failures.length) {
  console.error("Withdrawal runtime authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Withdrawal runtime authority check passed: multi-source price production, fail-closed consensus, atomic confirmed settlement, terminal metadata cleanup and PostgreSQL ledger evidence are enforced.");
