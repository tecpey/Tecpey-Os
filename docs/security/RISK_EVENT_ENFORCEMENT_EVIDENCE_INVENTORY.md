# Risk Event, Enforcement and Mandatory Evidence Inventory

Status: **P0 implementation inventory**  
Issue: **#197**  
Parents: **#161, #100, #156**  
Coordinates with: **#30, #109, #110**  
Inventory base: **`e71502509f6e860ecb31bf68d57f858ec32d57c8`**  
Owner: **security-platform / risk-platform**

## 1. Bounded objective

This slice replaces the currently active Redis-only risk restriction path with one PostgreSQL-authoritative risk-event and effective-enforcement authority. It covers detection decisions already emitted by the production Risk Engine, the effective trade/withdraw restriction read path, mandatory evidence and repairable Redis publication.

It does not redesign fraud scoring, AML/KYC, market surveillance, order risk validation, custody authorization or the platform-wide Red Team program.

## 2. Existing authority that must be preserved

The repository already has useful foundations:

- Exchange order admission, holds, outcomes and mandatory evidence are PostgreSQL-authoritative;
- withdrawal admission, Admin decisions, external effects and settlement are PostgreSQL-authoritative;
- API-key nonce replay protection fails closed in production when Redis is unavailable;
- sensitive mutation evidence provides typed, append-only, redacted and correlation-bound events;
- Redis is already treated as a projection in session, Exchange and withdrawal authorities;
- order and withdrawal callers resolve the authenticated principal server-side.

The new authority must not create a competing order, withdrawal, session, AML or custody decision engine.

## 3. Active production-path inventory

### 3.1 Exchange order route

**Path:** `src/app/api/orders/route.ts` — `POST /api/orders`

Current order:

1. strict canonical session and principal-scoped rate limit;
2. body, market, exact-string financial and idempotency validation;
3. `enforceTradeAllowed(userId)`;
4. fire-and-forget `checkOrderRisk(...)`;
5. balance/hold validation and canonical Exchange command admission.

**Current defect:** `enforceTradeAllowed()` reads only Redis and returns allowed on Redis absence/error. `checkOrderRisk()` is detached from the request and may later set a Redis restriction without durable state/evidence. A PostgreSQL restriction does not exist.

**Required disposition:** preserve the pre-admission gate, but resolve effective restriction from versioned Redis projection with PostgreSQL fallback. Unresolved durable authority must fail closed. Detector output must never retroactively claim it blocked an already-admitted order.

### 3.2 Risk detector

**Path:** `src/lib/security/risk-engine.ts`

Current detectors:

- `order_frequency_high`;
- `order_burst`;
- `ip_switch_detected`;
- `duplicate_request`;
- `suspicious_api_behavior`.

Current signals:

- Redis minute/burst counters;
- previous-IP cache;
- duplicate fingerprint cache;
- API-key request count cache.

Current persistence/enforcement:

- inserts `risk_events` through `withDb`;
- does not verify `withDb().enabled` before continuing;
- emits legacy `writeAudit({ action: "risk_event" })` after the insert;
- high severity calls `void setRiskLevel(..., "trade_blocked")`;
- duplicate medium calls `void setRiskLevel(..., "review")`;
- catches and suppresses all persistence/enforcement errors.

**Current defect:** event, effective restriction and audit evidence are three independent best-effort effects. Database failure may be treated as success, and Redis failure silently drops the restriction.

**Required disposition:** keep counters advisory, but route every emitted decision through one transaction-injected authority. A detector may remain asynchronous relative to the financial request only if it never reports or assumes enforcement until PostgreSQL commit succeeds.

### 3.3 Risk event table

**Current table:** `risk_events`

Current application writes user ID, event type, severity, market, IP and arbitrary JSON metadata.

**Current defects:**

- no canonical tenant identity;
- no deterministic decision/correlation identity;
- no explicit policy version;
- no bounded metadata contract at the authority boundary;
- no transaction coupling to effective enforcement or mandatory evidence;
- raw IP may be persisted and later copied to logs/audit;
- no append-only or replay-conflict authority is demonstrated.

**Required disposition:** retain legacy rows for compatibility, but introduce governed event identity and bounded fingerprints. New authoritative writes must be append-preserved and idempotent.

### 3.4 Effective restriction write path

**Path:** `src/lib/security/risk-enforcement.ts` — `setRiskLevel()` / `clearRiskLevel()`

Current state is stored only at `tecpey:risk:level:{userId}` with a Redis TTL.

Current behavior:

- missing Redis: silent no-op;
- Redis write failure: warning only;
- no tenant binding;
- no generation/version;
- no durable source event;
- no durable expiry or release transition;
- TTL disappearance is treated as release;
- Admin clear is not coupled to evidence.

**Required disposition:** PostgreSQL owns effective level, generation, reason/event binding and expiry. Redis carries a versioned projection only. Set, clear, expiry and override must be explicit durable transitions.

### 3.5 Effective restriction read path

**Paths:**

- `enforceTradeAllowed(userId)`;
- `enforceWithdrawAllowed(userId)`.

Current behavior returns `null` when Redis is absent, errors or has an unknown value.

