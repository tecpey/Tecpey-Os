# TecPey — Architecture Review

**Phase 19 | Senior Architect Assessment**
**Date:** 2026-06-28
**Scope:** All modules built in Phases 0–18
**Reviewers:** Architecture, Security, SaaS, QA lenses applied simultaneously

---

## Executive Summary

TecPey has been built phase-by-phase as a product-first monolith. The result is a working, testable, deployable platform that delivers real value today. However, several architectural decisions made in early phases now create compounding friction that will become blocking constraints at scale. This review identifies every risk before it calculates compound interest.

**Overall verdict:** The foundation is salvageable and partially excellent. Four categories of structural debt require refactoring before Phase 20+.

---

## 1. Identity & Authentication

### 1.1 Current State

Three independent JWT systems coexist:

| Cookie | Secret | Purpose | Location |
|---|---|---|---|
| `user_session` | `TECPEY_SESSION_SECRET` \| `JWT_SECRET` \| `NEXTAUTH_SECRET` | Market/platform user | `src/lib/session.ts` |
| `tecpey_academy_auth` | `TECPEY_ACADEMY_AUTH_SECRET` | Academy account login | `src/lib/academy-auth.ts` |
| `tecpey_student_session` | `TECPEY_ACADEMY_AUTH_SECRET` (same) | Student profile JWT | `src/lib/academy-session.ts` |
| `tecpey_admin_session` | `TECPEY_ADMIN_TOKEN` | Admin panel | `src/lib/admin-auth.ts` |

`src/lib/auth-session.ts` wraps these into a `CanonicalSession` with a `TODO(cookie-migration)` note acknowledging the problem.

### 1.2 Problems Identified

**CRITICAL — Secret fan-out:** `user_session` falls back through three secrets (`TECPEY_SESSION_SECRET`, `JWT_SECRET`, `NEXTAUTH_SECRET`). Any of these secrets compromising the others is a silent security regression.

**HIGH — Three cookies for one user:** A single student may hold `tecpey_academy_auth` + `tecpey_student_session` simultaneously, representing the same identity with two different payloads and one shared secret. This is not two-factor — it is confusion.

**HIGH — Admin auth uses sessionStorage:** `admin-auth.ts` documents that admin tokens are stored in JavaScript-readable `sessionStorage`. This makes admin credentials XSS-extractable.

**MEDIUM — No unified role model:** `role: "academy_user" | "student" | "user" | "guest"` is a flat enum with no permission hierarchy, no scope system, no tenant binding.

**MEDIUM — No refresh token:** JWTs expire and the user must re-login. No sliding session, no refresh.

**LOW — `"use server"` mixed with edge-compatible auth:** `session.ts` uses `"use server"` (Node.js only). `auth-session.ts` is edge-compatible. Both read user identity. Inconsistent deployment model.

### 1.3 Required Redesign (Phase 20+)

Collapse to a single unified identity model:

```
User → has one Identity (email + verified status)
Identity → belongs to one or more Tenants (via TenantMembership)
TenantMembership → has one Role (per tenant)
Role → has zero or more Permissions
```

Single JWT per session. Role and tenant embedded as claims. Admin access as a permission, not a separate cookie.

---

## 2. Data Persistence Split

### 2.1 Current State

TecPey uses two fundamentally different persistence models simultaneously:

**Server-side (PostgreSQL via `src/lib/db.ts`):**
- Academy authentication accounts
- Student profiles and progress (partial)
- Mentor profiles and conversations
- Certificates
- Achievements
- Leads

**Client-side (localStorage):**
- Academy lesson progress: `src/lib/academy-progress.ts`
- Trading Arena state: `src/lib/trading-arena.ts`
- Trading journal: `src/lib/trading-journal.ts`
- Behavioral engine inputs: `src/lib/behavioral-engine.ts`
- Spaced repetition deck: `src/lib/spaced-repetition.ts`
- Community profile: `src/lib/community-profile.ts`
- Challenge participation: `src/lib/community-challenges.ts`
- Community leaderboard scores: derived from localStorage
- Smart review reflections: `src/lib/smart-review.ts`

