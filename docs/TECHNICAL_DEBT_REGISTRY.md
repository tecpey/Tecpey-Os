# Technical Debt Registry — Current Inventory

**Original date:** 2026-07-05  
**Current-state correction:** 2026-07-21 — through Issue #246  
**Phase:** 39.5 / Production Hardening  
**Status:** Official — supersedes the debt section of `docs/TECHNICAL_DEBT_REPORT.md`  
**Classification:** Critical / High / Medium / Low / Resolved or Launch-Disabled

---

## Registry Rules

A debt item is:

- **Open** when the risky capability or missing authority remains active;
- **Launch-disabled** when the capability is deliberately unavailable and CI prevents accidental activation;
- **Resolved** only when implementation, negative evidence and governance are complete;
- **Historical** when the original finding is retained for traceability but no longer describes current source authority.

Exact-head CI evidence overrides stale file-location assumptions.

---

## Critical Debt — Open

### TD-C01 — Browser Persistence as Source of Truth

- **Status:** Open
- **Location:** Remaining Academy, Arena, journal, spaced-repetition and behavioral browser-state inventory
- **Impact:** Device-local loss, incomplete multi-device history, weak analytics/export authority
- **Required fix:** Phase 43 server-side persistence migration with backend database as source of truth
- **Blocks:** Complete Academy/Arena trust, multi-device continuity, real leaderboard and reliable Mentor history

### TD-C03 — Fragmented Identity and Session Model

- **Status:** Open with governed current boundaries
- **Location:** session, Academy auth/session and canonical auth-session modules
- **Impact:** Multiple identity domains and cookies increase reconciliation and authorization complexity
- **Required fix:** Phase 42 unified identity plan without weakening current strict-revocation boundaries
- **Blocks:** Clean multi-tenancy, OAuth/SDK and unified RBAC

### TD-C04 — Incomplete Tenant Model

- **Status:** Open
- **Location:** Cross-domain schema and route inventory
- **Impact:** White-label isolation and B2B tenancy are incomplete
- **Required fix:** Phase 44 tenant/workspace model, isolation tests and migration strategy
- **Blocks:** Enterprise and white-label launch

### TD-C05 — Production HSM/MPC Incomplete

- **Status:** Launch-disabled
- **Location:** wallet signing/provider scaffolding
- **Impact if activated:** Signing failure or incomplete custody authority
- **Current safety:** Custody launch gates prevent incomplete provider activation
- **Required fix:** Complete provider, key lifecycle, operational recovery and audit evidence before activation
- **Blocks:** Enterprise custody; does not block soft launch when real withdrawals/providers remain disabled

---

## Critical Debt — Resolved or Superseded

### TD-C02 — No Database Migration System

- **Status:** Resolved / historical finding
- **Current authority:** Canonical advisory-locked migration plan with migration ledger, clean-run and idempotency CI evidence
- **Residual work:** Continue enforcing one canonical plan and prohibit ad-hoc schema authority

### TD-C06 — No Test Runner

- **Status:** Resolved / historical finding
- **Current authority:** Node test runner, focused domain suites, PostgreSQL/Redis integration tests, protected Full Suite and CI
- **Residual work:** Maintain skipped-test registry, browser E2E and coverage reporting

---

## High Debt — Open

### TD-H01 — Production KYC/AML Readiness

- **Status:** Open
- **Location:** compliance provider adapters and environment policy
- **Impact:** Compliance failure or misleading product claims when providers are unconfigured
- **Required fix:** Production-negative behavior, provider evidence, operations and compliance sign-off

### TD-H03 — Distributed Rate-Limit Coordination

- **Status:** Open by operation class
- **Location:** `src/lib/rate-limit.ts` and route inventories
- **Impact:** Multi-instance bypass or degraded abuse control
- **Required fix:** Coordinated Redis authority or explicit fail-closed policy for high-risk operations

### TD-H04 — Historical Admin Credential Paths

- **Status:** Governed replacement implemented; final inventory/sign-off still required
- **Current authority:** Admin control plane, strict session, permission and step-up evidence
- **Required fix:** Continue proving no browser-readable raw Admin credential path exists

### TD-H05 — Community Career Database Boundary

- **Status:** Open where direct client creation remains
- **Impact:** Pool bypass, inconsistent transaction and tenant context
- **Required fix:** Migrate to canonical database/tenant authority

### TD-H07 — Broad CSP Fallback

- **Status:** Open
- **Location:** production Nginx/security headers
- **Impact:** Expanded XSS/connect surface when environment configuration is incomplete
- **Required fix:** Explicit production allowlist and deployment test