Reachability:

- trade gate is active in `POST /api/orders`;
- withdrawal gate is only referenced by the legacy `withdrawal-service.ts`; the canonical withdrawal authority must remain independent and must not be replaced by this legacy service.

**Required disposition:** trade gate uses canonical tenant/principal context and resolves a durable restriction. Withdrawal integration may be added only at the canonical admission boundary after inventory proves the exact owner; do not re-activate `withdrawal-service.ts` as a competing authority.

### 3.6 Legacy withdrawal service

**Path:** `src/lib/security/withdrawal-service.ts`

Repository search finds no production import of `createWithdrawalRequest()`. The file contains legacy direct withdrawal creation, detached compliance updates and `writeAudit()` calls.

**Classification:** legacy/unreachable authority candidate. It must remain quarantined by source guards or be removed only after reference/build/runtime evidence. It must not be used as the risk-enforcement integration target.

### 3.7 API-key risk detector

`checkApiKeyRisk()` exists but repository search finds no active production caller. API-key request authentication itself has separate nonce and permission authority.

**Classification:** dormant detector. Keep it in inventory; do not claim production coverage or create a parallel API-key authority.

### 3.8 Logs and legacy audit

Current Risk Engine logs raw `userId` and calls fire-and-forget `writeAudit()` with event/severity/market metadata.

**Required disposition:** remove `writeAudit()` as mandatory evidence. Operational logs must use bounded fingerprints and may not contain raw IP, API-key ID, request/order fingerprint or unrestricted metadata.

## 4. Required canonical data model

### 4.1 Durable event

A governed event requires at minimum:

- tenant ID;
- event ID and deterministic correlation/request hash;
- principal fingerprint or canonical server principal reference;
- event type and severity allowlists;
- source and policy version;
- optional market fingerprint/normalized market;
- bounded detector facts;
- created timestamp;
- append-preserved semantics.

### 4.2 Effective enforcement

One current row per tenant/principal must contain:

- level: `none`, `review`, `trade_blocked`, `withdraw_blocked`, `all_blocked`;
- monotonic generation;
- source event binding;
- effective/expiry timestamps;
- transition reason category;
- updated timestamp.

### 4.3 Projection outbox

A durable outbox must identify:

- tenant/principal;
- enforcement generation;
- projected level and expiry;
- pending/published/dead-letter/completed state;
- attempt and retry facts;
- bounded failure category.

Redis values must carry the generation and expiry needed to reject stale projections.

## 5. Transaction contract

For every enforcement-producing decision, one PostgreSQL transaction must:

1. lock or serialize tenant/principal effective state;
2. admit/replay the deterministic risk event;
3. append the event row;
4. calculate and persist the deterministic effective level/generation/expiry;
5. append mandatory typed sensitive-mutation evidence;
6. create/update exact Redis projection debt;
7. commit before any caller reports the enforcement as durable.

Forced evidence failure must roll back all six authoritative mutations.

## 6. Gate contract

- Redis hit is accepted only when tenant/principal, generation and expiry are valid.
- Redis miss/error falls back to PostgreSQL.
- PostgreSQL unavailable or ambiguous for a financial mutation returns a truthful unavailable/retry response; it never silently allows.
- expired durable restrictions require a governed expiry transition and repairable cache publication.
- stale Redis block cannot override a newer durable clear generation.
- stale Redis allow/missing value cannot bypass a newer durable block generation.

## 7. Evidence and privacy contract

Proposed mandatory actions:

- `risk.event.record`;
- `risk.enforcement.apply`;
- `risk.enforcement.clear`;
- `risk.enforcement.expire`.

Proposed resources:

- `risk_event`;
- `risk_enforcement`.

Mandatory evidence may include bounded event type, severity, level, generation, policy version, normalized market and domain-separated fingerprints. It must exclude raw IP, raw API-key IDs, raw order/request fingerprints, credentials, tokens, cookies, request bodies and unrestricted metadata.

## 8. Implementation order

1. migration for durable events/effective state/projection outbox and database constraints;
2. typed actions/resources and redacted evidence builder;
3. transaction-injected risk authority;
4. versioned Redis publisher/repair command;
5. fail-closed read authority with PostgreSQL fallback;
6. detector migration away from `writeAudit()` / `void setRiskLevel()`;
7. exact order-route integration review;
8. legacy/dormant path quarantine;
9. source guards and adversarial PostgreSQL/Redis tests;
10. exact-head CI/security/build/runtime evidence.

## 9. Non-goals

This PR does not:

- enable real custody;
- replace Exchange order risk validation;
- implement AML/KYC or sanctions policy;
- build ML fraud scoring;
- activate dormant API-key risk detection;
- re-activate legacy withdrawal creation;
- complete tenant isolation #109 or operational drills #110.

## 10. Definition of done

The slice is complete only when event, effective enforcement, mandatory evidence and projection debt commit atomically; financial gates cannot silently allow on unresolved authority; Redis is versioned and repairable; all active paths are classified; and exact migrations, idempotency, source guards, focused tests, full suite, build and runtime smoke pass on one unchanged head.