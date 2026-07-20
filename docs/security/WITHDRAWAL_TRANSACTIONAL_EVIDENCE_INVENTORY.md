# Withdrawal Transactional Evidence Inventory

Status: **P0 implementation inventory**  
Issue: **#189**  
Parent: **#161**  
Advances: **#100, #156**  
Coordinates with: **#50, #76, #77**  
Inventory base: **`279609e1f07510652c20e5d8a72fa801c4bc2abf`**  
Owners: **security-platform / custody-platform**

## 1. Bounded objective

This slice makes mandatory Withdrawal evidence commit with the authoritative PostgreSQL mutation it proves. It covers:

1. user withdrawal admission, authorization consumption, compliance outcome and exact reserve;
2. user cancellation and exact reserved-fund release;
3. Admin approve, reject, block and flag-review decisions;
4. idempotent command receipts, outbox changes and durable Admin action rows associated with those transitions;
5. permanent removal of post-commit best-effort audit as financial or privileged authority.

This slice does **not** redesign signing, broadcast, chain confirmation, custody providers, settlement workers, price-provider consensus or the broader Decimal program.

## 2. Existing authority that must be preserved

The repository already has a substantial Withdrawal security foundation:

- strict canonical user sessions and strict revocation checks;
- CSRF checks and principal-scoped rate limits;
- bounded request bodies;
- exact-string asset amount admission;
- canonical request hashing and stable idempotency keys;
- one-time withdrawal authorization consumption;
- authoritative signed USD valuation snapshots;
- KYC, AML and sanctions evidence;
- risk-level enforcement and compliance-review state;
- exact balance reservation and immutable hold ledger entries;
- durable withdrawal admission outbox;
- idempotent user-cancellation receipts;
- idempotent Admin-action receipts;
- custody launch gate and complete compliance evidence before Admin approval;
- exact reserved-fund release for cancellation, rejection and block;
- durable `withdrawal_admin_actions` rows;
- strict Admin permissions and recent step-up requirements;
- server-owned tenant and actor identities.

These controls remain authoritative. #189 adds mandatory typed evidence inside their current transactions; it does not create a parallel Withdrawal service.

# 3. Production mutation-path inventory

## 3.1 User withdrawal admission route

**Path:** `src/app/api/auth/withdraw/route.ts` — `POST /api/auth/withdraw`

**Verified actor and controls**

- principal: `getCanonicalSession(req, { strictRevocation: true })`;
- user ID: server-derived Academy/User/Student account ID;
- tenant: server-owned platform tenant;
- CSRF origin verification;
- principal-scoped rate limit;
- bounded JSON body;
- exact-string amount requirement through canonical command validation;
- client-supplied `amountUsd` and `twoFaVerified` explicitly rejected;
- required header idempotency key with body/header mismatch rejection;
- server inspection of one-time authorization;
- server production or reuse of authoritative price snapshot;
- IP, user-agent and device fingerprint are collected for existing risk/compliance authority but must not enter mandatory audit evidence in raw form.

**Delegated authority**

- `canonicalizeWithdrawalCommand()`;
- `resolveWithdrawalReplay()`;
- `inspectWithdrawalAuthorization()`;
- `ensureWithdrawalPriceSnapshot()`;
- `createAuthoritativeWithdrawal()`.

**Current evidence defect**

The route/service can return a committed withdrawal after the financial transaction, while `writeAudit()` runs later in application code. A process crash or audit failure can therefore leave committed authorization consumption, reserve, ledger, withdrawal row and outbox without mandatory governed evidence.

**Required disposition**

Keep the route focused on verified context and admission. Mandatory evidence must be written inside `createAuthoritativeWithdrawal()`'s transaction. Notifications and metrics remain post-commit projections.

## 3.2 Transactional withdrawal admission

**Path:** `src/lib/security/withdrawal-admission-service.ts` — `createAuthoritativeWithdrawal()`

**Current pre-transaction authority**

- canonical command and request hash;
- strict account risk level;
- signed authoritative USD valuation;
- deterministic withdrawal ID;
- KYC, AML, sanctions and risk-review evaluation.

**Current transaction and locking**

