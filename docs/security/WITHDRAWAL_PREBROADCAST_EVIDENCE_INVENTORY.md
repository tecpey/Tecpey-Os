# Withdrawal Pre-Broadcast Evidence Inventory

Status: **P0 implementation inventory**  
Issue: **#190**  
Parent: **#161**  
Owner: **security-platform / custody-platform**

## Scope boundary

This inventory covers withdrawal authority from TOTP authorization through admission, exact balance reservation, user cancellation and Admin review transitions.

It intentionally stops before:

- transaction building;
- private-key signing;
- durable raw-transaction persistence;
- RPC broadcast;
- confirmation tracking;
- on-chain settlement/finality.

Those external-effect states are implemented through persist-before-broadcast custody code and require a separate mandatory-evidence/reconciliation slice.

## Canonical production paths

| Mutation | Entry point | Authority | Verified actor | Transaction and locks | Authoritative rows | Idempotency / correlation | Current mandatory-evidence gap |
|---|---|---|---|---|---|---|---|
| Withdrawal authorization | `POST /api/auth/withdraw/authorize` | route transaction + `issueWithdrawalAuthorizationTx()` | strict canonical user session | `withTx`; API receipt claim; `user_2fa ... FOR UPDATE`; unique `(user_id, verification_step)` | `api_command_receipts`, `user_2fa`, `withdrawal_authorizations` | `withdrawal.authorize` receipt; canonical withdrawal request hash; TOTP step uniqueness | success and invalid-TOTP outcomes call best-effort `writeAudit()` only after commit |
| Withdrawal admission | `POST /api/auth/withdraw` | `createAuthoritativeWithdrawal()` | strict canonical user session; user ID injected by route | `withTx`; per-user advisory lock; authorization consumption; balance guarded update | `withdrawal_authorizations`, `wallet_balances`, `wallet_ledger`, `withdrawals`, `withdrawal_admission_outbox` | deterministic withdrawal ID; `(user_id,idempotency_key)`; request hash; authorization/request binding | admitted/blocked/review decision has no same-transaction `sensitive_mutation_audit_events` row; `writeAudit()` runs after commit |
| Admission replay | `POST /api/auth/withdraw` | `resolveWithdrawalReplay()` + admission service | strict canonical user session | read/lock in admission transaction for unresolved path | existing `withdrawals` and related authority | same request hash returns same withdrawal; changed replay conflicts | replay relies on state/receipt but has no mandatory evidence consistency check |
| User cancellation | `DELETE /api/auth/withdraw/[id]` | `cancelWithdrawalIdempotently()` | strict canonical user session; owner-scoped query | `withTx`; API receipt claim; owned withdrawal `FOR UPDATE`; exact held-balance guarded update | `api_command_receipts`, `withdrawals`, `wallet_balances`, `wallet_ledger`, `withdrawal_admission_outbox` | `withdrawal.cancel` receipt; owner + withdrawal request hash | cancellation/release/receipt commit first; `writeAudit()` runs afterward |
| Admin approve/reject/block/flag-review | `POST /api/admin/withdrawals/[id]` | `adminActOnAuthoritativeWithdrawal()` | Admin control plane permission + step-up; Admin ID from verified principal | `withTx`; Admin receipt claim; withdrawal `FOR UPDATE`; custody/compliance gate; guarded release | `api_command_receipts`, `withdrawals`, `wallet_balances`, `wallet_ledger`, `withdrawal_admin_actions`, `withdrawal_admission_outbox` | `withdrawal.admin_action` receipt; verified Admin principal; request hash | state/action/release/receipt commit first; best-effort `writeAudit()` follows; raw IP/user-agent/session data is passed into free-form Admin metadata |

## Canonical read and policy authorities

- `src/lib/security/withdrawal-admission-authority.ts`
  - canonical Decimal/string command normalization;
  - request hashing;
  - authorization issuance/inspection/consumption;
  - strict valuation, risk and compliance policy.
- `src/lib/security/withdrawal-admission-service.ts`
  - authoritative admission transaction;
  - exact balance reservation and ledger write;
  - durable admission outbox.
- `src/lib/security/withdrawal-cancel-authority.ts`
  - user cancellation transaction and exact release.
- `src/lib/security/withdrawal-admin-authority.ts`
  - Admin transition, custody launch gate, exact release and Admin action authority.
- `src/lib/security/api-command-idempotency.ts`
  - authorization/cancel/Admin command receipt authority.
- `src/lib/db-migrate-withdrawal-admission.ts`
  - NUMERIC(38,18), authorization, price evidence, outbox and reservation constraints.
- `src/lib/db-migrate-api-command-idempotency.ts`
  - durable replay/conflict receipts.
- `src/lib/security/sensitive-mutation-audit.ts`
  - target append-only mandatory evidence authority.

## Exact state and financial mutation sets

### Authorization

Transactionally coupled today:

1. claim `api_command_receipts` scope `withdrawal.authorize`;
2. lock enabled `user_2fa` row;
3. verify TOTP step and rely on unique step authority;
4. insert `withdrawal_authorizations` for accepted authorization;
5. update `user_2fa.last_used_at`;
6. complete receipt with issued / 2FA-required / invalid-TOTP outcome.

