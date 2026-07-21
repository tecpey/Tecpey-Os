# Production Hardening Master Plan — Phase 40

**Original date:** 2026-07-05  
**Current-state correction:** 2026-07-21 — through Issue #246  
**Phase:** 40 — Production Hardening  
**Status:** Implementation Plan — execution requires active-gate authorization  
**Classification:** Critical — Pre-Launch Execution Plan  
**Purpose:** Define the remaining work and evidence required to prepare TecPey for a controlled soft launch without misrepresenting implemented, disabled or incomplete capabilities.

---

## Executive Summary

TecPey has a mature protected CI and several production-grade domain authorities, but the complete platform is **not yet production-ready**.

### Hardening capabilities already established

- canonical advisory-locked database migration runner;
- protected CI with migration, TypeScript, ESLint, domain guards, PostgreSQL tests, build and runtime smoke;
- strict session and Admin control-plane authority on governed routes;
- transaction-coupled sensitive mutation evidence;
- server-authoritative Withdrawal admission, reads, cancellation, Admin transitions and external-effect evidence;
- API-key credential lifecycle with transactional audit evidence;
- explicit custody launch gates;
- explicit stop-limit rejection;
- browser-persistence guards for governed authority surfaces;
- fail-closed Community and AI trust boundaries.

### Remaining launch blockers

- unresolved P0/P1 security inventory outside completed slices;
- incomplete wallet providers and real-custody readiness;
- staging backup/restore, rollback and incident-response evidence;
- financial reconciliation and safety thresholds;
- remaining browser-persistence migrations for Academy/Arena product state;
- incomplete KYC/AML operational readiness;
- incomplete performance, alert-delivery and support-readiness evidence;
- governance approvals and final go/no-go sign-off.

### Signed API authentication — launch-disabled

No signed API endpoint is exposed. The dormant signed-auth adapter was removed by Issue #246. Credential lifecycle remains active for account-owned create/list/enable/disable/rotate/delete operations and remains transactionally evidenced.

Surface elimination closes SB-003 for soft launch after merge, QA evidence and security approval. Future signed API authentication requires a new P0 architecture/security review and must not be inferred from credential lifecycle capability.

---

## Scope

### In scope

- closure or explicit launch-disablement of every P0 security surface;
- authentication and authorization hardening;
- wallet/custody gating and critical provider fixes;
- trading validation and persistence verification;
- server-side data authority for launch-critical product state;
- protected test and negative-evidence coverage;
- deployment, rollback, backup/restore and incident-response readiness;
- monitoring, alert delivery and reconciliation;
- staging and soft-launch validation.

### Out of scope unless separately approved

- new consumer features unrelated to launch closure;
- public signed API authentication;
- full multi-tenant/white-label rollout;
- HSM/MPC production activation before provider and operational evidence exists;
- global/public launch optimization before soft-launch evidence;
- deletion or migration of historical `audit_events` data as part of source cleanup.

---

## 1. Security Hardening

### 1.1 P0 blockers

| ID | Current state | Required target | Acceptance evidence |
|---|---|---|---|
| SB-001 — CSRF | Governed routes enforce CSRF; inventory must remain complete | Every state-changing cookie-authenticated route is protected or explicitly exempt with reviewed server identity | API Security Manifest, source guard, negative cross-origin tests |
| SB-002 — Admin credential exposure | Governed Admin control plane exists | No raw Admin credential in browser-readable storage; strict session and step-up authority only | Admin boundary guard, session integration tests |
| SB-003 — Signed API replay | Signed API authentication surface removed | Keep signed API auth disabled; no route/header/adapter path; future activation requires P0 review | `SIGNED_API_AUTH_LAUNCH_POLICY.md`, zero-surface guard, API-key lifecycle tests |
| SB-004 — Mock KYC | Adapter behavior remains a compliance gate | Production must never issue mock KYC sessions | Production-negative tests and environment validation |
| SB-005 — HSM/MPC incomplete | Providers remain incomplete | Factory cannot select incomplete providers; real withdrawals remain custody-gated | custody guard, factory tests, environment validation |
| SB-006 — Internal price-feed mutation | Internal operation requires authoritative identity | Missing/invalid identity must reject; bounded request and rate limits required | API Manifest and negative tests |

### 1.2 API-key authority boundary

#### Credential lifecycle — active

Authority:

```text
src/lib/security/api-keys.ts
src/app/api/api-keys/route.ts
src/app/api/api-keys/[id]/route.ts
```

Required controls:

- strict canonical session;
- CSRF for mutations;
- server-derived principal and tenant context;
- cryptographic key generation and one-way storage;
- permission validation;
- rotation/revocation semantics;
- idempotency/revision controls where applicable;
- transaction-coupled `sensitive_mutation_audit_events` evidence;
- no plaintext credential in audit metadata.

#### Signed request authentication — disabled

There is no current route that authenticates a principal from API-key headers. Activation is blocked until a new design covers:

