# Withdrawal Broadcast and Settlement Evidence Inventory

Status: **P0 implementation inventory**  
Issue: **#193**  
Parent: **#161**  
Follows: **#190 / PR #192**  
Owner: **security-platform / custody-platform**

## Scope boundary

This inventory starts only after a withdrawal has passed the pre-broadcast authority and reached an executable approved state. It owns:

1. worker claim/lease;
2. authoritative PostgreSQL hydration;
3. build;
4. custody signing;
5. signed raw transaction and deterministic tx-hash persistence;
6. RPC broadcast and ambiguous outcomes;
7. reconciliation/rebroadcast;
8. confirmation/finality polling;
9. dropped/timeout/failure classification;
10. exact held-balance settlement and completion evidence.

This slice does **not** enable real withdrawals. `TECPEY_REAL_WITHDRAWALS_ENABLED`, custody capability policy, chain allowlists and signer configuration remain independent launch gates.

## Canonical production paths

| Stage | Entry point | Authority | Durable boundary | External effect / crash window | Current evidence gap |
|---|---|---|---|---|---|
| Queue execution | `src/lib/wallet/queue/processor.ts` withdrawal worker | BullMQ job is a trigger only; `executeWithdrawal()` rehydrates PostgreSQL | operational BullMQ retry/DLQ | worker may die before/after DB claim | no durable execution-attempt row or mandatory claim evidence |
| Lease claim | `claimWithdrawalForExecution()` in `withdrawal-executor.ts` | PostgreSQL `FOR UPDATE SKIP LOCKED`, state + lease owner/expiry | one DB transaction | stale worker may continue after lease expiration unless every later write revalidates owner | lease claim/release/steal has no append-only attempt/evidence authority |
| Build/sign | `buildSignAndPersist()` | DB withdrawal values, provider registry, custody launch gate, configured keystore | raw signed transaction and expected tx hash persist before broadcast | build/sign can fail before persistence; signer actor/configuration is not durably evidenced | no mandatory build/sign event; no durable signing attempt identity |
| Broadcast | `broadcastPrepared()` / `broadcastTransaction()` | persisted raw transaction + expected tx hash | RPC happens before `markBroadcasted()` DB commit | network may accept, process may die or DB may fail before local state changes | no durable broadcast-attempt row; exceptions are classified as retryable even when acceptance is unknown |
| Re-execution | `executeWithdrawal()` with persisted raw transaction | `hasDurablePreparedTransaction()` permits rebroadcast of stored bytes | same raw transaction may be resent | no chain-specific reconciliation before rebroadcast; no distinction between definite reject and ambiguous timeout | no explicit ambiguous/reconcile evidence or attempt count authority |
| Broadcast finalization | `markBroadcasted()` | state/hash/raw-tx-bound PostgreSQL update | DB state becomes `broadcasted` and lease clears | crash after RPC but before this update leaves local state behind chain state | no mandatory accepted/reconciled event in same DB transaction |
| Confirmation queue | `enqueueConfirmationWatch()` | queue payload is a hint; worker rehydrates DB | BullMQ deduplication by withdrawal identity | queue loss/retry is operational, not authoritative | no durable confirmation task/attempt authority |
| Confirmation polling | `ConfirmationEngine.check()` | DB tx hash/network/required confirmations, provider status | DB updates `broadcasted -> confirming`, `failed`, `timeout`, or invokes settlement | provider errors/timeouts and unknown/dropped state classification may be ambiguous | state transitions have no mandatory evidence and are separate DB writes |
| Final settlement | `settleConfirmedWithdrawal()` | withdrawal row lock + tx-hash binding + exact held balance | held balance consumption, unique `withdraw` ledger and `completed` state in one transaction | evidence failure currently cannot roll back settlement because no mandatory event is written | completion/finality facts are not coupled to ledger/state transition |
| Recovery/DLQ | queue processor, recovery queue and operational monitor paths | BullMQ attempts/DLQ are operational hints | queue state only | Redis loss or manual recovery may not prove which signed tx/attempt is authoritative | no PostgreSQL reconciliation work authority |

## Canonical source authorities

### Executor

`src/lib/wallet/withdrawal-executor.ts`

Strong properties:

- queue payload fields other than identity are rejected as authority;
- authoritative chain, amount, destination, fee policy and confirmation count come from PostgreSQL;
- execution claim uses `FOR UPDATE SKIP LOCKED`;
- custody launch policy is checked before build/sign/broadcast;
- expected tx hash is computed from the signed bytes;
- `raw_tx` and `tx_hash` are persisted before RPC broadcast;
- persisted signed bytes are reused on retry rather than rebuilt.

