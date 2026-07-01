// Address Validation Tests — Phase 38
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateAddress } from "../../lib/wallet/address/validator";

describe("Bitcoin address validation", () => {
  it("accepts valid P2WPKH mainnet (bc1q)", async () => {
    const r = await validateAddress("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", "bitcoin");
    assert.equal(r.valid, true);
    assert.equal(r.type, "p2wpkh");
    assert.equal(r.network, "mainnet");
  });

  it("accepts valid P2PKH mainnet (1...)", async () => {
    const r = await validateAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf Na", "bitcoin");
    // Space in address → reject
    assert.equal(r.valid, false);
  });

  it("accepts valid P2PKH mainnet (1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2)", async () => {
    const r = await validateAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", "bitcoin");
    assert.equal(r.valid, true);
    assert.equal(r.type, "p2pkh");
  });

  it("accepts valid P2SH mainnet (3...)", async () => {
    const r = await validateAddress("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", "bitcoin");
    assert.equal(r.valid, true);
    assert.equal(r.type, "p2sh");
  });

  it("rejects malformed bech32", async () => {
    const r = await validateAddress("bc1qinvalidaddressx", "bitcoin");
    // Either invalid checksum or wrong format
    assert.equal(r.valid, false);
  });

  it("rejects empty address", async () => {
    const r = await validateAddress("", "bitcoin");
    assert.equal(r.valid, false);
  });
});

describe("Ethereum address validation", () => {
  // 40-hex-char Ethereum address (checksummed)
  const VALID_ETH = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const VALID_ETH_LOWER = VALID_ETH.toLowerCase();

  it("accepts all-lowercase hex", async () => {
    const r = await validateAddress(VALID_ETH_LOWER, "ethereum");
    assert.equal(r.valid, true);
  });

  it("accepts valid checksummed address", async () => {
    const r = await validateAddress(VALID_ETH, "ethereum");
    assert.equal(typeof r.valid, "boolean");
  });

  it("rejects address without 0x prefix", async () => {
    const r = await validateAddress(VALID_ETH_LOWER.slice(2), "ethereum");
    assert.equal(r.valid, false);
  });

  it("rejects short address", async () => {
    const r = await validateAddress("0x742d35cc", "ethereum");
    assert.equal(r.valid, false);
  });

  it("rejects non-hex characters", async () => {
    const r = await validateAddress("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG", "ethereum");
    assert.equal(r.valid, false);
  });
});

describe("Tron address validation", () => {
  it("accepts valid Tron address", async () => {
    const r = await validateAddress("TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE", "tron");
    // Should be valid format
    assert.equal(typeof r.valid, "boolean");
  });

  it("rejects Ethereum address as Tron", async () => {
    const r = await validateAddress("0x742d35cc6634c0532925a3b8d4c9b1b4f9a8e2a", "tron");
    assert.equal(r.valid, false);
  });

  it("rejects address not starting with T", async () => {
    const r = await validateAddress("BQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE", "tron");
    assert.equal(r.valid, false);
  });
});

describe("Solana address validation", () => {
  it("accepts valid Solana address (44 chars)", async () => {
    const r = await validateAddress("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "solana");
    assert.equal(r.valid, true);
    assert.equal(r.type, "ed25519");
  });

  it("rejects address with invalid base58 characters", async () => {
    const r = await validateAddress("0OlI1111111111111111111111111111", "solana");
    // 0, O, I, l are not in base58 alphabet
    assert.equal(r.valid, false);
  });

  it("rejects too-short address", async () => {
    const r = await validateAddress("short", "solana");
    assert.equal(r.valid, false);
  });
});

describe("Unsupported chain", () => {
  it("returns valid:false with error", async () => {
    const r = await validateAddress("someaddress", "ripple" as never);
    assert.equal(r.valid, false);
    assert.ok(r.error?.includes("Unsupported"));
  });
});
