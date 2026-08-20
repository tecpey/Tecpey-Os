import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ceilDiv,
  formatAtomicUnits,
  multiplyByBasisPointsCeil,
  parseAtomicOrDecimalAmountInput,
  parseDecimalToAtomicUnits,
} from "../../lib/wallet/amount";

describe("wallet atomic amount helpers", () => {
  it("parses BTC decimal strings without floating point", () => {
    assert.equal(parseDecimalToAtomicUnits("0.00000001", 8), BigInt(1));
    assert.equal(parseDecimalToAtomicUnits("1.23456789", 8), BigInt(123_456_789));
    assert.equal(parseDecimalToAtomicUnits("1e-8", 8), BigInt(1));
  });

  it("parses ETH wei precision and rejects excess precision", () => {
    assert.equal(parseDecimalToAtomicUnits("1.000000000000000001", 18), BigInt("1000000000000000001"));
    assert.throws(() => parseDecimalToAtomicUnits("0.0000000000000000001", 18), /amount_decimal_precision_exceeded/);
  });

  it("preserves provider input contract for atomic integers and native decimals", () => {
    assert.equal(parseAtomicOrDecimalAmountInput("1000", 8), BigInt(1_000));
    assert.equal(parseAtomicOrDecimalAmountInput("0.00001000", 8), BigInt(1_000));
    assert.equal(parseAtomicOrDecimalAmountInput("1000000000000000000", 18), BigInt("1000000000000000000"));
    assert.equal(parseAtomicOrDecimalAmountInput("1.0", 18), BigInt("1000000000000000000"));
    assert.throws(() => parseAtomicOrDecimalAmountInput("", 8), /amount_atomic_invalid/);
  });

  it("formats atomic units without Number conversion", () => {
    assert.equal(formatAtomicUnits(BigInt(123_456_789), 8, 8), "1.23456789");
    assert.equal(formatAtomicUnits(BigInt("210000000000000"), 18, 8), "0.00021000");
    assert.equal(formatAtomicUnits(BigInt(5_200), 9, 9), "0.000005200");
  });

  it("uses integer ceiling for fee multipliers", () => {
    assert.equal(ceilDiv(BigInt(1001), BigInt(1000)), BigInt(2));
    assert.equal(multiplyByBasisPointsCeil(BigInt(3), BigInt(15_000)), BigInt(5));
  });
});
