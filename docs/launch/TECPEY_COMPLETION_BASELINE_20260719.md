# TecPey Completion Baseline — 2026-07-19

**Status:** Evidence-weighted post-authority baseline  
**Authority:** Updated only from merged code, exact-head CI, integration evidence and runtime verification—not file count or visual completeness  
**Related:** #26, #29, #30, #50 and `docs/architecture/TECPEY_BACKEND_AUTHORITY_MAP.md`

## 1. Executive result

TecPey requires two different completion percentages:

1. **Core Soft Launch readiness** — the minimum trustworthy journey for controlled initial users.
2. **Full TecPey OS vision** — multi-tenant, white-label, developer, enterprise, AI ecosystem and future financial platform.

### Current evidence-weighted estimates

- **Core Soft Launch point estimate: 70%**
- **Core Soft Launch uncertainty range: 67%–72%**
- **Full TecPey OS vision point estimate: 40%**
- **Full vision uncertainty range: 36%–43%**

The prior baseline was 59% for Soft Launch and 35% for the full vision. The increase is caused by merged authority and runtime-risk remediation—not documentation changes:

- Academy progression and rewards became server-issued;
- Trading Arena execution, production dashboard and journal became server-authoritative;
- Arena command recovery, revision and idempotency behavior gained permanent tests and guards;
- Wallet execution moved to database-authoritative values;
- signed withdrawals are durably persisted before RPC broadcast;
- BullMQ scheduling, watcher restoration and timeout coverage gained Redis-backed integration evidence.

**This is not a Go decision. Real-money launch remains NO-GO while any P0 release gate is open.**

## 2. Scoring model

Each domain is assessed across three evidence levels:

- **Implementation:** code, schema and product surfaces exist.
- **Integration:** identity, authorization, persistence, events and adjacent modules are connected.
- **Production verification:** concurrency, recovery, staging/runtime, operations, compliance and security evidence exist.

A domain with extensive code but missing custody, reconciliation or failure-recovery evidence cannot score as production-complete.

The baseline is an engineering decision aid, not a contractual schedule or marketing statement.

## 3. Core Soft Launch baseline

| Domain | Weight | Current score | Weighted contribution | Current evidence |
|---|---:|---:|---:|---|
| Platform, identity, security and Admin | 14% | 90% | 12.60 | Unified sessions, CSRF, revocation foundations, individual Admin identities, RBAC, Passkey-only Command Center, immutable audit and permanent CI guards are merged. Privileged-route completion, dual control and user-session retirement work remain. |
| Academy core and progression | 14% | 88% | 12.32 | Seven-term surfaces, normalized official progress, server-issued XP/achievement/term outcomes, flashcards, reflections and certificates are integrated. Staging cross-device Golden Path and full content/assessment QA remain. |
| Mentor AI and behavioral memory | 10% | 68% | 6.80 | Server profile, memory, conversations, Academy/Arena behavioral evidence and safe fallback exist. Durable write guarantees, provider gateway/timeouts/versioning/cost audit and deeper Exchange integration remain. |
| Trading Arena | 14% | 74% | 10.36 | `$100,000`, three attempts, PostgreSQL execution aggregate, orders, positions, fees, PnL, server prices, revision/idempotency, production UI and server-evidence journal are merged. Historical replay/scenarios, post-trade reflection API and staging recovery evidence remain. |
| Exchange core | 14% | 58% | 8.12 | Authenticated order, hold, matching, trade, ledger and audit foundations exist. Critical Decimal completion, deterministic recovery, order-book reconstruction and financial reconciliation remain P0. |
| Wallet and withdrawals | 10% | 58% | 5.80 | Database authority, worker claims, persist-before-broadcast, confirmation pipeline, safe job IDs, watcher restoration and Redis-backed lifecycle tests are merged. Production HSM/MPC custody, provider certification, testnet and ledger/on-chain reconciliation remain P0. |
| Compliance and trust operations | 7% | 43% | 3.01 | KYC/AML/risk adapter foundations exist. Production provider activation, jurisdiction/legal approval, negative tests and operations evidence remain. |
| QA, observability, deployment and recovery | 9% | 64% | 5.76 | CI now enforces environment contracts and browser/Admin/Academy/Arena/Wallet authority boundaries; Redis-backed Wallet lifecycle tests run. Backup/restore, rollback, DR, alert delivery and staging Golden Path remain. |
| UI/UX, accessibility, bilingual parity and Golden Path | 8% | 65% | 5.20 | Substantial FA/EN product surfaces and authoritative Arena failure states exist. One authoritative Design System, complete parity, accessibility, visual regression and end-to-end UX validation remain. |
| **Total** | **100%** |  | **69.97%** | Rounded baseline: **70%** |

### Honest interpretation

The platform is no longer mainly a prototype: several core domains now have real server authority, security gates and exact-head CI evidence. The remaining 30% is disproportionately difficult because it contains financial precision, custody, compliance and production operations—not merely missing screens.

