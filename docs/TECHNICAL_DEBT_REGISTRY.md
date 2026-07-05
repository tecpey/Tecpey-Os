# Technical Debt Registry — Complete Inventory

**Date:** 2026-07-05
**Phase:** 39.5 — Strategic Freeze & TecPey DNA Synchronization
**Status:** Official — supersedes `docs/TECHNICAL_DEBT_REPORT.md` for debt items
**Classification:** Critical / High / Medium / Low

---

## Critical Debt — Blocks Production Release

### TD-C01 — localStorage as Source of Truth

- **Location:** `src/lib/academy-progress.ts`, `trading-arena.ts`, `trading-journal.ts`, `behavioral-engine.ts`, `spaced-repetition.ts`, `community-profile.ts`, `community-challenges.ts`, `smart-review.ts`
- **Impact:** Data loss on browser clear. No multi-device sync. No server-side analytics. GDPR export impossible. Leaderboard cannot be real.
- **Fix:** Phase 43 — Server-side persistence migration. SyncLayer abstraction.
- **Cost:** Large
- **Blocks:** Multi-device, GDPR, real leaderboard, analytics

### TD-C02 — No Database Migration System

- **Location:** `src/lib/db-schema.ts` — `CREATE TABLE IF NOT EXISTS` on connect
- **Impact:** Cannot detect schema drift. Cannot safely add columns. Cannot rollback. Race condition in multi-instance cold start.
- **Fix:** Phase 41 — Migration runner with `_migrations` table.
- **Cost:** Medium
- **Blocks:** Production schema evolution, multi-tenant rollout

### TD-C03 — Three-Cookie Authentication Split

- **Location:** `src/lib/session.ts`, `src/lib/academy-auth.ts`, `src/lib/academy-session.ts`, `src/lib/auth-session.ts`
- **Impact:** Complex session reconciliation. Three secrets to manage. Flat role enum.
- **Fix:** Phase 42 — Unified `TecPeyIdentity` JWT, single `tp_session` cookie.
- **Cost:** Large
- **Blocks:** Multi-tenancy, RBAC, SDK/OAuth

### TD-C04 — No Tenant Model

- **Location:** All database tables, all API routes, middleware
- **Impact:** Cannot serve B2B clients. Cannot implement white-label. No data isolation.
- **Fix:** Phase 44 — `tenants`, `tenant_memberships` tables, `tenant_id` on all tables.
- **Cost:** Large
- **Blocks:** Enterprise, white-label, multi-tenancy

### TD-C05 — HSM/MPC Wallet Incomplete

- **Location:** `src/lib/wallet/signing/keystore.ts`, untracked scaffold files
- **Impact:** Throws at runtime if selected by env. No production signing beyond hot wallet.
- **Fix:** Phase 40 — Complete HSM/MPC providers with feature gating.
- **Cost:** Large
- **Blocks:** Enterprise wallet, multi-signature security

### TD-C06 — No Test Runner

- **Location:** `package.json`, `src/tests/wallet/`
- **Impact:** 47 wallet tests cannot execute. No repeatable safety net.
- **Fix:** Phase 39.6 — Add test runner (vitest or node --test), wire wallet tests.
- **Cost:** Small
- **Blocks:** Confident release, CI regression detection

---

## High Debt

### TD-H01 — Mock KYC in Production

- **Location:** `src/lib/compliance/sumsub.ts`
- **Impact:** Mock sessions if Sumsub unconfigured
- **Fix:** Block mock sessions in production
- **Phase:** 39.6 (P0)

### TD-H02 — API Key Replay Disabled Without Redis

- **Location:** `src/lib/security/api-key-auth.ts`
- **Impact:** No replay protection when Redis unavailable
- **Fix:** Fail closed in production
- **Phase:** 39.6 (P0)

### TD-H03 — Per-Instance Rate Limiting

- **Location:** `src/lib/rate-limit.ts`
- **Impact:** No cross-instance rate limit coordination
- **Fix:** Require Redis REST in production
- **Phase:** 39.6

### TD-H04 — Raw Admin Token in Cookie/SessionStorage

