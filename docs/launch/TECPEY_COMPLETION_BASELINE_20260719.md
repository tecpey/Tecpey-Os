# TecPey Completion Baseline — 2026-07-19

**Status:** Preliminary evidence-weighted baseline  
**Authority:** Must be updated from code, CI and runtime evidence—not perceived file count  
**Related:** #26 and `docs/architecture/TECPEY_BACKEND_AUTHORITY_MAP.md`

## 1. Why TecPey needs two percentages

TecPey has two materially different definitions of completion:

1. **Core Soft Launch readiness** — the minimum trustworthy product journey for initial controlled users.
2. **Full TecPey OS vision** — the broader multi-tenant, white-label, developer, enterprise, AI ecosystem and future financial platform.

Reporting only one percentage would either understate the substantial core implementation already delivered or overstate readiness for the complete long-term platform.

## 2. Scoring model

Each domain is assessed across three evidence levels:

- **Implementation:** code, schema and UI exist.
- **Integration:** the domain is connected to identity, persistence, events and adjacent modules.
- **Production verification:** concurrency, failure recovery, staging/runtime, operations and security evidence exist.

A domain with extensive code but missing recovery or runtime proof is not scored as complete.

The baseline is a decision-support estimate, not a contractual schedule or marketing statement.

## 3. Core Soft Launch baseline

| Domain | Weight | Current score | Weighted contribution | Evidence summary |
|---|---:|---:|---:|---|
| Platform, identity, security and Admin | 14% | 88% | 12.32 | Unified sessions, revocation, CSRF, Admin RBAC, Passkey-only Command Center, immutable audit and CI guards are merged. User-session fallback and complete privileged-route inventory remain. |
| Academy core and progression | 14% | 78% | 10.92 | Seven-term product surfaces, normalized lesson progress, server state, flashcards, reflections, certificates and cross-device persistence exist. Generic client-selected XP/badge/term mutations remain an integrity blocker. |
| Mentor AI and behavioral memory | 10% | 63% | 6.30 | Server profile/memory/conversations, behavioral context and safe fallback exist. Durable write guarantees, provider gateway/timeouts/versioning and full Arena/Exchange event depth remain. |
| Trading Arena | 14% | 39% | 5.46 | `$100,000`, three attempts and account-cycle persistence are merged. Full order/position/fill/PnL execution remains browser-authoritative and is the largest product gap. |
| Exchange core | 14% | 58% | 8.12 | Authenticated order, hold, matching, trade, ledger and audit flows exist. Decimal completion, recovery/reconciliation and distributed ownership remain. |
| Wallet and withdrawals | 10% | 36% | 3.60 | Build/sign/broadcast/confirm pipeline, queues and provider gates exist. Broadcast idempotency, DB authority, provider certification and custody operations remain P0. |
| Compliance and trust operations | 7% | 43% | 3.01 | KYC/AML/risk adapter foundations exist. Production provider activation, jurisdiction/legal approval and operational evidence remain. |
| QA, observability, deployment and recovery | 9% | 52% | 4.68 | CI, tests, health semantics, logging, metrics, alerts, queues and guarded startup exist. Backup/restore, rollback, DR, alert delivery and staging Golden Path evidence remain. |
| UI/UX, accessibility, bilingual parity and Golden Path | 8% | 58% | 4.64 | Substantial FA/EN surfaces and improved admin/security states exist. One authoritative design system, complete parity, accessibility/visual-regression coverage and end-to-end product validation remain. |
| **Total** | **100%** |  | **59.05%** | Rounded baseline: **59%** |

### Current honest range

- **Point estimate:** 59%
- **Reasonable uncertainty range:** **56%–64%**

The lower end reflects unresolved financial/recovery risk. The upper end reflects the large amount of implemented product and security foundation already present.

## 4. Full TecPey OS vision baseline

The full vision includes capabilities that are intentionally post-soft-launch.

| Full-vision pillar | Weight | Current score | Weighted contribution |
|---|---:|---:|---:|
| Core production platform and initial product journey | 45% | 59% | 26.55 |
| Multi-tenant and white-label isolation | 12% | 10% | 1.20 |
| Developer platform, API contracts, SDKs and webhooks | 8% | 12% | 0.96 |
| Business/organization platform | 8% | 18% | 1.44 |
| AI Operating System, MCP and market intelligence | 8% | 22% | 1.76 |
| Mobile/PWA first-class product | 6% | 22% | 1.32 |
| Marketplace and broader financial ecosystem | 7% | 5% | 0.35 |
| Global scale, localization and multi-jurisdiction compliance | 6% | 20% | 1.20 |
| **Total** | **100%** |  | **34.78%** |

### Current honest range

- **Point estimate:** 35%
- **Reasonable uncertainty range:** **30%–38%**

This lower percentage is expected: white-label, developer ecosystem, marketplace, advanced financial products and global operations were deliberately reserved until the core becomes safe and durable.

## 5. What is already a real strength

- substantial Academy product depth rather than an empty landing page;
- server-backed Academy state and official lesson progress;
- individual administrator identities, permissions, Passkey sessions and immutable audit;
- real Exchange order/hold/matching/ledger architecture;
- real Wallet/withdrawal pipeline structure with fail-closed incomplete signer gates;
- server-fed Mentor memory and behavioral analysis;
- automated CI covering TypeScript, ESLint, browser-persistence boundary, Admin auth boundary, tests and production build;
- explicit single-node matching safety instead of unsafe hidden scaling;
- permanent product principles protecting education-first and responsible trading.

## 6. Highest-impact remaining work

### P0 critical path

1. authoritative Trading Arena execution and Mentor event integration;
2. Academy server-issued reward/progression integrity (#28);
3. withdrawal DB authority and broadcast idempotency (#29);
4. Decimal-safe Exchange and reconciliation (#30);
5. production compliance provider and legal/jurisdiction activation;
6. backup/restore, rollback, DR, alerts and staging Golden Path evidence;
7. complete one controlled end-to-end user journey.

### P1 stabilization

- user-session fail-closed policy and legacy-cookie retirement;
- Mentor durable write/provider gateway/version audit;
- worker/process separation;
- Admin invitation, device/session inventory and dual control;
- remaining browser-persistence remediation;
- authoritative Design System and accessibility/visual-regression coverage;
- governance/documentation reconciliation and repository hygiene.

### P2 vision expansion

- full tenant isolation and white-label control plane;
- developer platform and public integration contracts;
- business/organization platform;
- mobile product at parity;
- broad AI OS/MCP distribution;
- marketplace and advanced compliant financial ecosystem.

## 7. Percentage update rule

The baseline may increase only when evidence changes. Examples:

- code exists but no integration test: small increase;
- CI and integration test pass: larger increase;
- staging runtime and recovery evidence pass: production-readiness increase;
- documentation-only claims: no readiness increase;
- deletion/refactor with no capability or risk improvement: no product-completion increase;
- closing a P0 financial or data-integrity risk: materially increases readiness.

## 8. Next recalculation gate

Recalculate after all of the following:

- clean authoritative Arena execution PR merged;
- Academy reward-integrity PR merged;
- withdrawal-idempotency PR merged;
- Exchange Decimal/reconciliation milestone merged;
- repository hygiene scan completed;
- staging Golden Path and recovery evidence recorded.

At that point the estimate becomes the Soft Launch Go/No-Go baseline rather than a preliminary engineering estimate.
