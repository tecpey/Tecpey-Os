// Bitcoin Provider — Phase 38
// P2WPKH (SegWit v0) transaction building.
// UTXO selection: largest-first with dust protection (546 sats minimum).
// Fee: sats/vByte × vBytes (base + witness/4).

import { createHash } from "crypto";
import type {
  BuildTransactionInput,
  BuiltTransaction,
  ChainId,
  ConfirmationStatus,
  FeeEstimate,
  FeeSpeed,
  SignedTransaction,
  UTXO,
  UTXOSelection,
  WalletProvider,
  AddressValidationResult,
} from "../types";
import { getRpcClient } from "../rpc/client";
import { estimateFee } from "../fee/engine";

const DUST_THRESHOLD_SATS = BigInt(546);

// ── UTXO Selection (Largest-First) ───────────────────────────────────────────

export function selectUTXOs(
  utxos: UTXO[],
  targetSats: bigint,
  feeSatsPerVByte: number,
): UTXOSelection | null {
  const sorted = [...utxos].sort((a, b) => {
    if (b.value > a.value) return 1;
    if (b.value < a.value) return -1;
    return 0;
  });
  const selected: UTXO[] = [];
  let total = BigInt(0);

  for (const utxo of sorted) {
    if (utxo.value < DUST_THRESHOLD_SATS) continue;
    selected.push(utxo);
    total += utxo.value;

    const fee = estimateTxFee(selected.length, 2, feeSatsPerVByte);
    if (total >= targetSats + fee) {
      const change = total - targetSats - fee;
      if (change > BigInt(0) && change < DUST_THRESHOLD_SATS) {
        return { inputs: selected, totalInput: total, fee: fee + change, change: BigInt(0) };
      }
      return { inputs: selected, totalInput: total, fee, change };
    }
  }

  return null;
}

// P2WPKH vBytes = base + witness/4
function estimateTxFee(inputCount: number, outputCount: number, satsPerVByte: number): bigint {
  const baseBytes = 4 + 2 + 1 + (41 * inputCount) + 1 + (31 * outputCount) + 4;
  const witnessBytes = 108 * inputCount;
  const vBytes = Math.ceil(baseBytes + witnessBytes / 4);
  return BigInt(Math.ceil(vBytes * satsPerVByte));
}

// ── Serialization ─────────────────────────────────────────────────────────────

function varInt(n: number): Buffer {
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) {
    const b = Buffer.alloc(3);
    b[0] = 0xfd;
    b.writeUInt16LE(n, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = 0xfe;
  b.writeUInt32LE(n, 1);
  return b;
}

function writeLE64(value: bigint): Buffer {
  const b = Buffer.alloc(8);
  const lo = Number(value & BigInt(0xffffffff));
  const hi = Number(value >> BigInt(32));
  b.writeUInt32LE(lo, 0);
  b.writeUInt32LE(hi, 4);
  return b;
}

function buildP2WPKHScript(hash160: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x00, 0x14]), hash160]);
}

function addressToScriptPubKey(address: string): Buffer {
  const lower = address.toLowerCase();
  if (lower.startsWith("bc1q") || lower.startsWith("tb1q")) {
    return buildP2WPKHScript(bech32DecodeWitness(address));
  }
  throw new Error(`Unsupported address type: ${address}`);
}

function bech32DecodeWitness(address: string): Buffer {
  const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const lower = address.toLowerCase();
  const sep = lower.lastIndexOf("1");
  const data5 = [];
  for (let i = sep + 2; i < lower.length - 6; i++) {
    data5.push(CHARSET.indexOf(lower[i]));
  }
  const bytes: number[] = [];
  let value = 0, bits = 0;
  for (const d of data5) {
    value = (value << 5) | d;
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >> bits) & 0xff); }
  }
  return Buffer.from(bytes);
}

function serializeUnsignedSegWit(
  inputs: UTXO[],
  toAddress: string,
  toSats: bigint,
  changeAddress: string,
  changeSats: bigint,
): Buffer {
  const toScript = addressToScriptPubKey(toAddress);
  const changeScript = addressToScriptPubKey(changeAddress);
  const parts: Buffer[] = [];

  const version = Buffer.alloc(4);
  version.writeUInt32LE(2, 0);
  parts.push(version);
  parts.push(Buffer.from([0x00, 0x01]));
  parts.push(varInt(inputs.length));

  for (const input of inputs) {
    parts.push(Buffer.from(input.txid, "hex").reverse());
    const voutBuf = Buffer.alloc(4);
    voutBuf.writeUInt32LE(input.vout, 0);
    parts.push(voutBuf);
    parts.push(Buffer.from([0x00]));
    parts.push(Buffer.from([0xff, 0xff, 0xff, 0xff]));
  }

  const outputCount = changeSats > BigInt(0) ? 2 : 1;
  parts.push(varInt(outputCount));
  parts.push(writeLE64(toSats));
  parts.push(varInt(toScript.length));
  parts.push(toScript);

  if (changeSats > BigInt(0)) {
    parts.push(writeLE64(changeSats));
    parts.push(varInt(changeScript.length));
    parts.push(changeScript);
  }

  parts.push(Buffer.from([0x00, 0x00, 0x00, 0x00]));
  return Buffer.concat(parts);
}