- route/method inventory;
- tenant and principal derivation;
- canonical request and body hashing;
- durable atomic nonce replay protection;
- timestamp and clock-skew policy;
- permission scopes;
- rate limiting and abuse controls;
- mutation idempotency;
- mandatory evidence;
- secret redaction;
- revocation propagation;
- outage and recovery behavior.

### 1.3 Mandatory audit authority

Sensitive credential, privacy, financial and privileged mutations must use transaction-coupled evidence or a reviewed durable outbox/state-machine authority.

The source-level best-effort audit writer is removed. Historical PostgreSQL `audit_events` rows are retained and are not authoritative proof of a sensitive mutation.

### 1.4 P1 security work

| Area | Required target | Blocking condition |
|---|---|---|
| Distributed rate limiting | High-risk operations must fail closed or use coordinated Redis authority | Multi-instance launch without coordinated limits |
| Local auth/persistence fallback | Production cannot use browser/file fallback as identity or account truth | Any launch-critical state dependent on local fallback |
| CSP | Explicit production allowlist; no broad accidental fallback | Unreviewed broad script/connect origins |
| Secret fan-out | One authoritative secret per credential class with rotation plan | Cross-purpose secret fallback remains |
| Admin browser state | No Admin credential in sessionStorage/localStorage | Any browser-readable Admin authority |

---

## 2. Authentication & Identity Hardening

### Required outcomes

- canonical session identity on all governed routes;
- strict revocation for financial, credential, privacy and Admin operations;
- explicit tenant/workspace/principal context where required;
- no caller-controlled actor/user/tenant audit identity;
- CSRF on browser-authenticated mutations;
- step-up authority for high-risk Admin and Withdrawal operations;
- server-side session/device history and revocation evidence;
- documented path toward unified identity without destabilizing launch-critical flows.

### Deferred architecture

A complete unified identity/cookie model may remain a later phase only when current identities are explicitly mapped and no route can cross account domains accidentally.

---

## 3. Wallet & Withdrawal Hardening

### 3.1 Established authorities

- strict server-owned Withdrawal read projection;
- canonical command and immutable request hash;
- one-time TOTP authorization;
- signed/fresh server-owned valuation evidence;
- fail-closed risk/compliance decisions;
- exact Decimal reservation and release;
- durable command receipts;
- Admin transition receipts and step-up evidence;
- admission outbox;
- persist-before-external-effect evidence;
- settlement/reconciliation guards;
- real-withdrawal custody launch gate.

### 3.2 Remaining wallet blockers

| Task | Required target | Launch rule |
|---|---|---|
| Bitcoin public-key/signing correctness | Valid reference-vector signatures | Disable BTC withdrawals until proven |
| Bitcoin multi-input signing | Every selected input signed correctly | Disable unsupported multi-input path |
| Ethereum nonce concurrency | Atomic nonce reservation and recovery | No concurrent real ETH withdrawals without proof |
| Tron provider | Correct implementation or explicit disablement | Do not claim support while broken |
| Solana SPL | Implement or clearly declare SOL-only | Explicit product limitation acceptable |
| HSM/MPC | Complete provider and operations evidence | Keep disabled for soft launch |
| Policy engine | Complete cache/contracts and strict limits | Do not activate incomplete policy path |
| Financial reconciliation | Ledger/balance/on-chain reconciliation with thresholds | Required before real-money launch |

---

## 4. Trading Engine Hardening

### Required outcomes

- stop-limit orders remain explicitly rejected until trigger authority exists;
- supported order types have deterministic validation tests;
- balance hold and order admission remain transactionally governed;
- restart/warm-start behavior preserves open-order state;
- single-instance versus multi-instance order-book mode is explicitly documented;
- any Redis order-book implementation must be complete before clustering;
- matching latency, stuck-loop and reconciliation alert thresholds are defined;
- no client/browser state becomes exchange authority.

### Accepted deferrals

A full single-transaction order+hold+match redesign and advanced stop-trigger engine may be deferred when current limitations are explicit and guarded.

---

## 5. Runtime & Infrastructure Hardening

### Required outcomes

- Node/npm versions pinned consistently across CI and deployment;
- graceful shutdown closes HTTP, WebSocket, Redis, BullMQ and database resources;
- single-instance launch topology documented unless distributed authorities are complete;
- health endpoint reflects critical dependency failure with `503`;
- migration runner executes once under advisory lock and is idempotent;
- no production placeholder secrets or unsafe feature flags;
- bounded request body authority on mutation routes;
- startup/runtime configuration validation fails before serving traffic.

---

## 6. Testing & QA Baseline

### Current protected evidence

Protected workflows include:

- clean and idempotent migrations;
- TypeScript and ESLint;
- repository hygiene;
- API Security Manifest;
- Sensitive Mutation Audit;
- authentication/session integration;
- AI Mentor red-team;
- Withdrawal PostgreSQL and external-effect tests;
- Academy, Arena, CRM, Offline, Wallet, Notification and Exchange guards;
- complete Node test suite;
- production build;
- development and production runtime smoke.

