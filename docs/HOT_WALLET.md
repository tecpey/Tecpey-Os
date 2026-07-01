# Hot Wallet & Disbursement Engine — Phase 38

> Enterprise-grade blockchain withdrawal execution: build → sign → broadcast → confirm.

---

## Overview

Phase 38 implements the on-chain disbursement layer for TecPey withdrawals. After a withdrawal is approved (via admin action in Phase 37), the hot wallet engine executes it on-chain in six stages:

```
approved → building_transaction → signing → broadcasting → broadcasted → confirming → completed
```

---

## Architecture

```
WithdrawalService (Phase 37)
    ↓ admin approves
BullMQ Queue (withdrawal)
    ↓ dequeue
WithdrawalExecutor
    ├── 1. Build Transaction (WalletProvider)
    ├── 2. Sign (KeyStore)
    ├── 3. Broadcast (RPC Client)
    └── 4. Enqueue Confirmation Watch
           ↓
BullMQ Queue (withdrawal:confirmation)
    ↓ poll every 30s
ConfirmationEngine
    └── markWithdrawalCompleted / markWithdrawalTimeout
```

---

## Chain Support

| Chain    | Standard | Native Asset | Signing    | Confirmations |
|----------|----------|-------------|------------|---------------|
| Bitcoin  | P2WPKH   | BTC         | secp256k1  | 6 blocks (~1h)|
| Ethereum | EIP-1559 | ETH / ERC-20| secp256k1  | 12 ("finalized")|
| BSC      | EIP-1559 | BNB / BEP-20| secp256k1  | 12 blocks     |
| Polygon  | EIP-1559 | MATIC       | secp256k1  | 256 blocks    |
| Tron     | EVM-compat| TRX / TRC-20| secp256k1 | 12 blocks     |
| Solana   | System Prog| SOL / SPL  | Ed25519    | "finalized" (~30s)|

---

## Components

### Address Validator (`src/lib/wallet/address/`)
Pure validation for all 6 chains. No external dependencies.
- Bitcoin: Bech32 (P2WPKH/P2WSH) + Base58Check (P2PKH/P2SH)
- Ethereum/EVM: EIP-55 checksum via keccak256
- Tron: Base58Check with 0x41 prefix
- Solana: Base58 Ed25519 public key (32 bytes)

### RPC Client (`src/lib/wallet/rpc/`)
HTTP JSON-RPC with:
- Automatic failover across multiple endpoints
- Circuit breaker (3 failures → 30s cooldown)
- Retry with exponential backoff (3 attempts)
- Configurable timeout (default 10s)

### Fee Engine (`src/lib/wallet/fee/`)
Per-chain dynamic fee estimation with TTL cache:
- Bitcoin: `estimatesmartfee` → sats/vByte
- Ethereum: `eth_feeHistory` → EIP-1559 `maxFeePerGas` + `maxPriorityFeePerGas`
- Solana: `getRecentPrioritizationFees` → microLamports
- Tron: static 1 TRX worst-case

### Signing Layer (`src/lib/wallet/signing/`)
Strict security invariants:
- Private keys sourced from env vars only
- Keys zeroed (`.fill(0)`) immediately after signing
- Keys never appear in logs, exceptions, or serialized objects
- Three KeyStore types: `HotWalletKeyStore`, `HsmKeyStore` (Phase 39 stub), `MpcKeyStore` (Phase 40 stub)

Env var pattern:
- `WALLET_BITCOIN_PRIVATE_KEY=<64-hex-char key>`
- `WALLET_ETHEREUM_PRIVATE_KEY=<64-hex-char key>`
- `WALLET_SOLANA_PRIVATE_KEY=<64-hex-char Ed25519 seed>`

### Chain Providers (`src/lib/wallet/providers/`)
- `BitcoinProvider`: UTXO selection (largest-first, dust protection 546 sats), BIP143 sighash, SegWit serialization
- `EthereumProvider`: RLP encoding, EIP-1559 type-2 transactions, ERC-20 ABI encoding, Redis nonce cache
- `SolanaProvider`: Message serialization, System Program transfer, Ed25519 signing
- `BscProvider`, `PolygonProvider`, `TronProvider`: Extend EthereumProvider

