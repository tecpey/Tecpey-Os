// Ethereum Provider — Phase 38
// EIP-1559 transaction building with RLP encoding.
// Supports native ETH and ERC-20 token transfers.
// Nonce: managed via Redis cache to prevent reuse.

import { createHash } from "crypto";
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
import { estimateFee, getEthereumGasForTransfer } from "../fee/engine";
import { validateAddress } from "../address/validator";

// ── RLP Encoding ──────────────────────────────────────────────────────────────

function rlpEncodeLength(len: number, offset: number): Buffer {
  if (len < 56) return Buffer.from([offset + len]);
  const lenHex = len.toString(16);
  const lenBytes = Buffer.from(lenHex.length % 2 === 0 ? lenHex : "0" + lenHex, "hex");
  return Buffer.from([offset + 55 + lenBytes.length, ...lenBytes]);
}

function rlpEncodeItem(item: Buffer): Buffer {
  if (item.length === 1 && item[0] < 0x80) return item;
  return Buffer.concat([rlpEncodeLength(item.length, 0x80), item]);
}

function rlpEncodeList(items: Buffer[]): Buffer {
  const encoded = Buffer.concat(items.map(rlpEncodeItem));
  return Buffer.concat([rlpEncodeLength(encoded.length, 0xc0), encoded]);
}

function bigintToMinBytes(n: bigint): Buffer {
  if (n === BigInt(0)) return Buffer.alloc(0);
  const hex = n.toString(16);
  return Buffer.from(hex.length % 2 === 0 ? hex : "0" + hex, "hex");
}

function numberToBuffer(n: number): Buffer {
  return bigintToMinBytes(BigInt(n));
}

// ── ERC-20 ABI ────────────────────────────────────────────────────────────────

const ERC20_TRANSFER_SELECTOR = Buffer.from("a9059cbb", "hex");

function encodeErc20Transfer(to: string, amount: bigint): Buffer {
  const addressPadded = Buffer.alloc(32);
  const addrBytes = Buffer.from(to.replace("0x", ""), "hex");
  addrBytes.copy(addressPadded, 32 - addrBytes.length);

  const amountHex = amount.toString(16);
  const amountPadded = Buffer.alloc(32);
  Buffer.from(amountHex.length % 2 === 0 ? amountHex : "0" + amountHex, "hex")
    .copy(amountPadded, 32 - Math.ceil(amountHex.length / 2));

  return Buffer.concat([ERC20_TRANSFER_SELECTOR, addressPadded, amountPadded]);
}

// ── Nonce Management ──────────────────────────────────────────────────────────

function getRedisClient() {
  return (globalThis as Record<string, unknown>).tecpeyRedisClient as {
    get(key: string): Promise<string | null>;
    set(key: string, value: string | number, mode?: string, ttl?: number): Promise<unknown>;
  } | null ?? null;
}

async function getNextNonce(address: string, chainId: ChainId): Promise<number> {
  const redis = getRedisClient();
  const key = `wallet:nonce:${chainId}:${address.toLowerCase()}`;

  if (redis) {
    const cached = await redis.get(key);
    if (cached !== null) {
      const next = parseInt(cached) + 1;
      await redis.set(key, next, "EX", 300);
      return next;
    }
  }

  const rpc = getRpcClient(chainId);
  const onChainNonce = await rpc.call<string>("eth_getTransactionCount", [address, "pending"]);
  const nonce = parseInt(onChainNonce, 16);

  if (redis) await redis.set(key, nonce, "EX", 300);
  return nonce;
}

async function saveNonce(address: string, chainId: ChainId, nonce: number): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  const key = `wallet:nonce:${chainId}:${address.toLowerCase()}`;
  await redis.set(key, nonce, "EX", 300);
}

// ── EIP-1559 Transaction ──────────────────────────────────────────────────────

const CHAIN_IDS: Record<ChainId, number> = {
  ethereum: 1, bsc: 56, polygon: 137, tron: 1, bitcoin: 1, solana: 1,
};

async function buildEip1559Tx(
  to: string,
  value: bigint,
  data: Buffer,
  chainId: ChainId,
  nonce: number,
  gasLimit: bigint,
  maxFeePerGasWei: bigint,
  maxPriorityFeePerGasWei: bigint,
): Promise<Buffer> {
  const chainIdNum = CHAIN_IDS[chainId] ?? 1;

  const fields = [
    bigintToMinBytes(BigInt(chainIdNum)),
    numberToBuffer(nonce),
    bigintToMinBytes(maxPriorityFeePerGasWei),
    bigintToMinBytes(maxFeePerGasWei),
    bigintToMinBytes(gasLimit),
    Buffer.from(to.replace("0x", ""), "hex"),
    bigintToMinBytes(value),
    data,
  ];

  const accessListRlp = Buffer.from([0xc0]);

  const encoded = rlpEncodeList([
    ...fields.map(rlpEncodeItem),
    accessListRlp,
  ]);

  return Buffer.concat([Buffer.from([0x02]), encoded]);
}