- transaction-scoped advisory lock by user;
- exact idempotency lookup and changed-payload conflict;
- one-time withdrawal authorization consumption;
- insertion of authoritative withdrawal row;
- exact funds reservation when the resulting compliance state allows reserve;
- immutable wallet hold ledger entry;
- persisted valuation and compliance evidence;
- durable withdrawal-admission outbox row.

**Rows potentially mutated atomically**

- withdrawal authorization state;
- `withdrawals`;
- `wallet_balances`;
- `wallet_ledger`;
- `withdrawal_admission_outbox`.

**Current post-commit behavior**

- `writeAudit({ action: "wallet_withdrawal", event: "withdrawal_admitted", ... })`;
- auth metrics;
- requested/blocked/risky-withdrawal notifications.

**Current evidence defect**

No mandatory typed event is coupled to the admission transaction. Forced audit rejection cannot currently roll back authorization consumption, reserve, ledger, withdrawal row or outbox.

**Required disposition**

Append one mandatory admission outcome event in the existing transaction. The event must truthfully represent the resulting state:

- pending/admitted;
- compliance review;
- blocked.

It must include exact amount and exact USD valuation strings, reserve status, bounded compliance result codes, policy version and one-way destination/network identity. It must not include the raw address, tag, IP, user-agent, device fingerprint, authorization ID or compliance documents.

## 3.3 User cancellation route

**Path:** `src/app/api/auth/withdraw/[id]/route.ts` — `DELETE /api/auth/withdraw/[id]`

**Verified actor and controls**

- CSRF verification;
- strict canonical session;
- required validated `Idempotency-Key`;
- canonical request hash;
- owner-scoped authority delegation.

**Delegated authority**

- `cancelWithdrawalIdempotently()`.

**Required disposition**

The route must remain free of financial mutation and audit sequencing. It should continue delegating to the canonical transactional cancellation authority.

## 3.4 Canonical user cancellation authority

**Path:** `src/lib/security/withdrawal-cancel-authority.ts` — `cancelWithdrawalIdempotently()`

**Current transaction**

- tenant/principal-scoped API-command claim;
- replay, conflict and in-progress handling;
- owner-scoped withdrawal row lock;
- allowed-state check (`pending`, `compliance_review`);
- exact reserved-fund release when `funds_reserved_at` exists;
- immutable release ledger insertion;
- state transition to `cancelled`;
- reservation timestamp cleared;
- pending/retryable admission outbox cancelled;
- successful API-command receipt completed.

**Rows potentially mutated atomically**

- `withdrawals`;
- `wallet_balances`;
- `wallet_ledger`;
- `withdrawal_admission_outbox`;
- `api_command_receipts`.

**Current post-commit behavior**

- auth metric `withdrawal_cancelled`;
- `writeAudit({ action: "wallet_withdrawal", event: "withdrawal_cancelled" })`.

**Current evidence defect**

Cancellation, exact release, ledger, outbox update and idempotent receipt can commit before the audit write.

**Required disposition**

Append mandatory user-cancellation evidence inside the existing transaction and before the successful API receipt. Evidence must include previous state, resulting state, whether funds were reserved, exact released amount and asset. Exact replay must not duplicate release or evidence.

## 3.5 Admin withdrawal action route

**Path:** `src/app/api/admin/withdrawals/[id]/route.ts` — `POST /api/admin/withdrawals/[id]`

**Verified actor and controls**

- CSRF verification;
- Admin rate limit;
- strict withdrawal ID validation;
- bounded JSON body;
- explicit action allowlist;
- required validated idempotency key;
- `authorizeAdminRequest()` with action-specific permission;
- recent step-up requirement (`stepUpWithinSeconds: 300`);
- admin ID derived from verified control-plane principal;
- canonical request hash binds withdrawal ID, action and normalized notes.

**Current request metadata risk**

The route passes IP, full user-agent, session ID and roles inside arbitrary `metadata` to the Admin authority. This metadata is written into `withdrawal_admin_actions` and must not be copied unbounded into mandatory audit evidence. Mandatory evidence should use only bounded server-derived actor/session assurance facts or one-way fingerprints where correlation is required.

**Post-commit projections**

Approved/rejected/blocked notifications are emitted after the authority returns. These remain operational effects, not financial truth.

## 3.6 Canonical Admin withdrawal authority