### BullMQ Queue (`src/lib/wallet/queue/`)
Five queues:
- `withdrawal` — main execution queue (3 attempts, exponential backoff)
- `withdrawal:retry` — manual re-queue (5 attempts, 30s base delay)
- `withdrawal:dlq` — dead letter queue (permanent failures)
- `withdrawal:confirmation` — confirmation polling (50 attempts, 30s fixed)
- `withdrawal:recovery` — crash recovery (3 attempts, 60s delay)

### Confirmation Engine (`src/lib/wallet/confirmation/`)
Chain-specific timeouts:
- Bitcoin: 1 hour
- Ethereum/EVM: 15 minutes
- Polygon: 20 minutes
- Solana: 5 minutes

---

## Idempotency

Exactly-once execution is enforced at three levels:

1. **BullMQ job deduplication**: `jobId = withdrawal:{id}` — duplicate enqueue is a no-op
2. **Execution guard**: if `withdrawals.tx_hash IS NOT NULL`, executor returns immediately
3. **Broadcast deduplication**: "already known" RPC errors are gracefully handled

---

## Migration

Migration 0011 adds execution columns to `withdrawals`:
```sql
tx_hash TEXT UNIQUE,          -- idempotency lock
chain_id TEXT,
nonce INTEGER,                -- Ethereum nonce tracking
fee_config JSONB,
broadcast_attempts INTEGER,
last_broadcast_at TIMESTAMPTZ,
confirmation_count INTEGER,
required_confirmations INTEGER,
block_number TEXT,
execution_error TEXT,
network_fee TEXT,
fee_currency TEXT,
raw_tx BYTEA,
idempotency_key TEXT UNIQUE
```

---

## Security

- Private keys are **never** logged, serialized, included in errors, or stored outside env vars
- Ed25519 and secp256k1 signing via `@noble/secp256k1` and Node.js built-in crypto
- Nonce management via Redis (5-min TTL) prevents transaction replay
- Withdrawal must be in `approved` state to execute (enforced in executor)
- All failures route to Dead Letter Queue for human review

---

## Observability

Redis counters at `wallet:metrics:{key}`:
- `withdraw_build_ms` — build latency accumulator
- `withdraw_sign_ms` — sign latency
- `withdraw_broadcast_ms` — broadcast latency
- `confirmation_latency_ms` — confirmation poll latency
- `rpc_failures` — RPC call failures
- `rebroadcast_count` — rebroadcast attempts
- `wallet_low_balance` — low balance alerts
- `idempotency_duplicate_blocked` — duplicate execution blocks
- `tx_dropped_detected` — dropped transaction detections

---

## Configuration

```env
# Bitcoin
WALLET_BITCOIN_PRIVATE_KEY=<64-char hex>
BTC_RPC_URL_1=http://user:pass@bitcoind:8332
BTC_RPC_URL_2=http://user:pass@bitcoind-backup:8332

# Ethereum
WALLET_ETHEREUM_PRIVATE_KEY=<64-char hex>
ETH_RPC_URL_1=https://mainnet.infura.io/v3/{KEY}
ETH_RPC_URL_2=https://eth-mainnet.alchemyapi.io/v2/{KEY}

# Solana
WALLET_SOLANA_PRIVATE_KEY=<64-char hex Ed25519 seed>
SOLANA_RPC_URL_1=https://api.mainnet-beta.solana.com

# Worker
WITHDRAWAL_WORKER_CONCURRENCY=5  # default
```

---

## Phase 39 Preview

- HSM integration (AWS CloudHSM / Thales)
- MPC signing (Shamir secret sharing)
- Multi-signature Bitcoin (P2WSH)
- Hardware wallet (Ledger) support
- Hot wallet balance monitoring + auto-refill alerts