## 4. Full TecPey OS vision baseline

The full vision deliberately includes capabilities that should not block the first controlled Soft Launch.

| Full-vision pillar | Weight | Current score | Weighted contribution |
|---|---:|---:|---:|
| Core production platform and initial product journey | 45% | 70% | 31.50 |
| Multi-tenant and white-label isolation | 12% | 10% | 1.20 |
| Developer platform, API contracts, SDKs and webhooks | 8% | 12% | 0.96 |
| Business/organization platform | 8% | 18% | 1.44 |
| AI Operating System, MCP and market intelligence | 8% | 22% | 1.76 |
| Mobile/PWA first-class product | 6% | 22% | 1.32 |
| Marketplace and broader financial ecosystem | 7% | 5% | 0.35 |
| Global scale, localization and multi-jurisdiction compliance | 6% | 20% | 1.20 |
| **Total** | **100%** |  | **39.73%** |

### Honest interpretation

- **Point estimate:** 40%
- **Reasonable uncertainty range:** **36%–43%**

The full-vision percentage remains much lower because tenant isolation, white-label operations, public developer contracts, broad enterprise capabilities, marketplace and multi-jurisdiction execution are intentionally future phases.

## 5. Evidence that materially changed this baseline

### Academy

- authoritative official lesson identities and normalized progress;
- server-issued progression and rewards;
- browser authority removed from official advancement paths;
- permanent Academy authority CI guard.

### Trading Arena

- Decimal/string execution aggregate in PostgreSQL;
- server-owned market snapshots and execution outcomes;
- revision, idempotency and transaction locking;
- authoritative production dashboard and journal;
- fail-closed market states;
- unresolved-command recovery preserving payload, attempt, revision and idempotency identity;
- permanent Arena UI authority guard and focused regression tests.

### Wallet

- authoritative database values instead of financial queue payloads;
- transaction claims and stale-job rejection;
- signed transaction persistence before broadcast;
- BullMQ-safe job IDs and withdrawal-level live-work deduplication;
- watcher restoration after terminal jobs;
- timeout-derived confirmation attempt budgets;
- Redis-backed lifecycle integration tests;
- permanent Wallet authority guard.

### Delivery discipline

- protected branch/PR/CI/Squash flow;
- production environment contract;
- exact-head TypeScript, ESLint, tests and Build;
- stale or unsafe PRs closed rather than merged;
- review findings fixed before merge.

## 6. Highest-impact remaining work

### P0 — blocks credible Soft Launch or real-money activation

1. **Exchange Decimal-safe matching and reconciliation (#30)**
   - remove remaining `number`, `parseFloat` and epsilon correctness paths;
   - prove order/trade/hold/balance/fee/ledger conservation;
   - prove accepted-order recovery and order-book reconstruction.

2. **Wallet production custody and provider certification (#29)**
   - production HSM/MPC custody;
   - per-chain deterministic fixtures and testnet evidence;
   - ambiguous RPC/database-loss drills;
   - withdrawal/ledger/on-chain reconciliation.

3. **Strict QA and operational proof (#50)**
   - staging Golden Path;
   - backup/restore and rollback;
   - disaster recovery and incident drills;
   - alert delivery and operational runbooks.

4. **Compliance activation**
   - KYC/AML provider credentials and negative tests;
   - jurisdiction and legal approval;
   - operational review and evidence retention.

### P1 — required for stable controlled operation

- user-session fail-closed policy and legacy-cookie retirement;
- Mentor durable-write/provider gateway/timeouts/version/cost audit;
- Admin privileged-route inventory, invitations, session/device operations and dual control;
- server-owned Arena historical scenarios/replay and post-trade reflections;
- remaining browser-persistence remediation;
- authoritative TecPey Design System, accessibility and visual regression;
- repository hygiene and governance reconciliation.

### P2 — platform expansion after core readiness

- full tenant isolation and white-label control plane (#20);
- developer platform, API contracts, SDKs and webhooks;
- business/organization platform;
- first-class mobile product parity;
- broader AI OS and MCP distribution;
- marketplace and advanced compliant financial ecosystem.

## 7. Percentage update rules

The baseline may increase only when evidence changes:

- code without integration tests: small increase;
- authority boundary plus CI and integration tests: meaningful increase;
- staging runtime and recovery evidence: production-readiness increase;
- documentation-only change: no readiness increase;
- cleanup with no risk/capability improvement: no completion increase;
- closing a financial, identity or durability P0: material increase;
- discovering a new production blocker may reduce the score.

## 8. Next recalculation gate

Recalculate after:

- Exchange Decimal/reconciliation milestone is merged;
- Wallet custody/provider certification reaches a governed release boundary;
- repository hygiene scan is complete;
- staging Golden Path and recovery drills are recorded;
- compliance activation evidence is reviewed.

At that point this document becomes the final controlled Soft Launch Go/No-Go baseline rather than an engineering progress estimate.