### 2.2 Problems Identified

**CRITICAL — Cross-device impossibility:** A student who studies on mobile and trades on desktop has split progress. The behavioral engine will see incomplete data on either device.

**CRITICAL — Behavioral engine not tenant-aware:** `computeBehavioralSnapshot()` reads directly from `localStorage`. It cannot be called server-side, cannot be audited, cannot be replicated, and cannot be analyzed in aggregate.

**HIGH — No data portability:** Students cannot export, back up, or migrate their trading history, journal, or behavioral scores. GDPR "right to export" is unimplementable.

**HIGH — No data durability:** If a user clears browser storage, their entire learning history, behavioral DNA, and trading journal are permanently lost. No recovery path exists.

**HIGH — Leaderboard is not real:** The community leaderboard generates LCG demo peers because there is no server-side aggregation of behavioral scores. This is acceptable as a Phase 18 placeholder but is architecturally incorrect for a real leaderboard.

**MEDIUM — community-career.ts opens its own pg Client:** `src/lib/community-career.ts` creates `new Client()` directly instead of using the shared `withDb()` pool. This bypasses pool limits, connection monitoring, and the schema-init guard.

**LOW — Phase-named production file:** `src/lib/phase5-achievement-engine.ts` embeds a phase number in a production library filename. Phase numbers are ephemeral; library names should be permanent.

### 2.3 Required Redesign

All behavioral, trading, and community data must move to server-side persistence. localStorage is acceptable only for offline caching (read-cache of server data, not source of truth).

Define a **Sync Boundary**:
- Source of truth: PostgreSQL (server)
- Cache: localStorage (read-only mirror, sync-on-load)
- Conflict resolution: server wins; last-write-wins with client timestamp

---

## 3. API Layer

### 3.1 Current State

50+ API routes exist under `src/app/api/`. No versioning prefix. Mixed naming conventions:

```
/api/academy-auth/          ← dash-separated
/api/academy/auth/login     ← slash-separated sub-routes (same domain)
/api/ai-mentor              ← v1
/api/ai-mentor-v2           ← v2 (coexists indefinitely)
/api/mentor-*               ← 7 mentor-prefixed routes
```

### 3.2 Problems Identified

**CRITICAL — No API versioning:** `/api/ai-mentor` and `/api/ai-mentor-v2` are parallel routes with no deprecation contract, no migration timeline, and no documented difference. Future API consumers (SDK, mobile, third-party) cannot pin to a version.

**HIGH — Dual academy-auth paths:** `/api/academy-auth/` (flat) and `/api/academy/auth/` (nested) both exist and serve the same domain. The middleware routes to one; the other may be unreachable or redundant.

**HIGH — No service layer:** API routes call `withDb()` directly. There is no service object, repository, or domain layer. Business logic is scattered across route handlers and lib functions with no clear ownership boundary.

**HIGH — No pagination standard:** No route documents a pagination protocol. At scale, list endpoints (`/api/mentor-conversations`, `/api/achievements`) will return unbounded result sets.

**MEDIUM — Rate limiting not tenant-scoped:** `rateLimit()` keys by IP or `identity`. It is not aware of tenant, plan tier, or API key. At Enterprise SaaS scale, a tenant's heavy usage should not affect another tenant's quota.

**MEDIUM — CSRF origin check only:** `verifyCsrfOrigin()` checks the `Origin` header. Origin header can be spoofed in non-browser contexts. Enterprise APIs require token-based CSRF (double-submit cookie or HMAC-signed token).

**LOW — Redis rate limit falls back silently to memory:** If Redis is unavailable, rate limiting continues in-memory with no alert. In a multi-instance deployment, each instance has a separate in-memory counter, making the limit N × configured limit.

### 3.3 Required Redesign

Adopt explicit API versioning from Phase 20:

```
/api/v1/mentor/conversations
/api/v1/academy/progress
/api/v2/mentor/ask
```

Introduce a thin service layer per domain:

```
src/services/
  academy/
  mentor/
  community/
  identity/
  exchange/
```

API routes become thin controllers that delegate to services.

---

## 4. Database Layer

### 4.1 Current State

