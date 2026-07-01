// UTXO Selection Tests — Phase 38
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectUTXOs } from "../../lib/wallet/providers/bitcoin";
import type { UTXO } from "../../lib/wallet/types";

function makeUtxo(txid: string, sats: bigint): UTXO {
  return {
    txid,
    vout: 0,
    value: sats,
    scriptPubKey: Buffer.alloc(22),
    address: "bc1qtest",
    confirmations: 6,
  };
}

describe("UTXO selection (largest-first)", () => {
  it("selects single large UTXO for small amount", () => {
    const utxos = [
      makeUtxo("aaa", BigInt(50_000)),
      makeUtxo("bbb", BigInt(10_000)),
      makeUtxo("ccc", BigInt(100_000)),
    ];
    const result = selectUTXOs(utxos, BigInt(20_000), 10);
    assert.ok(result !== null);
    assert.equal(result.inputs.length, 1);
    assert.equal(result.inputs[0].txid, "ccc");
  });

  it("uses multiple UTXOs if single is insufficient", () => {
    const utxos = [
      makeUtxo("a", BigInt(30_000)),
      makeUtxo("b", BigInt(30_000)),
      makeUtxo("c", BigInt(30_000)),
    ];
    const result = selectUTXOs(utxos, BigInt(70_000), 5);
    assert.ok(result !== null);
    assert.equal(result.inputs.length, 3);
  });

  it("returns null when insufficient funds", () => {
    const utxos = [makeUtxo("a", BigInt(1_000))];
    const result = selectUTXOs(utxos, BigInt(50_000), 10);
    assert.equal(result, null);
  });

  it("skips dust UTXOs (<546 sats)", () => {
    const utxos = [
      makeUtxo("dust", BigInt(500)),
      makeUtxo("ok", BigInt(100_000)),
    ];
    const result = selectUTXOs(utxos, BigInt(10_000), 5);
    assert.ok(result !== null);
    assert.equal(result.inputs.length, 1);
    assert.equal(result.inputs[0].txid, "ok");
  });

  it("calculates fee in expected range (sats/vByte × vBytes)", () => {
    const utxos = [makeUtxo("a", BigInt(200_000))];
    const result = selectUTXOs(utxos, BigInt(100_000), 10);
    assert.ok(result !== null);
    assert.ok(result.fee > BigInt(1_000) && result.fee < BigInt(2_000), `fee=${result.fee}`);
  });

  it("adds dust to fee when change < 546 sats", () => {
    // fee for 1-in/2-out at 10 sat/vByte ≈ 1420 sats
    // input 101_500 → change = 101_500 - 100_000 - 1420 = 80 sats (dust < 546)
    const utxos = [makeUtxo("a", BigInt(101_500))];
    const result = selectUTXOs(utxos, BigInt(100_000), 10);
    assert.ok(result !== null, "should find sufficient UTXO");
    assert.equal(result.change, BigInt(0), "dust should be added to fee");
  });

  it("totalInput == fee + target + change", () => {
    const utxos = [makeUtxo("a", BigInt(200_000))];
    const result = selectUTXOs(utxos, BigInt(50_000), 5);
    assert.ok(result !== null);
    assert.equal(
      result.totalInput,
      result.fee + BigInt(50_000) + result.change,
    );
  });
});
