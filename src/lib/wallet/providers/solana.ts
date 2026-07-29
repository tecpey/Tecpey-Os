// Solana Provider — Phase 38
// System Program transfer. Ed25519 signing via Node.js crypto.
// Blockhash management: fetched from RPC, cached 60s.

import type {
  AddressValidationResult,
  BuildTransactionInput,
  BuiltTransaction,
  ChainId,
  ConfirmationStatus,
  FeeEstimate,
  FeeSpeed,
  SignedTransaction,
  WalletProvider,
} from "../types";
import { getRpcClient } from "../rpc/client";
import { estimateFee } from "../fee/engine";

// ── Base58 ────────────────────────────────────────────────────────────────────

const B58_ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(buf: Buffer): string {
  let n = BigInt("0x" + buf.toString("hex"));
  let result = "";
  while (n > BigInt(0)) {
    result = B58_ALPHA[Number(n % BigInt(58))] + result;
    n = n / BigInt(58);
  }
  for (const byte of buf) {
    if (byte !== 0) break;
    result = "1" + result;
  }
  return result;
}

function base58Decode(input: string): Buffer {
  const map = new Uint8Array(256).fill(255);
  for (let i = 0; i < B58_ALPHA.length; i++) map[B58_ALPHA.charCodeAt(i)] = i;
  let n = BigInt(0);
  for (const c of input) {
    const v = map[c.charCodeAt(0)];
    if (v === 255) throw new Error(`Invalid base58: ${c}`);
    n = n * BigInt(58) + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > BigInt(0)) { bytes.unshift(Number(n & BigInt(0xff))); n >>= BigInt(8); }
  let leading = 0;
  for (const c of input) { if (c !== "1") break; leading++; }
  return Buffer.from([...new Uint8Array(leading), ...bytes]);
}

// ── Compact-u16 ───────────────────────────────────────────────────────────────

function compactU16(n: number): Buffer {
  if (n < 128) return Buffer.from([n]);
  if (n < 16384) return Buffer.from([(n & 0x7f) | 0x80, n >> 7]);
  return Buffer.from([(n & 0x7f) | 0x80, ((n >> 7) & 0x7f) | 0x80, n >> 14]);
}

// ── Solana System Program transfer instruction ────────────────────────────────

const SYSTEM_PROGRAM = Buffer.alloc(32);

function buildSystemTransfer(lamports: bigint): Buffer {
  const data = Buffer.alloc(12);
  data.writeUInt32LE(2, 0); // Transfer instruction
  const lo = Number(lamports & BigInt(0xffffffff));
  const hi = Number(lamports >> BigInt(32));
  data.writeUInt32LE(lo, 4);
  data.writeUInt32LE(hi, 8);
  return data;
}

// ── Blockhash Cache ───────────────────────────────────────────────────────────

let cachedBlockhash: { value: string; expiresAt: number } | null = null;

async function getRecentBlockhash(): Promise<string> {
  const now = Date.now();
  if (cachedBlockhash && now < cachedBlockhash.expiresAt) return cachedBlockhash.value;
  const rpc = getRpcClient("solana");
  type BlockhashResult = { value: { blockhash: string } };
  const result = await rpc.call<BlockhashResult>("getLatestBlockhash", [{ commitment: "finalized" }]);
  cachedBlockhash = { value: result.value.blockhash, expiresAt: now + 60_000 };
  return result.value.blockhash;
}

// ── Solana Provider ───────────────────────────────────────────────────────────

export class SolanaProvider implements WalletProvider {
  readonly chainId: ChainId = "solana";
  readonly nativeAsset = "SOL";

  validateAddress(address: string): AddressValidationResult {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      return { valid: false, error: "Invalid Solana address format" };
    }
    try {
      const decoded = base58Decode(address);
      if (decoded.length !== 32) return { valid: false, error: `Expected 32 bytes, got ${decoded.length}` };
      return { valid: true, normalizedAddress: address, type: "ed25519" };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : "Invalid" };
    }
  }

  async buildTransaction(input: BuildTransactionInput): Promise<BuiltTransaction> {
    const blockhash = await getRecentBlockhash();
    const blockhashBytes = base58Decode(blockhash);

    const fromPubkey = base58Decode(input.fromAddress);
    const toPubkey = base58Decode(input.destinationAddress);
    const lamports = parseSolAmount(input.amount);
    const data = buildSystemTransfer(lamports);

    const accounts = [fromPubkey, toPubkey, SYSTEM_PROGRAM];
    const header = Buffer.from([1, 0, 1]); // [numSigners, numReadonlySigned, numReadonlyUnsigned]

    const instruction = Buffer.concat([
      Buffer.from([2]),         // programIdIndex = 2 (system program)
      compactU16(2),            // 2 accounts
      Buffer.from([0, 1]),      // account indices: from(0), to(1)
      compactU16(data.length),
      data,
    ]);

    const message = Buffer.concat([
      header,
      compactU16(accounts.length),
      ...accounts,
      blockhashBytes,
      compactU16(1),
      instruction,
    ]);

    return {
      withdrawalId: input.withdrawalId,
      chainId: "solana",
      unsignedTx: message,
      signingHash: message,
      fromAddress: input.fromAddress,
      fee: "0.000005",
      feeCurrency: "SOL",
      estimatedConfirmationSeconds: 30,
    };
  }

  async applySignature(
    built: BuiltTransaction,
    signature: Buffer,
    _publicKey: Buffer,
  ): Promise<SignedTransaction> {
    const sig64 = signature.length >= 64 ? signature.slice(0, 64) : signature;
    const rawTx = Buffer.concat([compactU16(1), sig64, built.unsignedTx]);
    const txHash = base58Encode(sig64);

    return {
      withdrawalId: built.withdrawalId,
      chainId: "solana",
      rawTx,
      txHash,
      signerAddress: built.fromAddress,
    };
  }

  computeTxHash(rawTx: Buffer): string {
    return base58Encode(rawTx.slice(1, 65));
  }

  async estimateFee(_input: Omit<BuildTransactionInput, "feeConfig">): Promise<FeeEstimate> {
    return estimateFee("solana", "normal");
  }

  async getConfirmationStatus(txHash: string): Promise<ConfirmationStatus> {
    const rpc = getRpcClient("solana");
    try {
      type SigStatusResult = {
        value: Array<{ confirmationStatus?: string; slot?: number; err?: unknown } | null>;
      };
      const result = await rpc.call<SigStatusResult>("getSignatureStatuses", [
        [txHash], { searchTransactionHistory: true },
      ]);
      const status = result.value[0];
      if (!status) {
        return { txHash, chainId: "solana", confirmations: 0, required: 32, status: "pending", isComplete: false };
      }
      const isFinalized = status.confirmationStatus === "finalized";
      const isFailed = !!status.err;
      return {
        txHash, chainId: "solana",
        confirmations: isFinalized ? 32 : 1, required: 32,
        blockNumber: status.slot ? BigInt(status.slot) : undefined,
        status: isFailed ? "dropped" : isFinalized ? "finalized" : "included",
        isComplete: isFinalized && !isFailed,
      };
    } catch {
      return { txHash, chainId: "solana", confirmations: 0, required: 32, status: "unknown", isComplete: false };
    }
  }

  requiredConfirmations(_speed: FeeSpeed): number {
    return 32;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseSolAmount(amount: string): bigint {
  if (amount.includes(".")) {
    const parts = amount.split(".");
    const whole = BigInt(parts[0]) * BigInt(1_000_000_000);
    const fraction = parts[1].padEnd(9, "0").slice(0, 9);
    return whole + BigInt(fraction);
  }
  return BigInt(amount);
}
