# Withdrawal External-Effect Evidence Inventory

Status: **P0 implementation authority**  
Issue: **#194**  
Parents: **#161, #100, #156**  
Coordinates with: **#29, #50, #106, #76, #77**

## 1. Bounded purpose

This document is the authoritative inventory for the withdrawal lifecycle **after approval and before/through final on-chain settlement**.

It begins where the pre-broadcast authority completed by #190 / PR #192 ends. It covers worker claim, transaction construction, signing, durable preparation, RPC broadcast, confirmation monitoring, dropped/timeout outcomes and confirmed settlement.

It does not:

- approve a production signer;
- implement or certify HSM/MPC custody;
- enable real-money withdrawals;
- certify any chain/provider;
- redesign fee-bump or replacement-transaction policy;
- treat BullMQ, Redis, process memory, logs or provider responses as financial truth.

The production custody launch gate from #106 remains closed. Chain/provider certification and operational recovery evidence remain coordinated with #29.

## 2. Current authoritative topology

### 2.1 PostgreSQL authority

The `withdrawals` row is the authoritative execution record. Relevant durable fields include:

- `state`;
- `raw_tx`;
- `tx_hash`;
- `chain_id` / `network`;
- `network_fee` and `fee_currency`;
- `required_confirmations` and `confirmation_count`;
- `broadcast_attempts` and `last_broadcast_at`;
- `block_number` and `completed_at`;
- `execution_error`;
- `funds_reserved_at`.

`wallet_balances` and `wallet_ledger` remain the financial authority for reserved-fund consumption and final withdrawal settlement.

### 2.2 External-effect authority

The external effect is the chain RPC call that submits an already signed transaction. It cannot participate in a PostgreSQL transaction. Safety therefore requires:

1. persist-before-effect;
2. deterministic transaction identity;
3. a durable attempt generation before RPC;
4. typed outcome classification after RPC;
5. reconciliation of ambiguous outcomes before any rebroadcast;
6. mandatory evidence coupled to every authoritative database transition.

### 2.3 Projection authority

BullMQ execution, confirmation, recovery and DLQ queues are identity-oriented triggers and operational projections. Queue payloads contain financial-looking hints, but production workers rehydrate authoritative values from PostgreSQL.

Redis/BullMQ availability must never decide whether a transaction was signed, broadcast, confirmed or settled.

## 3. Mutation and caller inventory