**Path:** `src/lib/security/withdrawal-admin-authority.ts` — `adminActOnAuthoritativeWithdrawal()`

**Supported actions**

- `approve` -> `approved`;
- `reject` -> `rejected`;
- `block` -> `blocked`;
- `flag_review` -> `compliance_review`.

**Current transaction**

- tenant/admin-scoped API-command claim;
- replay, conflict and in-progress handling;
- withdrawal row lock;
- state-transition validation;
- approval custody launch gate;
- approval reservation-presence proof;
- approval KYC/AML/sanctions completeness proof;
- exact reserved-fund release for reject/block;
- withdrawal state/reviewer/review timestamp update;
- durable `withdrawal_admin_actions` insertion;
- admission-outbox cancellation for reject/block;
- successful API-command receipt completion.

**Rows potentially mutated atomically**

- `withdrawals`;
- `wallet_balances`;
- `wallet_ledger`;
- `withdrawal_admin_actions`;
- `withdrawal_admission_outbox`;
- `api_command_receipts`.

**Current post-commit behavior**

- auth metrics for approve/reject/block;
- `writeAudit({ action: "admin_action", resourceType: "withdrawal", ... })`.

**Current evidence defect**

A privileged financial decision and possible reserved-fund release can commit without mandatory governed evidence. Existing `withdrawal_admin_actions` is a durable business row, but it does not replace the platform-wide mandatory sensitive-mutation evidence contract.

**Required disposition**

Append mandatory Admin decision evidence inside the same transaction and before successful receipt completion. It must bind:

- verified Admin actor;
- requested action;
- previous and resulting state;
- custody-gate/compliance decision status for approval;
- whether funds were released and the exact amount/asset;
- bounded reason classification or one-way notes fingerprint, never unrestricted notes;
- durable Admin action ID or one-way fingerprint;
- request hash and idempotent correlation.

## 3.7 Existing withdrawal admission outbox

**Table:** `withdrawal_admission_outbox`

The outbox owns asynchronous continuation/recovery after admission. Cancellation, rejection and block can cancel pending work. It is operational workflow evidence and must remain in the authoritative transaction, but it does not replace mandatory actor/action financial evidence.

**Required disposition**

- preserve current outbox semantics;
- evidence failure must roll back outbox creation/cancellation together with financial state;
- queue publication or notification delivery must never be treated as evidence completion.

## 3.8 Existing wallet ledger

**Table:** `wallet_ledger`

Hold and release rows are immutable amount authority. They prove the exact balance movement but do not fully prove the verified actor, privileged action, compliance outcome or idempotent request context.

**Required disposition**

Mandatory Withdrawal evidence must reference exact committed amount strings and one-way withdrawal identity while leaving the ledger as financial amount truth. It must not duplicate or replace wallet-ledger accounting.

## 3.9 Existing Admin action rows

**Table:** `withdrawal_admin_actions`

These rows record workflow decisions and currently allow notes/metadata. They are useful business and investigation records but are not sufficient as mandatory platform audit evidence because:

- arbitrary metadata can contain sensitive values;
- their schema and uniqueness contract differ from `sensitive_mutation_audit_events`;
- they do not protect all user admission/cancellation paths;
- no common correlation-conflict contract binds them to other sensitive mutations.

**Required disposition**

Preserve the table. Write a separate bounded mandatory event in the same transaction. Do not copy unrestricted notes or metadata into the mandatory event.

# 4. Proposed typed evidence design

## 4.1 Actions

Initial action taxonomy:

- `withdrawal.admit`
- `withdrawal.cancel`
- `withdrawal.admin.approve`
- `withdrawal.admin.reject`
- `withdrawal.admin.block`
- `withdrawal.admin.flag_review`

Admission metadata records the resulting compliance state, including blocked or review outcomes. A separate `withdrawal.block` user-admission action is unnecessary unless implementation proves one admission action cannot unambiguously encode the committed outcome.

## 4.2 Resource

- `withdrawal`

## 4.3 Actor policy

- admission/cancellation actor: verified canonical user principal;
- Admin decision actor: verified Admin control-plane principal;
- service actor is not needed for this bounded slice unless a database trigger must represent an internal transition;
- tenant is always server-owned.