Gaps:

- no append-only execution-attempt table;
- lease owner is not bound to every later build/sign/broadcast state write;
- raw transaction persistence and sign facts have no mandatory evidence;
- RPC error is reduced to a retryable exception without accepted/rejected/ambiguous classification;
- provider-returned hash validation and expected-hash conflict policy need explicit authority;
- RPC acceptance followed by DB failure is not represented durably;
- logs may include raw tx-hash values.

### Provider interface

`src/lib/wallet/types.ts` and `src/lib/wallet/providers/*`

Current provider contract exposes:

- transaction build;
- signature application;
- deterministic tx-hash computation;
- confirmation status;
- fee policy.

Broadcast is performed by the executor/RPC implementation rather than represented as a typed outcome with explicit ambiguity classification. A canonical result must distinguish:

- accepted and matching expected hash;
- definite rejection before acceptance;
- ambiguous/unknown due timeout, connection reset or provider uncertainty;
- hash mismatch/conflict.

### Signer authority

`src/lib/wallet/signing/keystore.ts` and `KeyStore` contract in `wallet/types.ts`

Current contract supplies configured address/public key/signature operations and requires private-key memory hygiene. Missing durable facts include:

- signer/keystore type and policy version;
- configured chain/path/public identity fingerprint;
- build hash fingerprint;
- signed payload fingerprint;
- custody actor/service identity;
- sign-attempt replay/conflict authority.

Mandatory evidence must never contain private key, signature bytes, raw signing hash, raw signed transaction or unrestricted HSM/MPC response.

### Confirmation authority

`src/lib/wallet/confirmation/engine.ts`

Strong properties:

- ignores queue-provided tx hash/network/confirmation policy as authority;
- validates DB state and authoritative tx hash;
- completion delegates to the transactional settlement authority;
- timeout is based on a persisted/bounded broadcast timeline.

Gaps:

- `broadcasted -> confirming`, `dropped -> failed` and `timeout` are independent updates without mandatory evidence;
- provider `unknown` and transport errors are not durably classified;
- no confirmation-attempt row or provider observation fingerprint;
- reservation policy for dropped/timeout/unknown is implicit;
- finality metadata is not persisted with completion evidence.

### Settlement authority

`src/lib/security/withdrawal-settlement-authority.ts`

Strong properties:

- locks withdrawal with `FOR UPDATE`;
- verifies tx-hash binding;
- requires reservation evidence;
- exact NUMERIC held-balance consumption;
- unique withdraw ledger;
- completed state in the same transaction;
- replay requires completed ledger evidence.

Gaps:

- confirmation/finality facts are not an input to the settlement transaction beyond tx hash;
- no mandatory typed `withdrawal.settle` / `withdrawal.complete` event;
- evidence failure cannot currently roll back ledger/state because evidence is absent;
- raw tx hash should be fingerprinted in evidence/logs while remaining available in authoritative chain-operation storage.

## Current authoritative tables and columns

### `withdrawals`

Execution-related authority currently includes or is expected to include:

- state;
- tx hash;
- raw signed transaction;
- required confirmations;
- broadcast timestamp;
- execution lease owner/expiry;
- retry/error metadata;
- reservation metadata;
- completed/finality timestamps.

The row is authoritative for current state, but it is not sufficient as an immutable history of external-effect attempts.

### `wallet_balances` / `wallet_ledger`

- pre-broadcast authority reserves exact funds;
- confirmed settlement decrements held balance;
- one `withdraw` ledger row proves completion;
- no release is permitted merely because provider status is unknown, dropped or timed out unless non-acceptance is proven by reconciliation policy.

### BullMQ queues

- withdrawal execution;
- confirmation;
- recovery;
- DLQ.

All are operational projections. Queue attempt count, payload, status or DLQ membership cannot establish financial or chain authority.

## Required durable attempt model

A canonical append-only attempt authority should represent at minimum:

- attempt ID;
- withdrawal ID and domain-separated fingerprint;
- execution lease owner/version;
- attempt kind: build, sign, broadcast, reconcile, confirm;
- bounded state/outcome classification;
- expected tx-hash fingerprint;
- signed-payload fingerprint;
- provider/chain policy identity fingerprint;
- custody signer type/policy/public-identity fingerprint;
- started/completed timestamps;
- retry/reconciliation relationship;
- bounded failure class/code fingerprint;
- correlation/request hash;
- append-only mandatory evidence link.

