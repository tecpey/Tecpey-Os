// Wallet Engine Types — Phase 38
// All interfaces, types, and enums for the hot wallet disbursement engine.

// ── Chain Identifiers ─────────────────────────────────────────────────────────

export type ChainId =
  | "bitcoin"
  | "ethereum"
  | "bsc"
  | "polygon"
  | "tron"
  | "solana";

export type AssetId = string; // "BTC" | "ETH" | "USDT" | "SOL" etc.

// ── Withdrawal Execution States ───────────────────────────────────────────────

export type WithdrawalExecutionState =
  | "approved"
  | "building_transaction"
  | "signing"
  | "broadcasting"
  | "broadcasted"
  | "confirming"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

// ── Fee Configuration ─────────────────────────────────────────────────────────

export type FeeSpeed = "economy" | "normal" | "fast" | "priority";

export type FeeConfig = {
  speed: FeeSpeed;
  manualOverride?: {
    // Bitcoin: satoshis per vByte
    // Ethereum: maxFeePerGas + maxPriorityFeePerGas in Gwei
    // Solana: microLamports per compute unit
    value: string;
    unit: string;
  };
};

export type FeeEstimate = {
  chainId: ChainId;
  speed: FeeSpeed;
  networkFee: string;      // in native currency
  networkFeeUsd?: number;
  estimatedAt: Date;
  validForSeconds: number;
  // Chain-specific
  details: Record<string, string | number>;
};

// ── UTXO (Bitcoin) ────────────────────────────────────────────────────────────

export type UTXO = {
  txid: string;
  vout: number;
  value: bigint;           // in satoshis
  scriptPubKey: Buffer;
  address: string;
  confirmations: number;
};

export type UTXOSelection = {
  inputs: UTXO[];
  totalInput: bigint;      // satoshis
  fee: bigint;             // satoshis
  change: bigint;          // satoshis (0 if no change output)
};

// ── Transaction Building ──────────────────────────────────────────────────────

export type BuildTransactionInput = {
  withdrawalId: string;
  chainId: ChainId;
  asset: AssetId;
  amount: string;          // in native units (e.g., "0.01" BTC or "1000000" sats)
  destinationAddress: string;
  feeConfig: FeeConfig;
  fromAddress: string;
  // Chain-specific
  nonce?: number;          // Ethereum
  memo?: string;           // Solana/Ripple/Tron
  tokenContract?: string;  // ERC-20/TRC-20 contract address
};

export type BuiltTransaction = {
  withdrawalId: string;
  chainId: ChainId;
  // Unsigned transaction data
  unsignedTx: Buffer;
  // Signing request
  signingHash: Buffer;     // The exact bytes to sign
  fromAddress: string;
  // Metadata
  fee: string;
  feeCurrency: string;
  estimatedConfirmationSeconds: number;
  // Chain-specific fields
  nonce?: number;          // Ethereum: for idempotency check
  utxos?: UTXO[];          // Bitcoin: selected inputs
};

// ── Signing ───────────────────────────────────────────────────────────────────

export type SignedTransaction = {
  withdrawalId: string;
  chainId: ChainId;
  rawTx: Buffer;           // Fully signed, ready-to-broadcast
  txHash: string;          // Expected tx hash (before broadcast)
  signerAddress: string;
};

export type KeyStoreType = "hot_wallet" | "hsm" | "mpc" | "ledger";

export interface KeyStore {
  readonly type: KeyStoreType;
  /** Returns the public address for a given path/asset */
  getAddress(chainId: ChainId, index?: number): Promise<string>;
  /**
   * Sign exactly the bytes in signingHash.
   * MUST zero the private key from memory immediately after signing.
   * MUST never log or serialize the private key.
   */
  sign(chainId: ChainId, signingHash: Buffer, index?: number): Promise<Buffer>;
  /** Verify this keystore is properly configured */
  isConfigured(chainId: ChainId): boolean;
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

export type BroadcastResult = {
  txHash: string;
  broadcastedAt: Date;
  rpcEndpoint: string;
  attempts: number;
};

// ── Confirmation ──────────────────────────────────────────────────────────────

export type ConfirmationStatus = {
  txHash: string;
  chainId: ChainId;
  confirmations: number;
  required: number;
  blockNumber?: bigint;
  status: "pending" | "included" | "safe" | "finalized" | "dropped" | "unknown";
  isComplete: boolean;
};

// ── Wallet Provider Interface ─────────────────────────────────────────────────

export interface WalletProvider {
  readonly chainId: ChainId;
  readonly nativeAsset: AssetId;

  /** Validate an address for this chain. Throws on invalid. */
  validateAddress(address: string): AddressValidationResult;

  /** Build an unsigned transaction */
  buildTransaction(input: BuildTransactionInput): Promise<BuiltTransaction>;

  /** Apply a signature to a built transaction to produce a signed tx */
  applySignature(built: BuiltTransaction, signature: Buffer, publicKey: Buffer): Promise<SignedTransaction>;

  /** Compute expected tx hash from a signed transaction */
  computeTxHash(rawTx: Buffer): string;

  /** Estimate fee for a given operation */
  estimateFee(input: Omit<BuildTransactionInput, "feeConfig">): Promise<FeeEstimate>;

  /** Get current confirmation status */
  getConfirmationStatus(txHash: string): Promise<ConfirmationStatus>;

  /** Required confirmations for this chain at given speed */
  requiredConfirmations(speed: FeeSpeed): number;
}

// ── Address Validation ────────────────────────────────────────────────────────

export type AddressValidationResult = {
  valid: boolean;
  normalizedAddress?: string; // checksummed or canonical form
  network?: string;
  type?: string;              // "p2wpkh" | "p2pkh" | "p2sh" | "evm" | "spl" etc.
  error?: string;
};

// ── RPC Client ────────────────────────────────────────────────────────────────

export type RpcMethod = "GET" | "POST";

export type RpcResponse<T = unknown> = {
  ok: boolean;
  result?: T;
  error?: string;
  endpoint: string;
  latencyMs: number;
};

// ── Queue ─────────────────────────────────────────────────────────────────────

export type WithdrawalJobData = {
  withdrawalId: string;
  chainId: ChainId;
  asset: AssetId;
  amount: string;
  amountUsd: number;
  destinationAddress: string;
  feeSpeed: FeeSpeed;
  enqueuedAt: string;
  priority: number;         // 1=low, 5=normal, 10=high
};

export type ConfirmationJobData = {
  withdrawalId: string;
  txHash: string;
  chainId: ChainId;
  requiredConfirmations: number;
  broadcastedAt: string;
  timeoutAt: string;        // ISO string — job expires after this
};

// ── Observability ─────────────────────────────────────────────────────────────

export type WalletMetricKey =
  | "withdraw_build_ms"
  | "withdraw_sign_ms"
  | "withdraw_broadcast_ms"
  | "confirmation_latency_ms"
  | "rpc_failures"
  | "rebroadcast_count"
  | "wallet_low_balance"
  | "idempotency_duplicate_blocked"
  | "tx_dropped_detected";