### Remaining QA requirements

- staging end-to-end test with production-like configuration;
- browser/device compatibility matrix;
- accessibility audit for key launch journeys;
- load/performance baseline;
- backup/restore drill;
- rollback drill;
- incident simulations;
- financial reconciliation drill;
- explicit skipped-test registry with owner and expiration.

---

## 7. Monitoring & Incident Readiness

### Minimum launch monitoring

- database and Redis health;
- auth/session anomalies;
- rate-limit saturation;
- Withdrawal admission/outbox/external-effect lag;
- signing and provider failures;
- balance/ledger reconciliation drift;
- order admission/matching failures;
- notification delivery failures;
- migration failure;
- AI provider/trust-boundary failures;
- critical security guard regression.

### Operational evidence

- alerts delivered to a tested external channel;
- ownership/on-call rotation defined;
- runbooks for DB down, Redis down, stuck Withdrawal, provider outage, migration failure, certificate failure and reconciliation drift;
- severity, escalation and acknowledgement rules documented.

---

## 8. Deployment, Backup & Rollback

### Required before soft launch

1. Clean staging deployment from documented steps.
2. Canonical migrations applied successfully and re-run idempotently.
3. Production environment validation passes.
4. Backup created and restored into an isolated environment.
5. Application rollback tested without corrupting database authority.
6. Migration rollback/forward-fix decision documented per migration class.
7. Restart and graceful shutdown verified.
8. Health and alerts verified after deployment and rollback.
9. Secrets rotation and incident access procedure documented.

---

## 9. Performance Baseline

Capture at minimum:

- public page response latency;
- authenticated API p50/p95/p99;
- database pool utilization;
- Redis latency and error rate;
- order admission latency;
- Withdrawal admission and queue lag;
- WebSocket connection capacity;
- memory/CPU under representative load;
- build/startup time;
- slow-query inventory.

Thresholds must be approved before Gate 6.

---

## 10. Execution Order

### Stage A — P0 security closure

- close/disable all P0 attack surfaces;
- preserve exact-head negative evidence;
- update official current-state documents;
- obtain Security/CTO review.

### Stage B — financial and custody closure

- fix or disable unsupported wallet providers;
- run reconciliation;
- verify Withdrawal external-effect and settlement recovery;
- keep real withdrawals disabled until custody sign-off.

### Stage C — operations and data integrity

- backup/restore;
- rollback;
- incident runbooks;
- alert delivery;
- server-side persistence closure for launch-critical state.

### Stage D — staging and QA

- full protected CI on the exact release candidate;
- production-like staging deployment;
- end-to-end, accessibility, performance and recovery tests;
- issue triage and regression closure.

### Stage E — soft-launch decision

- Gate 1–5 approvals complete;
- Gate 6 checklist complete;
- accepted risks named and time-bounded;
- final CEO/CTO/CSO/CPO/Compliance sign-off.

---

## 11. Go / No-Go Rules

Soft launch is blocked when any of the following is true:

- a P0 attack surface is active without approved evidence;
- a disabled surface can be activated accidentally through environment or routing;
- real-money Wallet/Withdrawal execution lacks custody and reconciliation evidence;
- launch-critical user state is browser-only authority;
- migrations, tests, build or runtime smoke fail on the exact release candidate;
- backup/restore or rollback is untested;
- critical alerts are not delivered;
- incident ownership is undefined;
- mandatory compliance or legal approval is missing.

A capability may be soft-launch-disabled instead of implemented only when:

- the disabled boundary is explicit in product and engineering documents;
- code/route activation is impossible or source-guarded;
- no UI falsely promises the capability;
- future activation requires a governed decision;
- disabling it does not break the launch promise.

---

## 12. Current SB-003 Decision

**Signed API authentication — launch-disabled.**

- No signed API endpoint is exposed.
- Dormant adapter and legacy writer are removed.
- Credential lifecycle remains active and transactionally evidenced.
- Surface elimination closes SB-003 for soft launch after merge, QA evidence and Security approval.
- Future activation requires a new P0 issue and the full control set in `docs/security/SIGNED_API_AUTH_LAUNCH_POLICY.md`.

---

## Approval Owners

- CEO — final business and risk acceptance;
- CTO / Chief Architect — technical authority and execution sequence;
- Chief Security Officer — P0 closure and negative evidence;
- Chief Product Officer — product truth and disabled-capability UX;
- Chief Compliance Officer — KYC/AML and regulatory readiness;
- SRE / DevSecOps — deployment, monitoring and recovery;
- QA Lead — exact-release-candidate evidence;
- Financial Systems / Custody owners — reconciliation and real-money readiness.

---

*Current production-hardening execution plan. Historical audit documents remain historical; current authority is defined by protected source, exact-head evidence and approved governance corrections.*
