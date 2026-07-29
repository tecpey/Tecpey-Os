// Address Validation — Phase 38
// Pure implementations for Bitcoin, Ethereum/EVM, Tron, Solana address validation.

import { createHash } from "crypto";
import type { AddressValidationResult, ChainId } from "../types";

// ── Base58 (Bitcoin / Solana) ─────────────────────────────────────────────────

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = new Uint8Array(256).fill(255);
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP[BASE58_ALPHABET.charCodeAt(i)] = i;
}

export function base58Decode(input: string): Buffer {
  let result = BigInt(0);
  for (const char of input) {
    const val = BASE58_MAP[char.charCodeAt(0)];
    if (val === 255) throw new Error(`Invalid base58 character: ${char}`);
    result = result * BigInt(58) + BigInt(val);
  }
  const bytes: number[] = [];
  while (result > BigInt(0)) {
    bytes.unshift(Number(result & BigInt(0xff)));
    result >>= BigInt(8);
  }
  let leadingZeros = 0;
  for (const c of input) {
    if (c !== "1") break;
    leadingZeros++;
  }
  return Buffer.from([...new Uint8Array(leadingZeros), ...bytes]);
}

function base58CheckDecode(input: string): Buffer {
  const decoded = base58Decode(input);
  if (decoded.length < 4) throw new Error("Too short for base58check");
  const payload = decoded.slice(0, -4);
  const checksum = decoded.slice(-4);
  const hash = sha256d(payload);
  for (let i = 0; i < 4; i++) {
    if (hash[i] !== checksum[i]) throw new Error("Base58check: invalid checksum");
  }
  return payload;
}

export function sha256d(buf: Buffer): Buffer {
  const first = createHash("sha256").update(buf).digest();
  return createHash("sha256").update(first).digest();
}

// ── Bech32 / SegWit ───────────────────────────────────────────────────────────

const BECH32_ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function bech32Polymod(values: Uint8Array): number {
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

function bech32HrpExpand(hrp: string): Uint8Array {
  const ret = new Uint8Array(hrp.length * 2 + 1);
  for (let i = 0; i < hrp.length; i++) {
    ret[i] = hrp.charCodeAt(i) >> 5;
    ret[i + hrp.length + 1] = hrp.charCodeAt(i) & 31;
  }
  ret[hrp.length] = 0;
  return ret;
}

function bech32Verify(hrp: string, address: string): boolean {
  const lower = address.toLowerCase();
  const sep = lower.lastIndexOf("1");
  if (sep < 1 || sep + 7 > lower.length || lower.length > 90) return false;
  const hrpPart = lower.slice(0, sep);
  if (hrpPart !== hrp) return false;
  const data = new Uint8Array(lower.length - sep - 1);
  for (let i = 0; i < data.length; i++) {
    const idx = BECH32_ALPHABET.indexOf(lower[sep + 1 + i]);
    if (idx === -1) return false;
    data[i] = idx;
  }
  const hrpExpanded = bech32HrpExpand(hrpPart);
  const combined = new Uint8Array(hrpExpanded.length + data.length);
  combined.set(hrpExpanded);
  combined.set(data, hrpExpanded.length);
  return bech32Polymod(combined) === 1;
}

// ── Ethereum EIP-55 Checksum ──────────────────────────────────────────────────

async function keccak256(input: Buffer): Promise<Buffer> {
  try {
    const { keccak_256 } = await import("@noble/hashes/sha3.js");
    return Buffer.from(keccak_256(input));
  } catch {
    return Buffer.alloc(32);
  }
}

async function toEip55Checksum(address: string): Promise<string> {
  const lower = address.toLowerCase().replace("0x", "");
  const hash = await keccak256(Buffer.from(lower));
  const hashHex = hash.toString("hex");
  let checksummed = "0x";
  for (let i = 0; i < lower.length; i++) {
    const c = lower[i];
    if (/[0-9]/.test(c)) {
      checksummed += c;
    } else {
      checksummed += parseInt(hashHex[i], 16) >= 8 ? c.toUpperCase() : c;
    }
  }
  return checksummed;
}

// ── Validators ────────────────────────────────────────────────────────────────

async function validateBitcoin(address: string): Promise<AddressValidationResult> {
  const lower = address.toLowerCase();

  if (lower.startsWith("bc1q")) {
    const valid = bech32Verify("bc", address);
    if (!valid) return { valid: false, error: "Invalid bech32 checksum" };
    const type = lower.length === 42 ? "p2wpkh" : lower.length === 62 ? "p2wsh" : "unknown";
    return { valid: true, normalizedAddress: lower, network: "mainnet", type };
  }

  if (lower.startsWith("tb1q")) {
    const valid = bech32Verify("tb", address);
    if (!valid) return { valid: false, error: "Invalid bech32 checksum (testnet)" };
    return { valid: true, normalizedAddress: lower, network: "testnet", type: "p2wpkh" };
  }

  if (address.startsWith("1")) {
    try {
      const decoded = base58CheckDecode(address);
      if (decoded.length !== 21 || decoded[0] !== 0x00) {
        return { valid: false, error: "Invalid P2PKH prefix" };
      }
      return { valid: true, normalizedAddress: address, network: "mainnet", type: "p2pkh" };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : "Invalid base58check" };
    }
  }

  if (address.startsWith("3")) {
    try {
      const decoded = base58CheckDecode(address);
      if (decoded.length !== 21 || decoded[0] !== 0x05) {
        return { valid: false, error: "Invalid P2SH prefix" };
      }
      return { valid: true, normalizedAddress: address, network: "mainnet", type: "p2sh" };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : "Invalid base58check" };
    }
  }

  return { valid: false, error: "Unrecognized Bitcoin address format" };
}