// ── Keccak-256 ────────────────────────────────────────────────────────────────

async function keccak256(buf: Buffer): Promise<Buffer> {
  const { keccak_256 } = await import("@noble/hashes/sha3.js");
  return Buffer.from(keccak_256(buf));
}

// ── Ethereum Provider ─────────────────────────────────────────────────────────

export class EthereumProvider implements WalletProvider {
  readonly chainId: ChainId;
  readonly nativeAsset: string;

  constructor(chainId: ChainId = "ethereum") {
    this.chainId = chainId;
    this.nativeAsset = chainId === "bsc" ? "BNB" : chainId === "polygon" ? "MATIC" : "ETH";
  }

  validateAddress(address: string): AddressValidationResult {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return { valid: false, error: "Invalid EVM address (must be 0x + 40 hex)" };
    }
    return { valid: true, normalizedAddress: address };
  }

  async buildTransaction(input: BuildTransactionInput): Promise<BuiltTransaction> {
    const validation = await validateAddress(input.destinationAddress, this.chainId);
    if (!validation.valid) {
      throw new Error(`Invalid destination address: ${validation.error}`);
    }

    const amountWei = parseEthAmount(input.amount, input.tokenContract);
    const data = input.tokenContract
      ? encodeErc20Transfer(input.destinationAddress, amountWei)
      : Buffer.alloc(0);
    const toAddress = input.tokenContract ?? input.destinationAddress;

    const nonce = input.nonce ?? await getNextNonce(input.fromAddress, this.chainId);
    const gasLimit = getEthereumGasForTransfer(input.tokenContract);

    const feeEstimate = await estimateFee(this.chainId, input.feeConfig?.speed ?? "normal");
    const baseFeeGwei = BigInt(feeEstimate.details.baseFeeGwei ?? "15");
    const priorityGwei = BigInt(feeEstimate.details.maxPriorityFeeGwei ?? "2");
    const maxFeeWei = (baseFeeGwei * BigInt(2) + priorityGwei) * BigInt(1_000_000_000);
    const maxPriorityWei = priorityGwei * BigInt(1_000_000_000);

    const unsignedTx = await buildEip1559Tx(
      toAddress,
      input.tokenContract ? BigInt(0) : amountWei,
      data, this.chainId, nonce, gasLimit, maxFeeWei, maxPriorityWei,
    );

    const signingHash = await keccak256(unsignedTx);
    const networkFeeWei = maxFeeWei * gasLimit;
    const networkFeeEth = (Number(networkFeeWei) / 1e18).toFixed(8);

    await saveNonce(input.fromAddress, this.chainId, nonce);

    return {
      withdrawalId: input.withdrawalId,
      chainId: this.chainId,
      unsignedTx,
      signingHash,
      fromAddress: input.fromAddress,
      fee: networkFeeEth,
      feeCurrency: this.nativeAsset,
      estimatedConfirmationSeconds: 15,
      nonce,
    };
  }

  async applySignature(
    built: BuiltTransaction,
    signature: Buffer,
    _publicKey: Buffer,
  ): Promise<SignedTransaction> {
    const { r, s, v } = parseDerSignature(signature);
    const signedRlp = appendEip1559Signature(built.unsignedTx.slice(1), v, r, s);
    const rawTx = Buffer.concat([Buffer.from([0x02]), signedRlp]);
    const txHash = "0x" + (await keccak256(rawTx)).toString("hex");

    return {
      withdrawalId: built.withdrawalId,
      chainId: built.chainId,
      rawTx,
      txHash,
      signerAddress: built.fromAddress,
    };
  }

  computeTxHash(rawTx: Buffer): string {
    return "0x" + createHash("sha256").update(rawTx).digest("hex");
  }

  async estimateFee(_input: Omit<BuildTransactionInput, "feeConfig">): Promise<FeeEstimate> {
    return estimateFee(this.chainId, "normal");
  }

  async getConfirmationStatus(txHash: string): Promise<ConfirmationStatus> {
    const rpc = getRpcClient(this.chainId);
    try {
      type TxReceiptResult = { blockNumber?: string; status?: string };
      const receipt = await rpc.call<TxReceiptResult | null>("eth_getTransactionReceipt", [txHash]);
      if (!receipt) {
        return { txHash, chainId: this.chainId, confirmations: 0, required: 12, status: "pending", isComplete: false };
      }

      const txBlockNum = parseInt(receipt.blockNumber ?? "0x0", 16);
      type BlockResult = { number: string };
      const latest = await rpc.call<BlockResult>("eth_getBlockByNumber", ["finalized", false]);
      const finalizedBlock = parseInt(latest?.number ?? "0x0", 16);
      const confirmations = Math.max(0, finalizedBlock - txBlockNum + 1);
      const failed = receipt.status === "0x0";

      return {
        txHash, chainId: this.chainId,
        confirmations, required: 12,
        blockNumber: BigInt(txBlockNum),
        status: failed ? "dropped" : confirmations >= 12 ? "finalized" : confirmations > 0 ? "included" : "pending",
        isComplete: !failed && confirmations >= 12,
      };
    } catch {
      return { txHash, chainId: this.chainId, confirmations: 0, required: 12, status: "unknown", isComplete: false };
    }
  }

  requiredConfirmations(_speed: FeeSpeed): number {
    return this.chainId === "polygon" ? 256 : 12;
  }
}

