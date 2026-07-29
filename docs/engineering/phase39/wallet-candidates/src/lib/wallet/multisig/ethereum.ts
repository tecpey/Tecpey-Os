// Ethereum Safe-compatible Multisig Abstraction — Phase 39
// Models off-chain signature collection for Safe (Gnosis Safe) transactions.
// Does NOT deploy contracts. Implements the EIP-712 signature flow only.

import { createHash } from "crypto";
import type { SafeSignature, SafeTransaction } from "./types";

// ── EIP-712 Domain ────────────────────────────────────────────────────────────

const SAFE_TX_TYPEHASH = Buffer.from(
  // keccak256("SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)")
  "bb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d",
  "hex",
);

/**
 * Build the EIP-712 domain separator.
 * chainId is the EVM chain ID (1=mainnet, 56=BSC, 137=Polygon, etc.)
 */
export function buildSafeDomainSeparator(safeAddress: string, chainId: number): Buffer {
  const DOMAIN_TYPEHASH = keccak256(
    Buffer.from("EIP712Domain(uint256 chainId,address verifyingContract)"),
  );
  const encoded = Buffer.concat([
    DOMAIN_TYPEHASH,
    uint256(BigInt(chainId)),
    address(safeAddress),
  ]);
  return keccak256(encoded);
}

/**
 * Build the SafeTx hash (what each signer actually signs).
 */
export function buildSafeTxHash(tx: SafeTransaction): Buffer {
  const structHash = keccak256(
    Buffer.concat([
      SAFE_TX_TYPEHASH,
      address(tx.to),
      uint256(tx.value),
      keccak256(tx.data),
      uint8(tx.operation),
      uint256(tx.safeTxGas),
      uint256(tx.baseGas),
      uint256(tx.gasPrice),
      address(tx.gasToken),
      address(tx.refundReceiver),
      uint256(tx.nonce),
    ]),
  );

  return keccak256(
    Buffer.concat([
      Buffer.from([0x19, 0x01]),
      tx.domainSeparator,
      structHash,
    ]),
  );
}

/**
 * Collect and sort Safe signatures.
 * Safe requires signatures sorted by signer address (ascending).
 */
export function encodeSafeSignatures(signatures: SafeSignature[]): Buffer {
  const sorted = [...signatures].sort((a, b) =>
    a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()),
  );
  return Buffer.concat(sorted.map((s) => s.data));
}

export function isSafeThresholdMet(
  signatures: SafeSignature[],
  threshold: number,
): boolean {
  return signatures.length >= threshold;
}

// ── ABI Encoding Helpers ──────────────────────────────────────────────────────

function keccak256(data: Buffer): Buffer {
  // Use Node.js crypto — no external dependency needed for SHA3 here
  // (keccak is not SHA3-256 but Ethereum's keccak; use @noble/hashes imported lazily)
  // For domain/structHash, we use the synchronous import pattern
  const { keccak_256 } = require("@noble/hashes/sha3.js");
  return Buffer.from(keccak_256(data));
}

function uint256(n: bigint): Buffer {
  const hex = n.toString(16).padStart(64, "0");
  return Buffer.from(hex, "hex");
}

function uint8(n: number): Buffer {
  return Buffer.from(n.toString(16).padStart(64, "0"), "hex");
}

function address(addr: string): Buffer {
  const cleaned = addr.replace("0x", "").padStart(64, "0");
  return Buffer.from(cleaned, "hex");
}
