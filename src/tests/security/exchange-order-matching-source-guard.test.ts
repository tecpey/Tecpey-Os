import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const files = {
  inventory: "docs/financial/EXCHANGE_DECIMAL_MATCHING_SETTLEMENT_INVENTORY.md",
  engine: "src/lib/trading/engine.ts",
  book: "src/lib/trading/order-book-store.ts",
  recovery: "src/lib/trading/order-book-recovery.ts",
  financials: "src/lib/trading/matching-financials.ts",
  settlement: "src/lib/trading/matching-settlement-authority.ts",
  orderFill: "src/lib/trading/matching-order-service.ts",
  trade: "src/lib/trading/trade-service.ts",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, readFileSync(path, "utf8")]),
);

function assertAbsent(target: keyof typeof files, pattern: RegExp, reason: string): void {
  assert.equal(
    pattern.test(source[target]),
    false,
    `${files[target]}: ${reason}`,
  );
}

function assertPresent(target: keyof typeof files, token: string, reason: string): void {
  assert.equal(
    source[target].includes(token),
    true,
    `${files[target]}: ${reason}`,
  );
}

describe("Exchange Decimal matching source authority", () => {
  it("rejects floating-point financial decisions from the active matching path", () => {
    for (const target of ["engine", "book", "recovery", "financials", "settlement", "orderFill", "trade"] as const) {
      assertAbsent(target, /\bparseFloat\s*\(/, "parseFloat is forbidden");
      assertAbsent(target, /\.toNumber\s*\(/, "Decimal.toNumber is forbidden");
      assertAbsent(target, /\b1e-\d+\b/, "epsilon decisions are forbidden");
    }
    for (const target of ["engine", "book", "recovery", "financials", "settlement", "orderFill", "trade"] as const) {
      assertAbsent(
        target,
        /\bNumber\s*\([^)]*(?:price|quantity|remaining|fee|amount|volume|hold)/i,
        "financial Number coercion is forbidden",
      );
    }
    assertAbsent("engine", /fillQty\s*\*\s*tradePrice/, "number multiplication is forbidden");
    assertAbsent("engine", /Math\.min\s*\(/, "financial Math.min is forbidden");
    assertAbsent("engine", /updateOrderFillTx/, "legacy numeric order fill API is forbidden");
    assertAbsent("engine", /debitTradeFundsTx|creditTradeFundsTx|chargeTradeFeeTx/, "engine must delegate settlement to the exact authority");
  });

  it("requires exact string representations and PostgreSQL authority", () => {
    for (const token of [
      "pricePerUnit: string",
      "originalQty: string",
      "remaining: string",
      "getFOKVolume(",
      "): string",
    ]) {
      assertPresent("book", token, `missing exact book contract ${token}`);
    }
    assertPresent("book", "D(right).cmp(D(left))", "bid sorting must use Decimal comparison");
    assertPresent("book", "D(left).cmp(D(right))", "ask sorting must use Decimal comparison");
    assertPresent("book", "Redis score is projection ordering only", "Redis score must be explicitly non-authoritative");
    assertAbsent("book", /\.zscore\s*\(/, "Redis score cannot drive financial decisions");
    assertPresent("recovery", "price::text", "book rebuild must read PostgreSQL numeric text");
    assertPresent("recovery", "remaining_quantity::text", "book rebuild must read exact remaining text");
    assertPresent("engine", "withExchangeMarketExecutionLock", "market execution lock must remain enforced");
    assertPresent("engine", "validateLockedOrdersTx", "orders must be revalidated under row locks");
    assertPresent("engine", "settleExactTradeTx", "engine must use exact settlement authority");
    assertPresent("engine", "applyExactOrderFillTx", "engine must use exact order fill authority");
  });

  it("requires explicit rounding and value conservation", () => {
    assertPresent("financials", "Decimal.ROUND_DOWN", "settlement rounding policy must be explicit");
    assertPresent("financials", "trade_amount_below_settlement_scale", "sub-scale zero trades must fail closed");
    assertPresent("financials", "platformFeeCredit", "fee conservation must be explicit");
    assertPresent("settlement", "system:exchange-fees", "platform fee wallet must be explicit");
    assertPresent("settlement", "input.amounts.quoteGross", "seller and buyer gross transfer must be explicit");
    assertPresent("settlement", "input.amounts.buyerFee", "buyer fee debit is required");
    assertPresent("settlement", "input.amounts.sellerFee", "seller fee debit is required");
    assertPresent("settlement", "platformFeeCredit", "combined platform fee credit is required");
    assertPresent("orderFill", "$2::numeric", "order fill arithmetic must remain PostgreSQL NUMERIC");
    assertPresent("trade", "$5::numeric", "trade persistence must cast exact strings to NUMERIC");
  });

  it("keeps the bounded release and non-goals documented", () => {
    for (const token of [
      "single-node safety contract remain intact",
      "PostgreSQL remains authority",
      "no multi-node matching redesign",
      "source guard rejects `Number`, `parseFloat`, epsilon",
    ]) {
      assertPresent("inventory", token, `inventory missing ${token}`);
    }
  });
});