// ── Signature Helpers ─────────────────────────────────────────────────────────

function parseDerSignature(sig: Buffer): { r: Buffer; s: Buffer; v: number } {
  // sig is compact 64-byte (r || s) from keystore
  if (sig.length === 64) {
    return { r: sig.slice(0, 32), s: sig.slice(32, 64), v: 0 };
  }
  // Fallback: try DER parsing
  let offset = 2;
  offset++;
  const rLen = sig[offset++];
  const r = sig.slice(offset, offset + rLen);
  offset += rLen;
  offset++;
  const sLen = sig[offset++];
  const s = sig.slice(offset, offset + sLen);
  const rPadded = Buffer.alloc(32);
  const sPadded = Buffer.alloc(32);
  r.slice(-32).copy(rPadded, Math.max(0, 32 - r.length));
  s.slice(-32).copy(sPadded, Math.max(0, 32 - s.length));
  return { r: rPadded, s: sPadded, v: 0 };
}

function appendEip1559Signature(unsignedRlp: Buffer, v: number, r: Buffer, s: Buffer): Buffer {
  const items = rlpDecodeList(unsignedRlp);
  const vBuf = v === 0 ? Buffer.alloc(0) : Buffer.from([v]);
  items.push(rlpEncodeItem(vBuf));
  items.push(rlpEncodeItem(r));
  items.push(rlpEncodeItem(s));
  return rlpEncodeListRaw(items);
}

function rlpDecodeList(buf: Buffer): Buffer[] {
  let offset = 0;
  const firstByte = buf[0];
  if (firstByte >= 0xf8) { offset = 1 + (firstByte - 0xf7); }
  else if (firstByte >= 0xc0) { offset = 1; }
  const items: Buffer[] = [];
  while (offset < buf.length) {
    const [item, nextOffset] = rlpDecodeItem(buf, offset);
    items.push(item);
    offset = nextOffset;
  }
  return items;
}

function rlpDecodeItem(buf: Buffer, offset: number): [Buffer, number] {
  const firstByte = buf[offset];
  if (firstByte < 0x80) return [buf.slice(offset, offset + 1), offset + 1];
  if (firstByte < 0xb8) {
    const len = firstByte - 0x80;
    return [buf.slice(offset + 1, offset + 1 + len), offset + 1 + len];
  }
  if (firstByte < 0xc0) {
    const lenOfLen = firstByte - 0xb7;
    const len = parseInt(buf.slice(offset + 1, offset + 1 + lenOfLen).toString("hex"), 16);
    return [buf.slice(offset + 1 + lenOfLen, offset + 1 + lenOfLen + len), offset + 1 + lenOfLen + len];
  }
  if (firstByte < 0xf8) {
    const len = firstByte - 0xc0;
    return [buf.slice(offset, offset + 1 + len), offset + 1 + len];
  }
  const lenOfLen = firstByte - 0xf7;
  const len = parseInt(buf.slice(offset + 1, offset + 1 + lenOfLen).toString("hex"), 16);
  return [buf.slice(offset, offset + 1 + lenOfLen + len), offset + 1 + lenOfLen + len];
}

function rlpEncodeListRaw(encodedItems: Buffer[]): Buffer {
  const payload = Buffer.concat(encodedItems);
  return Buffer.concat([rlpEncodeLength(payload.length, 0xc0), payload]);
}

// ── Amount Parsing ────────────────────────────────────────────────────────────

function parseEthAmount(amount: string, tokenContract?: string): bigint {
  if (tokenContract) return BigInt(amount);
  if (amount.includes(".")) {
    const parts = amount.split(".");
    const whole = BigInt(parts[0]) * BigInt("1000000000000000000");
    const fraction = parts[1].padEnd(18, "0").slice(0, 18);
    return whole + BigInt(fraction);
  }
  return BigInt(amount);
}

// ── EVM Variants ──────────────────────────────────────────────────────────────

export class BscProvider extends EthereumProvider {
  constructor() { super("bsc"); }
}

export class PolygonProvider extends EthereumProvider {
  constructor() { super("polygon"); }
}

export class TronProvider extends EthereumProvider {
  constructor() { super("tron"); }
}