- **Location:** `src/lib/admin-auth.ts`
- **Impact:** Cookie theft = token theft
- **Fix:** Replace with signed admin session
- **Phase:** 39.6 (P0)

### TD-H05 — Community Career Own DB Client

- **Location:** `src/lib/community-career.ts`
- **Impact:** Creates `new Client()` directly, bypasses pool limits
- **Fix:** Migrate to `withDb()` pool
- **Phase:** 41

### TD-H06 — Stop-Limit Accepted but Not Implemented

- **Location:** `src/lib/trading/validation.ts`
- **Impact:** Users can submit stop-limit orders that behave as limit
- **Fix:** Reject stop-limit with clear error
- **Phase:** 39.6 (P0)

### TD-H07 — Broad CSP Fallback

- **Location:** `deploy/nginx/tecpey.conf`
- **Impact:** CSP allows broad `https:`, `wss:` when env incomplete
- **Fix:** Tighten CSP in production mode
- **Phase:** 39.6

### TD-H08 — Bitcoin Provider Signs Only First Input

- **Location:** `src/lib/wallet/providers/bitcoin.ts`
- **Impact:** Multi-UTXO transactions are malformed
- **Fix:** Sign all inputs
- **Phase:** 40

### TD-H09 — Withdrawal Executor Public Key Bug

- **Location:** `src/lib/wallet/withdrawal-executor.ts`
- **Impact:** `getAddress()` returned as public key bytes (invalid BTC txs)
- **Fix:** Pass actual public key bytes
- **Phase:** 40

---

## Medium Debt

### TD-M01 — Chart Triple Stack
- **Location:** TradingView + Chart.js + Recharts
- **Impact:** Bundle size, maintenance overhead
- **Fix:** Consolidate to one chart library
- **Phase:** 45

### TD-M02 — Duplicate Icon Library
- **Location:** `lucide` + `lucide-react` in package.json
- **Impact:** Redundant dependency
- **Fix:** Remove `lucide` (code uses `lucide-react`)
- **Phase:** 45

### TD-M03 — Global Widgets in Root Layout
- **Location:** Navbar, Footer, GlobalAiMentorWidget in root layout
- **Impact:** Increased initial JS payload
- **Fix:** Lazy-load mentor widget
- **Phase:** 45

### TD-M04 — Visual-Only Contact Forms
- **Location:** `src/app/contact-us/`
- **Impact:** Submit via mailto, not real form handler
- **Fix:** Add backend handler or CTA
- **Phase:** 45

### TD-M05 — Shallow Academy Routes
- **Location:** Multiple academy routes
- **Impact:** Registered but content-light
- **Fix:** Deepen content or remove routes
- **Phase:** 45+

### TD-M06 — English Language/Direction Mismatch
- **Location:** Root HTML attributes before hydration
- **Impact:** Screen readers see wrong lang/dir
- **Fix:** Improve en layout strategy
- **Phase:** 45

### TD-M07 — Schema Dual Maintenance
- **Location:** `migrations/0001_initial_schema.sql` + `src/lib/db-schema.ts`
- **Impact:** Drift risk
- **Fix:** Single source of truth via migration runner
- **Phase:** 41

---

## Low Debt

- `react-icons` used alongside Lucide in selected UI (minor)
- `"use server"` mixed with edge-compatible auth modules
- Inconsistent card radius, color, dark-mode across components
- Multiple documentation files for deployment
- ESLint warnings exist (111 as of Phase 9.5)

---

## Debt Resolution Priority

| Priority | Debt Items | Target Phase |
|----------|-----------|-------------|
| P0 | TD-C06, TD-H01, TD-H02, TD-H04, TD-H06 | 39.6 |
| P1 | TD-C05, TD-H03, TD-H07, TD-H08, TD-H09, TD-C01 (start) | 40–43 |
| P2 | TD-C02, TD-C03, TD-C04, TD-H05, TD-M01–TD-M07 | 41–45 |
| P3 | Low items | 45+ |

---

*Technical debt registry for Phase 39.5. Supersedes the debt section of `docs/TECHNICAL_DEBT_REPORT.md`.*