## 4.4 Correlation and resource identity

- resource ID: domain-separated one-way fingerprint of withdrawal ID;
- correlation: domain-separated fingerprint of action + tenant + actor + idempotency key/request authority;
- request hash: existing canonical request hash;
- destination identity: one-way domain-separated fingerprint of normalized network + destination address + optional tag;
- no raw withdrawal ID needs to appear in metadata.

## 4.5 Bounded metadata

Allowed server-derived metadata should include only:

- evidence policy version;
- asset and network classification;
- exact amount string;
- exact USD valuation string and price-snapshot fingerprint;
- previous/resulting state;
- reserve status and exact reserved/released amount;
- bounded KYC/AML/sanctions status codes and risk tier;
- compliance reason code from an allowlisted/bounded namespace;
- custody launch-gate decision for approval;
- one-way destination, network, Admin-action and review-notes fingerprints where required;
- replay/idempotency outcome only when it truthfully represents a committed fact.

Forbidden:

- raw destination address/tag;
- IP address, full user-agent, device fingerprint, session ID or roles array;
- authorization ID;
- raw KYC/AML/sanctions payload or documents;
- unrestricted notes or arbitrary request metadata;
- secrets, cookies, tokens, API keys or unrestricted request body;
- JavaScript-number-derived amounts.

# 5. Implementation sequence

1. Extend typed actions/resource and forbidden-key/redaction tests.
2. Add bounded Withdrawal evidence builders and domain-separated fingerprints.
3. Inject mandatory admission evidence into the current admission transaction.
4. Remove post-commit admission `writeAudit()` authority.
5. Inject mandatory cancellation evidence before successful receipt completion.
6. Remove post-commit cancellation `writeAudit()` authority.
7. Inject mandatory Admin decision evidence before successful receipt completion.
8. Remove post-commit Admin `writeAudit()` authority.
9. Add rollback, replay, conflict, concurrent transition, cross-principal and redaction tests.
10. Add permanent source guards against reintroducing route/service best-effort financial audit.
11. Add database gates only where direct SQL bypass could otherwise create a privileged committed state without exact evidence.
12. Record exact API Security Manifest reviewed deltas.
13. Publish final operations documentation and unchanged-head workflow evidence.

# 6. Required adversarial evidence

The implementation is incomplete until tests prove:

- forced admission-evidence rejection rolls back authorization consumption, withdrawal insert, reserve balance, hold ledger and outbox;
- exact duplicate admission creates one withdrawal, one reserve, one ledger row and one event;
- changed idempotency replay conflicts;
- blocked/review admission evidence contains no raw destination or PII;
- cancellation-evidence rejection rolls back state, release, ledger, outbox and receipt;
- cancellation replay creates no duplicate release or event;
- Admin-decision evidence rejection rolls back state, release, Admin action, outbox update and receipt;
- Admin approval cannot bypass custody launch gate, reservation proof or compliance completeness;
- concurrent user cancellation and Admin reject/block produce only one valid state transition and one exact release;
- cross-principal cancellation and unauthorized Admin actions neither disclose nor mutate the target;
- forbidden notes, metadata, destination, authorization, IP, user-agent, device/session and credential keys are rejected by application and database evidence boundaries;
- direct final/privileged state bypass is rejected if database-level gating is added;
- notification or queue failure cannot fabricate rollback of committed financial authority.

# 7. Release gates

Final evidence must be generated on one unchanged commit SHA:

```bash
npm run db:migrate
npm run db:migrate
npm run withdrawals:check
npm run test:withdrawal-admission
npm run audit:sensitive:check
npm run test:sensitive-mutation-audit
npm run api:security:check
npm run test:api-security-manifest
npm run typecheck
npm run lint
npm test
npm run build
```

Required workflows:

- CI;
- Full Suite Diagnostics;
- Sensitive Mutation Audit;
- API Security Manifest;
- the relevant Withdrawal/Custody authority workflow.

# 8. Initial decision

**NO-GO for #189 completion.**

The existing Withdrawal financial and compliance foundation is strong, but admission, user cancellation and Admin decisions can still commit without mandatory typed evidence. This inventory authorizes a narrow migration into the existing transactions only. It does not authorize a custody, signing, settlement or provider redesign.
