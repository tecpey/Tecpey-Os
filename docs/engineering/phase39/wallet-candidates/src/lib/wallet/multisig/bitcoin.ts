// Bitcoin Multisig — Phase 39
// Supports P2WSH 2-of-3 and 3-of-5.
// BIP-67: public keys sorted lexicographically in redeem script.

import { createHash } from "crypto";
import type { P2WSHMultisig } from "./types";

// ── Script Opcodes ────────────────────────────────────────────────────────────

const OP_0 = 0x00;
const OP_1 = 0x51;
const OP_CHECKMULTISIG = 0xae;
const OP_PUSHDATA_RANGE_START = 0x01;

function pushData(buf: Buffer): Buffer {
  if (buf.length <= 75) {
    return Buffer.concat([Buffer.from([buf.length]), buf]);
  }
  // OP_PUSHDATA1
  return Buffer.concat([Buffer.from([0x4c, buf.length]), buf]);
}

// ── BIP-67 Key Sorting ────────────────────────────────────────────────────────

export function sortPublicKeys(publicKeys: Buffer[]): Buffer[] {
  return [...publicKeys].sort((a, b) => a.toString("hex").localeCompare(b.toString("hex")));
}

// ── Redeem Script ─────────────────────────────────────────────────────────────
// OP_M <pk1> ... <pkN> OP_N OP_CHECKMULTISIG

export function buildRedeemScript(m: number, publicKeys: Buffer[]): Buffer {
  if (m < 1 || m > publicKeys.length) {
    throw new Error(`Invalid multisig: ${m}-of-${publicKeys.length}`);
  }
  if (publicKeys.length > 16) {
    throw new Error("Bitcoin multisig supports at most 16 keys");
  }
  const n = publicKeys.length;
  const sorted = sortPublicKeys(publicKeys);

  // Verify all keys are compressed (33 bytes, prefix 02 or 03)
  for (const pk of sorted) {
    if (pk.length !== 33 || (pk[0] !== 0x02 && pk[0] !== 0x03)) {
      throw new Error("All public keys must be compressed (33 bytes)");
    }
  }

  const opM = Buffer.from([OP_1 + m - 1]);
  const opN = Buffer.from([OP_1 + n - 1]);
  const opChk = Buffer.from([OP_CHECKMULTISIG]);

  return Buffer.concat([opM, ...sorted.map(pushData), opN, opChk]);
}

// ── P2WSH Address ─────────────────────────────────────────────────────────────

export function buildP2WSHMultisig(m: number, publicKeys: Buffer[], testnet = false): P2WSHMultisig {
  const redeemScript = buildRedeemScript(m, publicKeys);
  const scriptHash = createHash("sha256").update(redeemScript).digest();

  const address = encodeP2WSHBech32(testnet ? "tb" : "bc", scriptHash);

  return { redeemScript, witnessScript: redeemScript, address, scriptHash };
}

// ── Witness Stack for Signing ─────────────────────────────────────────────────

/**
 * Build the scriptWitness for a P2WSH multisig input.
 * BIP141: witness = [OP_0, <sig1>, <sig2>, ..., <redeemScript>]
 * Signatures must already be DER-encoded with SIGHASH appended.
 */
export function buildP2WSHWitness(
  derSignaturesWithSighash: Buffer[],
  redeemScript: Buffer,
): Buffer[] {
  return [
    Buffer.from([OP_0]), // BIP147 dummy OP_0
    ...derSignaturesWithSighash,
    redeemScript,
  ];
}

// ── Bech32 P2WSH encoding ─────────────────────────────────────────────────────

function encodeP2WSHBech32(hrp: string, scriptHash32: Buffer): string {
  if (scriptHash32.length !== 32) throw new Error("P2WSH requires 32-byte script hash");
  return encodeBech32(hrp, 0, scriptHash32);
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

// ── Signature Collection State ────────────────────────────────────────────────

export type MultisigSignatureSet = {
  required: number;
  collected: Array<{ publicKeyHex: string; derSigWithSighash: Buffer }>;
  redeemScript: Buffer;
};

export function isThresholdMet(state: MultisigSignatureSet): boolean {
  return state.collected.length >= state.required;
}

export function buildWitnessFromState(state: MultisigSignatureSet): Buffer[] {
  if (!isThresholdMet(state)) {
    throw new Error(`Threshold not met: ${state.collected.length}/${state.required}`);
  }
  const sigs = state.collected.slice(0, state.required).map((s) => s.derSigWithSighash);
  return buildP2WSHWitness(sigs, state.redeemScript);
}