function computeP2WPKHSigHash(
  inputs: UTXO[],
  inputIndex: number,
  toAddress: string,
  toSats: bigint,
  changeAddress: string,
  changeSats: bigint,
  scriptCode: Buffer,
): Buffer {
  const sha256d = (buf: Buffer) => createHash("sha256").update(
    createHash("sha256").update(buf).digest(),
  ).digest();

  const version = Buffer.alloc(4);
  version.writeUInt32LE(2, 0);

  const prevouts = Buffer.concat(inputs.map((i) => {
    const txid = Buffer.from(i.txid, "hex").reverse();
    const vout = Buffer.alloc(4);
    vout.writeUInt32LE(i.vout, 0);
    return Buffer.concat([txid, vout]);
  }));
  const hashPrevouts = sha256d(prevouts);
  const sequences = Buffer.concat(inputs.map(() => Buffer.from([0xff, 0xff, 0xff, 0xff])));
  const hashSequence = sha256d(sequences);

  const txid = Buffer.from(inputs[inputIndex].txid, "hex").reverse();
  const vout = Buffer.alloc(4);
  vout.writeUInt32LE(inputs[inputIndex].vout, 0);
  const outpoint = Buffer.concat([txid, vout]);
  const scriptCodeWithLen = Buffer.concat([varInt(scriptCode.length), scriptCode]);
  const inputValue = writeLE64(inputs[inputIndex].value);
  const sequence = Buffer.from([0xff, 0xff, 0xff, 0xff]);

  const toScript = addressToScriptPubKey(toAddress);
  const changeScript = addressToScriptPubKey(changeAddress);
  const out1 = Buffer.concat([writeLE64(toSats), varInt(toScript.length), toScript]);
  const out2 = changeSats > BigInt(0)
    ? Buffer.concat([writeLE64(changeSats), varInt(changeScript.length), changeScript])
    : Buffer.alloc(0);
  const hashOutputs = sha256d(Buffer.concat([out1, out2]));

  return sha256d(Buffer.concat([
    version, hashPrevouts, hashSequence,
    outpoint, scriptCodeWithLen, inputValue, sequence,
    hashOutputs,
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from([0x01, 0x00, 0x00, 0x00]),
  ]));
}

// ── Bitcoin WalletProvider ────────────────────────────────────────────────────

export class BitcoinProvider implements WalletProvider {
  readonly chainId: ChainId = "bitcoin";
  readonly nativeAsset = "BTC";

