// HSM Types — Phase 39
// Hardware Security Module abstraction layer.
// All HSM-specific logic lives only in the provider adapter, not in callers.

import type { ChainId } from "../types";

export type HsmKeyType = "secp256k1" | "ed25519" | "rsa-2048" | "aes-256";

export type HsmKeyHandle = {
  readonly id: string;          // HSM-internal key identifier (label or slot)
  readonly type: HsmKeyType;
  readonly chainId?: ChainId;   // if chain-specific
  readonly createdAt: Date;
};

export type HsmSignRequest = {
  keyHandle: HsmKeyHandle;
  data: Buffer;                 // bytes to sign (already hashed where required)
  algorithm: "ECDSA_SHA256" | "EDDSA" | "ECDSA_KECCAK256";
};

export type HsmSignResponse = {
  signature: Buffer;            // compact 64 bytes (r||s for ECDSA, 64 bytes for EdDSA)
  keyId: string;
  timestamp: Date;
};

export type HsmStatus = "connected" | "degraded" | "offline";

export type HsmHealth = {
  status: HsmStatus;
  provider: string;
  keyCount: number;
  lastCheckAt: Date;
  errorMessage?: string;
};

// ── HSM Provider Interface ────────────────────────────────────────────────────

export interface HsmProvider {
  readonly name: string;

  /** Test connectivity and return health status */
  healthCheck(): Promise<HsmHealth>;

  /** List all key handles this HSM manages */
  listKeys(): Promise<HsmKeyHandle[]>;

  /** Get a specific key handle by chain */
  getKey(chainId: ChainId): Promise<HsmKeyHandle | null>;

  /** Get the public key bytes for a key handle */
  getPublicKey(handle: HsmKeyHandle): Promise<Buffer>;

  /**
   * Sign data using the specified key.
   * The HSM MUST NOT expose private key material.
   * Returns compact 64-byte signature.
   */
  sign(request: HsmSignRequest): Promise<HsmSignResponse>;

  /**
   * Derive address from a key handle.
   * Calls getPublicKey() and applies chain-specific address derivation.
   */
  getAddress(handle: HsmKeyHandle): Promise<string>;
}