### TD-H08 — Bitcoin Multi-Input Signing

- **Status:** Open or provider-disabled
- **Impact:** Malformed transaction when multiple UTXOs are selected
- **Required fix:** Sign every input with reference vectors before enabling the path

### TD-H09 — Bitcoin Public-Key / Executor Correctness

- **Status:** Open or provider-disabled
- **Impact:** Invalid Bitcoin transaction construction
- **Required fix:** Correct key material and reference-vector tests before enabling real BTC withdrawals

---

## High Debt — Resolved or Launch-Disabled

### TD-H02 — Signed API Replay Without Durable Nonce Authority

- **Status:** Launch-disabled by surface elimination; closure pending merge/security review
- **Original finding:** A dormant signed HMAC adapter could skip nonce replay protection when Redis was unavailable
- **Current state:** No signed API authentication route exists; dormant adapter removed; old source path is guarded
- **Active independent capability:** API-key credential create/list/enable/disable/rotate/delete remains transactionally evidenced
- **Future fix:** New P0 design required before signed API authentication can exist
- **Policy:** `docs/security/SIGNED_API_AUTH_LAUNCH_POLICY.md`

### TD-H06 — Stop-Limit Accepted but Not Implemented

- **Status:** Resolved by explicit rejection
- **Current authority:** Unsupported stop-limit orders fail clearly and cannot enter the order book
- **Future work:** Trigger-engine design is a separate feature, not a hidden debt path

---

## Medium Debt

### TD-M01 — Chart Library Multiplicity

- **Status:** Open
- **Impact:** Bundle and maintenance overhead
- **Target:** Consolidate according to product/design requirements

### TD-M02 — Icon Library Multiplicity

- **Status:** Open
- **Impact:** Redundant dependency and inconsistent iconography
- **Target:** Consolidate under Design System governance

### TD-M03 — Global Widget Payload

- **Status:** Open
- **Impact:** Initial JavaScript and rendering overhead
- **Target:** Lazy loading and route-aware activation

### TD-M04 — Contact Surface Reliability

- **Status:** Open
- **Impact:** Visual submit actions may not create a support record
- **Target:** Server-backed CRM/support intake or explicit CTA semantics

### TD-M05 — Shallow Academy Routes

- **Status:** Open by content inventory
- **Impact:** Product trust and incomplete learning journeys
- **Target:** Deepen or remove routes before claiming completion

### TD-M06 — Language/Direction Before Hydration

- **Status:** Open
- **Impact:** Accessibility and semantic mismatch for English routes
- **Target:** Server-correct `lang`/`dir` strategy

### TD-M07 — Historical Schema/Documentation Duplication

- **Status:** Reduced, not fully closed
- **Current authority:** Canonical migration runner exists
- **Residual risk:** Historical SQL/schema documents can be mistaken for live authority
- **Target:** Clearly mark generated/historical artifacts and keep one executable migration plan

### TD-M08 — Historical `audit_events` Governance

- **Status:** Data-governance debt, not source mutation authority
- **Current state:** Source-level best-effort writer removed; historical table/rows retained
- **Required decision:** Retention, export, archival, access control and lawful deletion policy
- **Constraint:** Historical rows must not be modified as part of source cleanup

---

## Low Debt

- selected mixed icon usage;
- selected edge/server module-boundary cleanup;
- inconsistent component radii/color/dark-mode outside final Design System phase;
- duplicated historical deployment documentation;
- stale historical audit documents that require clear archival labeling;
- incomplete automated browser accessibility and visual-regression coverage.

---

## Current Resolution Priority

| Priority | Open debt | Target |
|---|---|---|
| P0 | TD-H01, remaining SB-001/SB-002/SB-004/SB-005/SB-006 evidence, real-money custody/reconciliation | Before Gate 6 |
| P1 | TD-C01, TD-H03, TD-H04, TD-H07, TD-H08, TD-H09, operational recovery | Phase 40–43 |
| P2 | TD-C03, TD-C04, TD-H05, TD-M01–TD-M08 | Phase 41–45 |
| P3 | Low items and optimization | 45+ |

---

## Resolved/Disabled Evidence Rules

A resolved or launch-disabled item must retain:

1. source or route absence/implementation evidence;
2. a permanent guard or negative test;
3. official current-state documentation;
4. an explicit future-activation rule when disabled;
5. exact-head protected workflow evidence;
6. named review/approval before merge.

---

*Current technical-debt registry. Historical findings remain traceable but must not override current protected source authority and exact-head evidence.*