  validateAddress(address: string): AddressValidationResult {
    const lower = address.toLowerCase();
    if (lower.startsWith("bc1q") || lower.startsWith("tb1q")) {
      return { valid: true, normalizedAddress: lower };
    }
    if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) {
      return { valid: true, normalizedAddress: address };
    }
    return { valid: false, error: "Unrecognized Bitcoin address" };
  }

  async buildTransaction(input: BuildTransactionInput): Promise<BuiltTransaction> {
    const rpc = getRpcClient("bitcoin");

    type ListUnspentResult = Array<{
      txid: string; vout: number; address: string;
      amount: number; confirmations: number; scriptPubKey: string;
    }>;
    const utxoList = await rpc.call<ListUnspentResult>("listunspent", [
      1, 9999999, [input.fromAddress],
    ]);

    const utxos: UTXO[] = utxoList.map((u) => ({
      txid: u.txid,
      vout: u.vout,
      value: BigInt(Math.round(u.amount * 1e8)),
      scriptPubKey: Buffer.from(u.scriptPubKey, "hex"),
      address: u.address,
      confirmations: u.confirmations,
    }));

    const targetSats = parseBtcAmount(input.amount);
    const feeEstimate = await this.estimateFee(input);
    const satsPerVByte = parseFloat(String(feeEstimate.details.satsPerVByte)) || 10;

    const selection = selectUTXOs(utxos, targetSats, satsPerVByte);
    if (!selection) {
      const available = utxos.reduce((a, u) => a + u.value, BigInt(0));
      throw new Error(`Insufficient BTC. Need ${targetSats}, available: ${available} sats`);
    }

    const unsignedTx = serializeUnsignedSegWit(
      selection.inputs, input.destinationAddress, targetSats,
      input.fromAddress, selection.change,
    );

    const hash160 = bech32DecodeWitness(input.fromAddress);
    const scriptCode = Buffer.concat([
      Buffer.from([0x76, 0xa9, 0x14]), hash160, Buffer.from([0x88, 0xac]),
    ]);

    const sigHash = computeP2WPKHSigHash(
      selection.inputs, 0,
      input.destinationAddress, targetSats,
      input.fromAddress, selection.change,
      scriptCode,
    );

    return {
      withdrawalId: input.withdrawalId,
      chainId: "bitcoin",
      unsignedTx,
      signingHash: sigHash,
      fromAddress: input.fromAddress,
      fee: (Number(selection.fee) / 1e8).toFixed(8),
      feeCurrency: "BTC",
      estimatedConfirmationSeconds: 600,
      utxos: selection.inputs,
    };
  }

  async applySignature(
    built: BuiltTransaction,
    signature: Buffer,
    publicKey: Buffer,
  ): Promise<SignedTransaction> {
    if (!built.utxos || built.utxos.length === 0) {
      throw new Error("Bitcoin: no UTXOs in built transaction");
    }
    const compressedPubKey = publicKey.length === 65 ? compressPublicKey(publicKey) : publicKey;
    // signature is 64-byte compact (r || s); convert to DER for Bitcoin witness
    const derEncoded = compactToDer(signature);
    const derSig = Buffer.concat([derEncoded, Buffer.from([0x01])]); // SIGHASH_ALL
    const witness = Buffer.concat([
      Buffer.from([0x02]), varInt(derSig.length), derSig,
      varInt(compressedPubKey.length), compressedPubKey,
    ]);
    const rawTx = appendWitness(built.unsignedTx, built.utxos.length, witness);
    return {
      withdrawalId: built.withdrawalId,
      chainId: "bitcoin",
      rawTx,
      txHash: computeBitcoinTxId(rawTx),
      signerAddress: built.fromAddress,
    };
  }

  computeTxHash(rawTx: Buffer): string {
    return computeBitcoinTxId(rawTx);
  }

  async estimateFee(_input: Omit<BuildTransactionInput, "feeConfig">): Promise<FeeEstimate> {
    return estimateFee("bitcoin", "normal");
  }

  async getConfirmationStatus(txHash: string): Promise<ConfirmationStatus> {
    const rpc = getRpcClient("bitcoin");
    try {
      type TxResult = { confirmations?: number; blockheight?: number };
      const tx = await rpc.call<TxResult>("getrawtransaction", [txHash, true]);
      const confs = tx.confirmations ?? 0;
      return {
        txHash, chainId: "bitcoin",
        confirmations: confs, required: 6,
        blockNumber: tx.blockheight ? BigInt(tx.blockheight) : undefined,
        status: confs === 0 ? "pending" : confs < 3 ? "included" : confs < 6 ? "safe" : "finalized",
        isComplete: confs >= 6,
      };
    } catch {
      return { txHash, chainId: "bitcoin", confirmations: 0, required: 6, status: "unknown", isComplete: false };
    }
  }

  requiredConfirmations(speed: FeeSpeed): number {
    return speed === "priority" || speed === "fast" ? 3 : 6;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function compactToDer(compact: Buffer): Buffer {
  // compact: 32 bytes r || 32 bytes s
  let r = compact.slice(0, 32);
  let s = compact.slice(32, 64);
  // Strip leading zeros but keep at least 1 byte
  while (r.length > 1 && r[0] === 0) r = r.slice(1);
  while (s.length > 1 && s[0] === 0) s = s.slice(1);
  // Add 0x00 prefix if high bit set (would make it negative in DER)
  if (r[0] & 0x80) r = Buffer.concat([Buffer.from([0x00]), r]);
  if (s[0] & 0x80) s = Buffer.concat([Buffer.from([0x00]), s]);
  const rInt = Buffer.concat([Buffer.from([0x02, r.length]), r]);
  const sInt = Buffer.concat([Buffer.from([0x02, s.length]), s]);
  const seq = Buffer.concat([rInt, sInt]);
  return Buffer.concat([Buffer.from([0x30, seq.length]), seq]);
}

function parseBtcAmount(amount: string): bigint {
  if (amount.includes(".")) return BigInt(Math.round(parseFloat(amount) * 1e8));
  return BigInt(amount);
}

function compressPublicKey(uncompressed: Buffer): Buffer {
  const x = uncompressed.slice(1, 33);
  const y = uncompressed.slice(33, 65);
  return Buffer.concat([Buffer.from([y[31] % 2 === 0 ? 0x02 : 0x03]), x]);
}

function appendWitness(unsignedTx: Buffer, inputCount: number, witness: Buffer): Buffer {
  const body = unsignedTx.slice(0, -4);
  const locktime = unsignedTx.slice(-4);
  const witnesses = Buffer.concat(
    Array.from({ length: inputCount }, (_, i) => i === 0 ? witness : Buffer.from([0x00])),
  );
  return Buffer.concat([body, witnesses, locktime]);
}

function computeBitcoinTxId(rawTx: Buffer): string {
  const hash = createHash("sha256").update(
    createHash("sha256").update(rawTx).digest(),
  ).digest();
  return Buffer.from(hash).reverse().toString("hex");
}