`src/lib/db.ts` provides a shared `Pool` with `withDb()`. `src/lib/db-schema.ts` calls `initSchema()` on first connection, which runs `CREATE TABLE IF NOT EXISTS` DDL statements.

### 4.2 Problems Identified

**CRITICAL — Schema-on-connect anti-pattern:** Running DDL on every cold start is dangerous for:
- Multi-instance deployments (race condition on first deploy)
- Schema changes (cannot detect divergence from expected state)
- Rollback (cannot undo `CREATE TABLE IF NOT EXISTS`)
- Auditing (no migration history)

**HIGH — No migration system:** There is no Flyway, Liquibase, or custom migration runner. Adding a column to a table requires manual SQL or a new `ALTER TABLE IF NOT EXISTS` in `initSchema()`.

**HIGH — No connection-level tenant isolation:** All queries execute as a single DB user. Multi-tenant data is separated by `student_id` or `tenant_id` column only — no row-level security, no schema-per-tenant, no connection routing.

**MEDIUM — No read replicas:** All reads and writes go to the same `Pool`. Read-heavy operations (leaderboard, behavioral analysis, certificate lookup) compete with writes on a single connection pool.

**MEDIUM — No query instrumentation:** No query timing, no slow query log, no N+1 detection. Observability is zero at the DB layer.

**LOW — `Pool.max: 10` is hardcoded:** Connection pool size should be configurable via environment variable to adapt to different deployment sizes.

### 4.3 Required Redesign

Adopt a migration-based schema management system (Drizzle Kit or a custom numbered-migration runner). Separate DDL from application startup entirely.

---

## 5. Multi-Tenancy Readiness

### 5.1 Current State

Zero tenant isolation. All data is global. The only isolation is per-`student_id` or per-`user_id` column filtering, which is implemented inconsistently.

### 5.2 Problems Identified

**CRITICAL — No tenant concept in data model:** No `tenant_id` column exists on any table. Adding multi-tenancy later requires:
- Schema migration on every table
- Backfilling all existing rows with a "default tenant" ID
- Auditing every query to add `AND tenant_id = $n`
- Testing every permission boundary

**CRITICAL — No tenant-aware configuration:** Rate limits, AI model selection, feature flags, and branding are all global. An Enterprise SaaS tenant needs per-tenant configuration of each of these.

**HIGH — No tenant context in middleware:** `middleware.ts` routes by path only. It has no concept of which tenant is serving the request.

### 5.3 Required Redesign (see PLATFORM_BLUEPRINT_v2.md)

Define the Tenant model now. Add `tenant_id` to all future tables. Accept that existing tables will require migration.

---

## 6. Observability

### 6.1 Current State

No structured logging. No distributed tracing. No error alerting. `console.error` exists in `db.ts` and some API routes. The only health check is `GET /api/health`.

### 6.2 Problems Identified

**CRITICAL — Zero production observability:** When a production failure occurs, diagnosis requires reading raw server logs (if they exist) with no structure, no correlation IDs, no trace.

**HIGH — No alerting:** DB pool errors log to stdout. If the pool exhausts, it logs and blocks — no alert fires.

**MEDIUM — Health check is not deep:** `GET /api/health` returns static JSON. It does not test DB connectivity, Redis connectivity, or AI API reachability.

---

## 7. Frontend Architecture

### 7.1 Strengths (Preserved)

- RSC + client component split is well-reasoned
- RTL/LTR dual architecture is clean
- Design system tokens in `globals.css` are consistent
- `ContentShell` and `ContentUI` wrapping patterns are good

### 7.2 Problems Identified

**HIGH — Behavioral engine is client-only:** `computeBehavioralSnapshot()` and `collectInputs()` call `localStorage` directly. This means behavioral data cannot be computed server-side, cannot be used in SSR metadata, and cannot be aggregated for analytics.

**MEDIUM — No component library boundary:** Components in `src/components/` are organized by feature, not by abstraction level. There is no documented distinction between "primitive UI", "domain component", and "page section".