Missing: typed mandatory event before receipt completion.

### Admission

Transactionally coupled today:

1. per-user advisory transaction lock;
2. resolve idempotent existing withdrawal and request-hash conflict;
3. consume exact authorization bound to user/request hash;
4. enforce velocity;
5. reserve `wallet_balances.available_balance -> held_balance` with exact NUMERIC amount;
6. append unique `wallet_ledger(type='hold', reference_type='withdrawal')` row;
7. insert `withdrawals` with valuation, risk/compliance and authorization authority;
8. insert `withdrawal_admission_outbox`.

Missing: typed mandatory admission/block/review evidence in this transaction.

### User cancellation

Transactionally coupled today:

1. claim `withdrawal.cancel` API receipt;
2. lock owner-scoped withdrawal;
3. enforce cancellable state;
4. release exact reserved amount once;
5. append unique release ledger;
6. set withdrawal `cancelled` and clear reservation;
7. cancel pending admission outbox work;
8. complete API receipt.

Missing: typed mandatory cancellation evidence before receipt completion.

### Admin transition

Transactionally coupled today:

1. claim Admin-scoped `withdrawal.admin_action` receipt;
2. lock withdrawal;
3. enforce current state;
4. enforce custody launch and compliance evidence for approval;
5. release reserved funds exactly for reject/block;
6. update withdrawal state/reviewer fields;
7. append `withdrawal_admin_actions`;
8. cancel outbox work where required;
9. complete receipt.

Missing: typed mandatory Admin transition evidence before receipt completion.

## Legacy and bypass inventory

### `src/lib/security/withdrawal-service.ts`

`createWithdrawalRequest()` and its detached `runComplianceChecks()` represent a legacy competing path:

- no production caller was found;
- withdrawal insertion and best-effort audit are split;
- compliance runs with `void`, mutates state later and uses fallback provider outcomes;
- raw withdrawal identifiers/destination facts are passed to legacy audit/notifications;
- it does not consume the canonical withdrawal authorization or use the admission outbox transaction.

Required disposition for #190:

- remove the legacy mutation exports, or
- make them explicitly test-only/unavailable in production, and
- add a permanent source guard preventing any route/service/worker from calling them.

`fetchWithdrawal()` and read-only types may remain until read authority is separately refactored.

### `cancelAuthoritativeWithdrawal()`

A second cancellation function remains exported from `withdrawal-admission-service.ts` and is referenced only by tests. It lacks API-command idempotency and mandatory evidence.

Required disposition:

- remove/quarantine it in favor of `cancelWithdrawalIdempotently()`, or
- convert tests and callers to the canonical cancellation authority and guard against future production usage.

## Non-authoritative post-commit channels

The following may remain only as explicitly non-authoritative observability:

- `trackAuthEvent()` metrics;
- user/Admin notifications;
- structured operational logs.

They cannot satisfy mandatory evidence or release gates.

## Evidence design requirements

### Typed actions

- `withdrawal.authorization.issue`
- `withdrawal.authorization.reject`
- `withdrawal.admit`
- `withdrawal.block`
- `withdrawal.review`
- `withdrawal.cancel`
- `withdrawal.admin.approve`
- `withdrawal.admin.reject`
- `withdrawal.admin.block`
- `withdrawal.admin.flag_review`

### Typed resources

- `withdrawal_authorization`
- `withdrawal_request`
- `withdrawal_admin_transition`

### Bounded facts

Evidence may include:

- domain-separated withdrawal/request/authorization/destination fingerprints;
- normalized asset/network;
- exact Decimal/string amount and USD valuation;
- price/risk/compliance/admission policy versions;
- state transition and bounded reason code;
- hold reserved/released boolean and exact amount;
- idempotency/replay outcome;
- Admin permission/step-up policy facts and role-set fingerprint.

Evidence must not include:

- raw TOTP or TOTP hash suitable for guessing attacks;
- raw authorization/withdrawal/session IDs;
- destination address or destination tag;
- wallet address;
- IP or user-agent;
- cookie/token/API credential;
- raw KYC/AML/sanctions provider payload;
- free-form Admin notes;
- unrestricted request or metadata objects.

## Required failure semantics

- Evidence insertion failure throws and rolls back the containing transaction.
- Receipt completion occurs only after evidence admission.
- Replay returns the committed proven result; it must not append duplicate evidence.
- A changed replay conflicts without changing any state.
- Cancellation/Admin races resolve under the withdrawal row lock and may produce only one release ledger.
- DB unavailability returns a truthful unavailable response, never ordinary success.

## External-effect boundary retained

`src/lib/wallet/withdrawal-executor.ts` already persists signed raw transaction and deterministic transaction hash before RPC broadcast. However its build/sign/broadcast/confirmation transitions need a separate review for:

- durable pre-effect and post-effect mandatory evidence;
- ambiguous RPC timeout/rebroadcast semantics;
- tx-hash and raw-transaction redaction/fingerprinting;
- confirmation/finality evidence;
- custody signing/Admin/operator actor authority.

Those states are not modified in #190.