Raw signed transaction, raw tx hash, destination, signature/private material and unrestricted provider payloads must not be stored in the attempt/evidence metadata. Raw signed transaction and tx hash remain only in restricted authoritative execution storage where required for chain operations.

## Required state and reservation policy

| State/outcome | Reservation policy | Rebuild/re-sign policy | Broadcast/reconciliation policy |
|---|---|---|---|
| approved | held funds remain reserved | build permitted after lease claim | no RPC effect yet |
| building/signing | held funds remain reserved | one governed attempt; retry only under policy | no broadcast until signed persistence commits |
| signed/prepared | held funds remain reserved | reuse exact signed bytes/hash; do not rebuild silently | reconcile before any rebroadcast after ambiguous history |
| broadcast accepted | held funds remain reserved | no rebuild/re-sign | confirm/reconcile by expected hash |
| broadcast ambiguous | held funds remain reserved | no rebuild/re-sign | provider/chain reconciliation required before rebroadcast |
| definite broadcast reject | held funds remain reserved until policy decides retry/cancel | retry may rebuild only under explicit chain/nonce/UTXO policy | durable rejection evidence required |
| confirming | held funds remain reserved | no rebuild/re-sign | poll authoritative expected hash |
| dropped/timeout/unknown | held funds remain reserved by default | no rebuild/re-sign until reconciliation proves safe | manual/automatic reconciliation state required |
| completed/finalized | exact held amount consumed once | forbidden | one withdraw ledger + completion evidence |
| cancelled/released | only allowed under proven non-acceptance policy | forbidden | exact release ledger/evidence required |

## Required typed evidence

Actions:

- `withdrawal.execution.claim`
- `withdrawal.transaction.build`
- `withdrawal.transaction.sign`
- `withdrawal.broadcast.attempt`
- `withdrawal.broadcast.accept`
- `withdrawal.broadcast.ambiguous`
- `withdrawal.broadcast.reject`
- `withdrawal.reconcile`
- `withdrawal.confirming`
- `withdrawal.dropped`
- `withdrawal.timeout`
- `withdrawal.settle`
- `withdrawal.complete`

Resources:

- `withdrawal_execution`
- `withdrawal_broadcast_attempt`
- `withdrawal_settlement`

## Security and redaction requirements

Mandatory evidence and operational logs must exclude:

- raw signed transaction;
- unsigned transaction/signing hash/signature bytes;
- private key, seed, HSM/MPC share or unrestricted signer response;
- raw destination address/tag;
- RPC credentials, request/response payload and unrestricted provider error;
- cookie/token/session/IP/user-agent data;
- raw queue payload;
- raw tx hash where a domain-separated fingerprint is sufficient.

Allowed bounded facts include:

- network/asset;
- exact amount and network fee as strings;
- attempt kind/outcome;
- expected tx-hash fingerprint;
- signed-payload fingerprint;
- signer type and public-identity fingerprint;
- provider policy/endpoint-class fingerprint;
- confirmation count/required confirmations/block-height string;
- finality policy version;
- reservation/ledger facts;
- bounded error class/reconciliation decision.

## Required adversarial evidence

- concurrent workers cannot independently build/sign/broadcast one withdrawal;
- stale lease owner cannot persist or finalize an attempt;
- sign-evidence failure rolls back raw-tx/hash persistence;
- crash after signed persistence reuses exact bytes/hash;
- accepted RPC followed by local DB failure reconciles by deterministic expected hash;
- ambiguous timeout cannot be treated as definite failure or success;
- returned hash mismatch fails closed;
- same raw transaction rebroadcast is idempotent only under chain policy;
- changed signed payload/hash conflicts;
- forged confirmation queue payload cannot change authoritative network/hash/policy;
- confirmation workers settle once;
- settlement-evidence failure rolls back held consumption, ledger and completed state;
- replay creates one ledger and one completion event;
- dropped/timeout/unknown never silently release funds;
- append-only attempt/evidence rows reject update/delete;
- source guards reject provider broadcast or direct state writes outside canonical authority.

## Existing guards and gaps

`scripts/check-wallet-authority.mjs` already protects:

- persist-before-broadcast ordering;
- DB hydration over queue payload;
- confirmation DB hydration;
- shared queue names and deduplication policy.

It must be extended—not weakened—to require:

- durable attempt/reconciliation schema;
- typed mandatory evidence;
- lease-owner binding on all execution writes;
- accepted/rejected/ambiguous RPC classification;
- settlement evidence coupling;
- provider broadcast call confinement;
- no raw tx hash/payload in evidence or logs.
