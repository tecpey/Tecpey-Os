import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SimulatedKeyStore } from "@/lib/wallet/signing/keystore";

describe("KeyStore public key contract", () => {
  it("returns a compressed secp256k1 key for Bitcoin", async () => {
    const store = new SimulatedKeyStore();
    const publicKey = await store.getPublicKey("bitcoin");

    assert.equal(publicKey.length, 33);
    assert.ok(publicKey[0] === 0x02 || publicKey[0] === 0x03);
  });

  it("returns an uncompressed secp256k1 key for EVM chains", async () => {
    const store = new SimulatedKeyStore();
    const publicKey = await store.getPublicKey("ethereum");

    assert.equal(publicKey.length, 65);
    assert.equal(publicKey[0], 0x04);
  });

  it("returns a 32-byte Ed25519 public key for Solana", async () => {
    const store = new SimulatedKeyStore();
    const publicKey = await store.getPublicKey("solana");

    assert.equal(publicKey.length, 32);
  });
});