| Stage | Production source/caller | Current durable mutation | Lock / transaction boundary | External effect | Current evidence | Confirmed gap |
|---|---|---|---|---|---|---|
| Worker startup | `src/workers/withdrawal-worker.ts` | none | process bootstrap | starts BullMQ consumers | logs only | no durable worker-generation identity; custody gate correctly fail-closed |
| Execution dispatch | `src/lib/wallet/queue/processor.ts` | none | queue callback | calls executor | logs only | queue/job metadata is not governed evidence |
| Execution claim: build | `claimWithdrawal()` in `withdrawal-executor.ts` | `approved/failed -> building_transaction` | one `withDb` statement; conditional update | none | logs/metrics only | state can commit without mandatory claim evidence |
| Execution claim: resume | `claimWithdrawal()` | stale/failed prepared row -> `broadcasting` | one conditional update | none | logs/metrics only | no durable recovery generation or reconciliation classification |
| Existing broadcast | `claimWithdrawal()` | read-only; returns confirm mode | one read | none | logs only | no proof that confirmation repair was requested |
| Build | `buildSignAndPersist()` | no mutation until later transition | provider call outside DB transaction | chain-specific unsigned construction | latency metric | build intent/result, fee, nonce/UTXO policy and source-address binding lack mandatory evidence |
| Build -> signing | `transitionState()` | `building_transaction -> signing` | one conditional update | none | none | transition can commit without mandatory evidence |
| Sign | `buildSignAndPersist()` | none during signer call | signer call outside DB transaction | private signing operation | latency metric | no durable signing intent/lease; no signer/key-version/intent binding evidence |
| Prepare signed tx | `buildSignAndPersist()` | `signing -> broadcasting`; sets `raw_tx`, `tx_hash`, fee and confirmations | one conditional update | none | none | prepared state is durable, but mandatory evidence is absent; evidence rejection cannot roll it back |
| Broadcast call | `broadcastTransaction()` | none before each RPC attempt | no durable attempt transaction | `sendrawtransaction`, `eth_sendRawTransaction` or `sendTransaction` | logs/metrics | no append-only attempt row or attempt generation before external effect |
| Broadcast accepted | `commitBroadcastResult()` | `broadcasting -> broadcasted`; attempts and timestamp | one conditional update | RPC already occurred | logs/metrics | crash between RPC acceptance and DB commit is ambiguous; accepted result lacks mandatory evidence |
| Already known | `broadcastTransaction()` | same later commit as accepted | message-regex classification | chain may already contain tx | log only | provider text is treated as success without durable provider classification/reconciliation record |
| Hash mismatch | `broadcastTransaction()` | later failure path may set `failed` | no dedicated transaction | provider returned different hash | error/log | no durable security outcome/manual-review evidence |
| RPC timeout/error | `broadcastTransaction()` + catch | `markExecutionFailure()` may set `failed` | update after retries | external outcome may be unknown | error/log/metric | ambiguous acceptance can become ordinary failed and later rebroadcast without deterministic lookup |
| Confirmation enqueue | `ensureConfirmationWatch()` | later `broadcasted -> confirming` | queue call first, DB update second | Redis/BullMQ publication | queue state/log | queue success can precede DB transition; queue failure has no durable repair outbox |
| Confirming transition | `ensureConfirmationWatch()` / `loadAuthoritativeConfirmation()` | `broadcasted -> confirming` | conditional update | none | none | duplicate mutation authorities; no mandatory monitor evidence |
| Confirmation poll | `checkConfirmation()` | no mutation for pending | provider query | chain status lookup | latency metric | provider observation is not durably classified |
| Dropped | `markWithdrawalFailed()` | `broadcasted/confirming -> failed` | one conditional update | provider reports dropped | metric/log | no mandatory dropped evidence; retry semantics can rebuild/rebroadcast incorrectly |
| Timeout | `markWithdrawalTimeout()` | `broadcasted/confirming -> timeout` | one conditional update | deadline elapsed | none | no mandatory timeout evidence or reconciliation proof |
| Confirmed settlement | `settleConfirmedWithdrawal()` | held balance consumption, one withdraw ledger row, `completed`, confirmations/block metadata | one `withTx`, row lock on withdrawal | none; based on provider observation | PostgreSQL financial rows only | financially atomic and replay-safe, but mandatory settlement evidence is absent |
| Execution failure | `markExecutionFailure()` | build/sign/broadcasting -> `failed` | one update | may follow deterministic or ambiguous failure | error/log | different failure classes collapse into one state and unrestricted error string |
| DLQ | `moveToDeadLetter()` | Redis only | queue publication | none | queue payload includes failure reason | no durable PostgreSQL DLQ/manual-review authority; free-text reason can leak sensitive data |
| Recovery | recovery worker -> `executeWithdrawal()` | same claim/resume mutations | same as executor | may rebroadcast | logs | no durable recovery generation, ambiguity reconciliation or replacement policy proof |

## 4. Server identity and trust boundaries

### 4.1 Worker actor

Mandatory evidence actor must be server-derived, for example:

- actor type: `service`;
- actor id: a stable bounded authority such as `withdrawal-executor`, `withdrawal-confirmation` or `withdrawal-settlement`;
- tenant: platform/verified withdrawal authority, never queue-controlled.

BullMQ job IDs, retry counts, queue names and payload fields are operational correlation only and cannot define actor, tenant, chain, amount, destination, tx hash or confirmation policy.

### 4.2 Signer authority

`createKeyStore()` selects the configured signer under custody launch policy. Current concrete production-capable behavior remains the environment-key `HotWalletKeyStore`; HSM and MPC implementations are stubs and fail when called.

This slice may record a bounded signer-type/key-reference fingerprint returned by server authority. It must not claim HSM/MPC readiness and must never store:

- private/public key bytes;
- signature bytes;
- signing hash;
- environment variable name/value;
- HSM/MPC credentials or raw provider attestation.

A future production signer should expose a stable non-secret key-version/reference and attestation fingerprint. Until #106 closes, real custody remains disabled.

### 4.3 Provider authority

Provider outputs are observations, not unrestricted database authority. Every output must be checked against the prepared transaction and current PostgreSQL state.

