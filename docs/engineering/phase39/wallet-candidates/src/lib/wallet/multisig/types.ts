// Multi-Signature Types — Phase 39

import type { ChainId } from "../types";

export type MultisigScheme = "2-of-3" | "3-of-5" | "1-of-1";

export type MultisigPolicy = {
  id: string;
  chainId: ChainId;
  scheme: MultisigScheme;
  requiredSignatures: number;
  totalKeys: number;
  publicKeys: string[];          // hex-encoded compressed public keys, BIP-67 sorted
  maxDelaySeconds: number;       // max time to collect all sigs
  expiresAt?: Date;              // policy expiry
  createdAt: Date;
  rotationGeneration: number;    // incremented on key rotation
};

export type MultisigTransaction = {
  policyId: string;
  chainId: ChainId;
  signingHash: Buffer;
  signatures: Array<{ publicKey: string; signature: Buffer }>;
  threshold: number;
  state: "pending" | "threshold_met" | "broadcast" | "failed" | "expired";
  createdAt: Date;
  expiresAt: Date;
};

// Bitcoin-specific
export type P2WSHMultisig = {
  redeemScript: Buffer;   // OP_M <pk1>...<pkN> OP_N OP_CHECKMULTISIG
  witnessScript: Buffer;  // same as redeemScript for P2WSH
  address: string;        // bech32 P2WSH address
  scriptHash: Buffer;     // SHA256(redeemScript) → 32 bytes
};

// Ethereum Safe-compatible
export type SafeTransaction = {
  to: string;
  value: bigint;
  data: Buffer;
  operation: 0 | 1;         // 0=CALL, 1=DELEGATECALL
  safeTxGas: bigint;
  baseGas: bigint;
  gasPrice: bigint;
  gasToken: string;
  refundReceiver: string;
  nonce: bigint;
  // For signature collection
  domainSeparator: Buffer;
  safeTxHash: Buffer;       // EIP-712 typed data hash
};

export type SafeSignature = {
  signer: string;           // ethereum address
  data: Buffer;             // 65-byte ECDSA sig (v, r, s)
  dynamic: boolean;
};