async function validateEvm(address: string): Promise<AddressValidationResult> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return { valid: false, error: "Invalid EVM address format (must be 0x + 40 hex chars)" };
  }
  try {
    const normalized = await toEip55Checksum(address);
    if (address !== address.toLowerCase() && address !== address.toUpperCase()) {
      if (address !== normalized) {
        return { valid: false, error: "EIP-55 checksum mismatch" };
      }
    }
    return { valid: true, normalizedAddress: normalized, network: "mainnet", type: "evm" };
  } catch {
    return { valid: false, error: "Address checksum failed" };
  }
}

async function validateTron(address: string): Promise<AddressValidationResult> {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
    return { valid: false, error: "Invalid Tron address format (must start with T, 34 chars)" };
  }
  try {
    const decoded = base58CheckDecode(address);
    if (decoded.length !== 21 || decoded[0] !== 0x41) {
      return { valid: false, error: "Invalid Tron address prefix (expected 0x41)" };
    }
    return { valid: true, normalizedAddress: address, network: "mainnet", type: "tron" };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : "Invalid Tron base58check" };
  }
}

async function validateSolana(address: string): Promise<AddressValidationResult> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return { valid: false, error: "Invalid Solana address format (32-44 base58 chars)" };
  }
  try {
    const decoded = base58Decode(address);
    if (decoded.length !== 32) {
      return { valid: false, error: `Invalid Solana address length: ${decoded.length} bytes (expected 32)` };
    }
    return { valid: true, normalizedAddress: address, network: "mainnet", type: "ed25519" };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : "Invalid Solana base58" };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function validateAddress(
  address: string,
  chainId: ChainId,
): Promise<AddressValidationResult> {
  if (!address || typeof address !== "string") {
    return { valid: false, error: "Address is required" };
  }
  const trimmed = address.trim();

  switch (chainId) {
    case "bitcoin":
      return validateBitcoin(trimmed);
    case "ethereum":
    case "bsc":
    case "polygon":
      return validateEvm(trimmed);
    case "tron":
      return validateTron(trimmed);
    case "solana":
      return validateSolana(trimmed);
    default:
      return { valid: false, error: `Unsupported chain: ${chainId}` };
  }
}