Raw RPC request/response bodies, endpoint credentials and unbounded error messages cannot enter mandatory evidence.

## 5. Current state machine and unsafe ambiguity

Current execution states:

`approved -> building_transaction -> signing -> broadcasting -> broadcasted -> confirming -> completed`

Failure/terminal branches:

- `building_transaction | signing | broadcasting -> failed`;
- `broadcasted | confirming -> failed` for dropped;
- `broadcasted | confirming -> timeout`;
- terminal `cancelled` is governed by the pre-broadcast authority.

### 5.1 Confirmed ambiguity window

The critical external-effect window is:

1. signed transaction and deterministic tx hash are persisted with state `broadcasting`;
2. RPC may accept the transaction;
3. process or database connectivity may fail before `commitBroadcastResult()` changes state to `broadcasted`.

Current recovery may reclaim a stale `broadcasting` row and rebroadcast the same bytes. Reusing the exact deterministic transaction is safer than rebuilding, but there is no durable attempt/outcome record proving whether reconciliation was performed first.

The new authority must never convert an unknown RPC outcome directly into ordinary `failed`. It must persist `ambiguous` and reconcile the expected deterministic transaction hash before another external submission.

## 6. Required durable data model

The final schema may be refined, but it must provide one append-only attempt/reconciliation authority.

### 6.1 Broadcast attempt table

Minimum fields:

- attempt id/generation;
- withdrawal id and tenant/principal binding;
- prepared transaction fingerprint and expected tx-hash fingerprint;
- chain/provider fingerprint;
- attempt state: `prepared`, `calling`, `accepted`, `already_known`, `ambiguous`, `rejected`, `hash_mismatch`, `reconciled_present`, `reconciled_absent`, `manual_review`;
- lease owner/expiry for concurrency control;
- bounded result/error category;
- started/finalized timestamps;
- request/evidence correlation hashes;
- append-only timestamps and version.

Required constraints:

- one active broadcast generation per withdrawal;
- active generation binds exactly one prepared transaction fingerprint;
- accepted/already-known cannot be changed to rejected;
- ambiguous must reconcile before a new call or generation;
- update/delete protection for immutable finalized attempt facts;
- tenant/withdrawal ownership integrity;
- no raw transaction, raw tx hash, destination or provider payload in evidence metadata.

### 6.2 Confirmation projection outbox

A successful broadcast result must create durable confirmation-work state in the same transaction as `broadcasted`/evidence. Redis publication happens after commit and is retryable.

The outbox should contain only identity and bounded scheduling policy. The confirmation worker must continue to hydrate tx hash, chain and required confirmations from PostgreSQL.

### 6.3 Mandatory evidence

Typed actions at minimum:

- `withdrawal.execution.claim`;
- `withdrawal.transaction.prepare`;
- `withdrawal.broadcast.attempt`;
- `withdrawal.broadcast.accepted`;
- `withdrawal.broadcast.ambiguous`;
- `withdrawal.broadcast.rejected`;
- `withdrawal.confirmation.monitor`;
- `withdrawal.confirmation.dropped`;
- `withdrawal.confirmation.timeout`;
- `withdrawal.settle`.

Resources at minimum:

- `withdrawal_execution`;
- `withdrawal_broadcast_attempt`;
- `withdrawal_settlement`.

## 7. Exact evidence metadata policy

Allowed bounded facts include:

- policy/schema version;
- chain id and asset symbol from PostgreSQL;
- exact amount/fee strings where required for proof;
- required/observed confirmation counts;
- bounded state transition names;
- signer type and non-secret key-version fingerprint;
- provider class fingerprint;
- prepared transaction and expected-hash fingerprints;
- attempt generation/count;
- bounded outcome/error category;
- block-number string where required;
- custody capability/policy version.

Forbidden values include:

- raw withdrawal/user/tenant identifiers in metadata;
- destination address/tag/memo;
- raw transaction or unsigned transaction;
- raw tx hash, signing hash, signature or key material;
- nonce, UTXO transaction IDs/scripts/addresses or full input selection;
- RPC URL, credentials, request/response body or provider stack trace;
- unrestricted exception/error text;
- queue payload, job ID, IP, user-agent, cookie, token or session data.

