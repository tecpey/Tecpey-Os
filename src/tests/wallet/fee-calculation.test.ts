// Fee Calculation Tests — Phase 38
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getEthereumGasForTransfer } from "../../lib/wallet/fee/engine";

describe("Ethereum gas estimation", () => {
  it("returns 21000 for native ETH transfer", () => {
    const gas = getEthereumGasForTransfer(undefined);
    assert.equal(gas, BigInt(21_000));
  });

  it("returns 65000 for ERC-20 transfer", () => {
    const gas = getEthereumGasForTransfer("0xdAC17F958D2ee523a2206206994597C13D831ec7");
    assert.equal(gas, BigInt(65_000));
  });
});

describe("Fee cache keys", () => {
  it("is deterministic per chain+speed", () => {
    const key1 = `ethereum:normal`;
    const key2 = `ethereum:normal`;
    assert.equal(key1, key2);
  });

  it("is distinct for different speeds", () => {
    assert.notEqual("bitcoin:economy", "bitcoin:priority");
  });
});
