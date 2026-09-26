# Custody / Deposits / Withdrawals Certification

**Base:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** #698 identity, #713 compliance, #711 operations. Real-money Exchange activation may depend on this track for customer-fund settlement.

## Objective
Replace “safely disabled” custody boundaries with independently certifiable key, chain, deposit and withdrawal authorities—without activating them during implementation.

## Key-management authority
Current key-management guidance such as NIST SP 800-57 is used as a reference for lifecycle discipline:
- key generation, activation, rotation, backup/recovery, suspension/revocation and destruction are explicit lifecycle events;
- signing keys are never returned to application code as raw key material;
- HSM/MPC adapter contract includes quorum/role separation, signer identity, policy version and audit evidence;
- key ceremony, recovery ceremony and emergency-disable procedure are rehearsed and independently reviewed;
- no production private keys in CI, logs, artifacts, chat or database rows.

## Chain-provider certification
For each supported network (BTC, Ethereum/EVM chains, TRON, Solana, etc.):
- canonical address validation and network separation;
- deposit detection + confirmation/finality policy version;
- reorg handling and duplicate event protection;
- provider quorum/failover and stale-height detection;
- fee estimation policy + bounded max fee;
- withdrawal construction/sign/broadcast/confirm lifecycle;
- ambiguous broadcast recovery by transaction identity;
- on-chain ↔ internal-ledger reconciliation;
- chain-specific implementation: TRON cannot inherit EVM transaction semantics merely because an RPC adapter shape is similar.

## Withdrawal controls
- compliance/risk/KYC admission before signing;
- amount precision/limits, velocity/risk controls;
- address allow/deny/hold workflows where policy requires;
- command idempotency and exactly-once external-effect intent;
- settlement states cannot jump from requested directly to complete;
- human/manual review actions audited.

## Security / operations
- signer/HSM outage;
- RPC split brain/provider disagreement;
- chain reorg;
- fee spike;
- duplicate callback/poll result;
- broadcast timeout with transaction actually accepted;
- database/worker recovery mid-withdrawal;
- emergency global + per-chain disable.

## Acceptance
Testnet/sandbox and protected operational evidence prove deterministic reconciliation and ambiguous-result recovery. Production custody/deposit/withdrawal flags remain disabled until key ceremony, provider certification, compliance and executive release approval are separately accepted.