**MEDIUM — Hardcoded content in `src/data/`:** Academy curriculum, coin knowledge, SEO keywords, and mentor guides are TypeScript objects in `src/data/`. Adding a new lesson requires a code deploy. This is not sustainable past 100 lessons.

**LOW — Some pages are placeholder shells:** `src/app/academy/portfolio-lab/page.tsx`, `psychology-lab`, `practice-lab`, and ~15 others appear to be route-registered placeholders without implemented content.

---

## 8. AI Integration

### 8.1 Current State

Two AI routes: `/api/ai-mentor` (v1) and `/api/ai-mentor-v2`. Both call Anthropic API via raw `fetch`. Prompt construction is inline in route handlers. No prompt versioning. No token budget management. No fallback model. No AI response caching.

### 8.2 Problems Identified

**HIGH — No prompt versioning:** Prompts are strings embedded in route handlers. Changing a prompt is a code change + deploy. Prompt A/B testing is impossible.

**HIGH — No token budget:** A malicious student sending a very long conversation history can generate arbitrarily large API bills. No context window truncation strategy is documented.

**HIGH — No fallback:** If the Anthropic API is unavailable, the mentor returns a 500. No graceful degradation (cached last response, educational static fallback).

**MEDIUM — Model selection hardcoded in env var:** `ANTHROPIC_MENTOR_MODEL` is a single env var. There is no per-tenant model selection, no tiered model quality by plan.

**LOW — No AI response logging:** Mentor responses are not logged (for quality review, safety audit, or improvement). This is appropriate for privacy in Phase 18 but must be addressed for enterprise compliance.

---

## 9. Security Assessment

### 9.1 Strengths

- CSRF origin checks on all state-changing routes
- JWT secrets fail-closed when missing
- `httpOnly` cookies throughout
- Rate limiting on sensitive endpoints
- Password minimum enforced

### 9.2 Gaps

**HIGH — Admin uses sessionStorage:** Admin token in `sessionStorage` is XSS-accessible. Must move to `httpOnly` cookie.

**HIGH — SQL queries not audited for injection:** `withDb()` is used with parameterized queries in some routes, but consistency across all 50+ routes is unverified. A systematic audit is required.

**HIGH — No input validation framework:** Each route validates its own input ad-hoc. There is no shared schema validation (Zod or equivalent) enforced at the API boundary.

**MEDIUM — Rate limit bypass in multi-instance:** In-memory rate limit fallback is per-process. With PM2 cluster mode or multiple Docker containers, each instance has its own counter.

**LOW — `poweredByHeader: false` is set** ✓ — fingerprinting mitigated

---

## 10. Engineering Process Gaps

| Gap | Severity | Impact |
|---|---|---|
| No database migration system | Critical | Cannot safely evolve schema in production |
| No structured logging | Critical | Zero production debugging capability |
| No API versioning | High | Cannot ship breaking changes safely |
| No integration tests | High | Behavioral regressions not caught |
| `phase5-achievement-engine.ts` naming | Low | Cosmetic but signals process debt |
| Placeholder pages registered as routes | Low | 404-risk if user navigates directly |
| community-career.ts uses raw pg Client | High | Pool isolation broken |
| localStorage as source of truth | Critical | No durability, no multi-device |

---

## Summary Scorecard

| Domain | Score | Status |
|---|---|---|
| Identity & Auth | 4/10 | Needs consolidation |
| Data Persistence | 3/10 | Critical split — localStorage cannot scale |
| API Design | 5/10 | Functional but unversioned and unstructured |
| Database Layer | 4/10 | Schema-on-connect must be replaced |
| Multi-Tenancy | 1/10 | Not implemented; must be designed in |
| Observability | 2/10 | Almost zero; blocking for production ops |
| Frontend | 7/10 | Solid foundations, some hardcoded content |
| AI Integration | 5/10 | Works; no resilience or versioning |
| Security | 6/10 | Good baseline; gaps are addressable |
| Engineering Process | 5/10 | CI exists; migration/testing culture needed |

**Overall Platform Readiness for Enterprise SaaS: 4.2/10**
Good enough to ship a Phase 1 product. Not acceptable for a multi-tenant, multi-market, investor-grade platform.
