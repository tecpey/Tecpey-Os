// Address Derivation from Public Key — Phase 39
// Used by HSM/MPC providers that return raw public key bytes, not private keys.

import { createHash } from "crypto";
import type { ChainId } from "../types";

export async function deriveAddressFromPublicKey(publicKey: Buffer, chainId: ChainId): Promise<string> {
  switch (chainId) {
    case "ethereum":
    case "bsc":
    case "polygon":
    case "tron":
      return evmAddress(publicKey);
    case "bitcoin":
      return btcP2WPKHAddress(publicKey);
    case "solana":
      return solanaAddress(publicKey);
    default:
      throw new Error(`Unsupported chain for address derivation: ${chainId}`);
  }
}

async function evmAddress(publicKey: Buffer): Promise<string> {
  // Accepts both uncompressed (65 bytes, 0x04 prefix) and compressed (33 bytes)
  const body = publicKey.length === 65 ? publicKey.slice(1) : publicKey;
  const { keccak_256 } = await import("@noble/hashes/sha3.js");
  const hash = keccak_256(body);
  return "0x" + Buffer.from(hash).slice(12).toString("hex");
}

function btcP2WPKHAddress(publicKey: Buffer, testnet = false): string {
  // Expects compressed 33-byte public key
  const compressed = publicKey.length === 33 ? publicKey : compressPublicKey(publicKey);
  const sha256Hash = createHash("sha256").update(compressed).digest();
  const hash160 = createHash("ripemd160").update(sha256Hash).digest();
  return encodeBech32(testnet ? "tb" : "bc", 0, hash160);
}

function solanaAddress(publicKey: Buffer): string {
  // Ed25519 public key is 32 bytes; Solana address = base58(pubkey)
  const key = publicKey.length > 32 ? publicKey.slice(-32) : publicKey;
  return base58Encode(key);
}

function compressPublicKey(uncompressed: Buffer): Buffer {
  if (uncompressed.length === 33) return uncompressed;
  const x = uncompressed.slice(1, 33);
  const y = uncompressed.slice(33, 65);
  const prefix = (y[y.length - 1] & 1) === 0 ? 0x02 : 0x03;
  return Buffer.concat([Buffer.from([prefix]), x]);
}

function encodeBech32(hrp: string, version: number, data: Buffer): string {
  const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const bits5: number[] = [];
  let value = 0;
  let bits = 0;
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      bits5.push((value >> bits) & 31);
    }
  }
  if (bits > 0) bits5.push((value << (5 - bits)) & 31);

  const converted = [version, ...bits5];

  function polymod(values: number[]): number {
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (const v of values) {
      const b = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) {
        if ((b >> i) & 1) chk ^= GEN[i];
      }
    }
    return chk;
  }

  const hrpExpand = [...hrp].flatMap((c) => [c.charCodeAt(0) >> 5]).concat(
    0, ...[...hrp].map((c) => c.charCodeAt(0) & 31),
  );
  const checksumInput = [...hrpExpand, ...converted, 0, 0, 0, 0, 0, 0];
  const mod = polymod(checksumInput) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >> (5 * (5 - i))) & 31);
  return hrp + "1" + [...converted, ...checksum].map((d) => CHARSET[d]).join("");
}

const B58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(buf: Buffer): string {
  let n = BigInt("0x" + buf.toString("hex"));
  let result = "";
  while (n > BigInt(0)) {
    result = B58_CHARS[Number(n % BigInt(58))] + result;
    n = n / BigInt(58);
  }
  for (const byte of buf) {
    if (byte !== 0) break;
    result = "1" + result;
  }
  return result;
}