Resource IDs and correlation use domain-separated SHA-256 fingerprints.

## 8. Existing strengths to preserve

- custody capability is checked before worker claim, signing and broadcast;
- HSM/MPC stubs cannot be silently selected as implemented providers;
- queue hints are not used as financial authority;
- fee speed is resolved from the approved database record;
- signed bytes and deterministic tx hash are persisted before broadcast;
- returned tx hash must match the expected hash;
- stale prepared records resume the same signed transaction;
- confirmation hydrates authoritative tx hash/chain/policy from PostgreSQL;
- settlement locks the withdrawal and verifies tx hash/state/reservation;
- held balance consumption, withdraw ledger insertion and completed state are one transaction;
- repeated settlement returns replay without duplicate ledger mutation;
- BullMQ job IDs and live confirmation watches are deduplicated.

No implementation may regress these properties.

## 9. Required implementation sequence

1. **Freeze inventory and taxonomy** — this document plus permanent source guard inputs.
2. **Schema** — append-only broadcast attempts, confirmation outbox/repair state and DB redaction/immutability constraints.
3. **Typed evidence helper** — service-derived actor, domain-separated fingerprints and bounded error taxonomy.
4. **Transactional preparation authority** — claim/state/sign result persistence with mandatory evidence; no raw transaction commit without proof.
5. **Persist-before-effect attempt authority** — create/lease attempt before RPC.
6. **Outcome authority** — accepted/already-known/rejected/hash-mismatch/ambiguous atomic classification.
7. **Reconciliation authority** — ambiguous attempt lookup before rebroadcast; deterministic recovery generation.
8. **Confirmation projection** — DB outbox then Redis publication/repair.
9. **Confirmation state authority** — monitor/dropped/timeout mandatory evidence.
10. **Settlement authority** — mandatory settlement evidence in the existing financial transaction.
11. **Legacy/direct-path quarantine** — source guards and DB gates.
12. **Adversarial PostgreSQL/Redis/provider fixtures**.
13. **Exact API/security governance and unchanged-head release evidence**.

## 10. Required adversarial matrix

| Scenario | Required result |
|---|---|
| preparation evidence insert fails | state, raw tx, tx hash, fee and confirmation policy roll back |
| concurrent executor claims | one claim/prepared transaction/active generation |
| signer throws | no partially prepared transaction; bounded failure/manual-review policy |
| crash before RPC | prepared attempt resumes without rebuilding |
| RPC accepted, process dies before result commit | attempt remains ambiguous/reconcilable; no blind new generation |
| provider says already known | reconcile expected hash and commit one accepted outcome |
| returned hash differs | no broadcast success; durable security/manual-review outcome |
| provider timeout/network interruption | durable ambiguous outcome; reconciliation required |
| deterministic rejection | one bounded rejected/manual-review result |
| stale/forged queue payload | ignored/rejected; DB values used |
| Redis confirmation enqueue fails | broadcast remains committed; durable outbox remains pending |
| duplicate confirmation workers | one terminal confirmation/settlement result |
| dropped/timeout evidence rejected | state transition rolls back |
| settlement evidence rejected | held balance, ledger and completed state roll back |
| exact settlement replay | replay result; one ledger and one evidence event |
| changed/cross-withdrawal tx hash | fail closed without mutation |
| evidence metadata contains raw secret/identifier | rejected by application and PostgreSQL constraints |
| attempt/evidence update/delete | rejected |

## 11. Completion and release stance

Issue #194 is complete only when:

- every listed mutation path is either migrated or permanently quarantined;
- preparation, attempts, broadcast outcomes, confirmation outcomes and settlement have mandatory durable evidence;
- ambiguity and reconciliation are first-class durable states;
- PostgreSQL + Redis/provider-fixture adversarial tests pass;
- custody launch remains disabled unless #106 closes independently;
- chain certification remains explicitly pending under #29;
- migrations and migration idempotency pass;
- permanent source/database guards pass;
- relevant security manifests/deltas are exact;
- CI, Full Suite Diagnostics, Sensitive Mutation Audit, API Security Manifest, Wallet/Custody gates, production build and both runtime smokes pass on one unchanged commit SHA.

Passing this slice proves evidence integrity and recovery semantics. It does **not** by itself approve real-money custody or any chain for production withdrawals.
