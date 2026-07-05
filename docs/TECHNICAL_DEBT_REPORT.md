# TecPey — Technical Debt Report

**Status: PARTIALLY SUPERSEDED** — Debt section superseded by `docs/TECHNICAL_DEBT_REGISTRY.md` (Phase 39.5)
Reason: The registry provides a living inventory with priority, target phase, and cross-references. This report's architecture review, methodology, and context sections remain valid. Debt items migrated to registry.
This document is retained for historical reference.
**Date:** 2026-06-28
**Classification:** Critical / High / Medium / Low

Debt is catalogued by domain, not by phase. Each item has a fix strategy and a cost estimate (relative: Small / Medium / Large).

---

## Critical Debt

Items that will block enterprise readiness or cause data loss.

---

### TD-C01 — localStorage as Source of Truth

**Location:** `src/lib/academy-progress.ts`, `trading-arena.ts`, `trading-journal.ts`, `behavioral-engine.ts`, `spaced-repetition.ts`, `community-profile.ts`, `community-challenges.ts`, `smart-review.ts`

**Impact:** Data loss on browser clear. No multi-device sync. No server-side analytics. GDPR export impossible. Community leaderboard cannot be real.

**Fix:** Introduce a `SyncLayer` abstraction. All write operations write to server API first; localStorage becomes a read cache. For offline scenarios, use a queue that flushes on reconnect.

**Cost:** Large (requires new API routes, schema additions, and client sync logic for 8+ data domains)

**Blocks:** Multi-device, GDPR compliance, real leaderboard, analytics

---

### TD-C02 — No Database Migration System

**Location:** `src/lib/db-schema.ts` — uses `CREATE TABLE IF NOT EXISTS` on connect

**Impact:** Cannot detect schema drift in production. Cannot safely add columns. Cannot rollback schema changes. Race condition in multi-instance deployments during cold start.

**Fix:** Adopt numbered migration files (e.g., `migrations/0001_init.sql`, `0002_add_tenant_id.sql`). Run migrations as a pre-deploy step, not at runtime. Use a migration lock table to prevent concurrent runs.

**Cost:** Medium (migration runner is a small tool; the real cost is converting existing DDL to numbered migrations)

**Blocks:** Production schema evolution, multi-tenant rollout

---

### TD-C03 — Three-Cookie Authentication Split

**Location:** `src/lib/session.ts`, `src/lib/academy-auth.ts`, `src/lib/academy-session.ts`, `src/lib/auth-session.ts`

**Impact:** Complex session reconciliation on every request. Three secrets to manage. Role model is a flat enum. No tenant binding possible. The `TODO(cookie-migration)` has been in the codebase since at least Phase 8.

**Fix:** Design a unified `TecPeyIdentity` JWT:
```json
{
  "sub": "user_uuid",
  "email": "user@example.com",
  "tenant": "default",
  "roles": ["academy:student", "exchange:user"],
  "scopes": ["read:progress", "write:journal"],
  "iat": 1700000000,
  "exp": 1700086400
}
```
Migrate existing sessions via a one-time migration endpoint that reads old cookies and issues new unified JWT.

**Cost:** Large (auth migration affects every protected route and the middleware)

**Blocks:** Multi-tenancy, role-based access control, SDK/OAuth

---

### TD-C04 — No Tenant Model

**Location:** All database tables, all API routes, middleware

**Impact:** Cannot serve B2B clients (universities, enterprises, prop firms). Cannot implement white-label. Cannot isolate data between organizations. Cannot implement per-tenant billing, branding, or configuration.

**Fix:** Add `tenant_id UUID NOT NULL DEFAULT 'default-tenant-uuid'` to all existing tables. Add `tenants` table. Add `tenant_memberships` table (user ↔ tenant ↔ role). Route all queries through a tenant context. Add `X-Tenant-ID` or subdomain-based tenant resolution in middleware.

**Cost:** Large (every table, every query, every API route affected)

**Blocks:** Enterprise SaaS, white-label, B2B sales

---

### TD-C05 — Zero Observability

**Location:** Entire codebase

**Impact:** Production failures are invisible. DB pool exhaustion silently logs and blocks. AI API failures produce 500s with no trace. No alerting, no correlation IDs, no structured log.

**Fix:**
1. Add Pino (structured logger) as the single logging interface
2. Generate `requestId` in middleware, propagate via request context
3. Instrument every `withDb()` call with timing
4. Add Sentry (or equivalent) for error capture
5. Upgrade `/api/health` to test DB, Redis, and AI connectivity

**Cost:** Medium (logging is mechanical; alerting requires external service integration)

**Blocks:** Production operations, incident response, SLA guarantees

---

## High Debt

Items that create significant friction or security risk.

---

### TD-H01 — Admin Auth in sessionStorage

**Location:** `src/lib/admin-auth.ts`

**Impact:** Admin credentials are XSS-accessible from JavaScript. If any XSS vulnerability is ever present, admin tokens are the first thing extracted.

**Fix:** Move admin session to an `httpOnly` cookie, same pattern as academy auth.

**Cost:** Small

---

### TD-H02 — community-career.ts Opens Raw pg Client

**Location:** `src/lib/community-career.ts`

**Impact:** Creates `new Client()` instead of using the shared pool. Pool limit enforcement is bypassed. Schema init guard is bypassed. Connection is not tracked or monitored.

**Fix:** Migrate all operations in `community-career.ts` to `withDb()`.

**Cost:** Small

---

### TD-H03 — No API Versioning

**Location:** All `src/app/api/` routes

**Impact:** Cannot ship breaking API changes. `/api/ai-mentor` and `/api/ai-mentor-v2` coexist with no deprecation timeline. When a mobile SDK or third-party integration is built, it cannot pin to a version.

**Fix:** Move all routes under `/api/v1/`. Add a deprecation header (`Sunset`, `Deprecation`) to v1 routes as v2 is introduced. Document version lifecycle.

**Cost:** Medium (routing change; not a logic change, but affects all clients)

---

### TD-H04 — No Input Validation Framework

**Location:** All `src/app/api/` route handlers

**Impact:** Each route validates input ad-hoc. Missing validations create security vulnerabilities. Adding validation is inconsistent.

**Fix:** Adopt Zod for all API input parsing. Wrap every route handler with a validation middleware that returns `400` for invalid input before business logic runs.

**Cost:** Medium (systematic change to every route)

---

### TD-H05 — Behavioral Engine Cannot Run Server-Side

**Location:** `src/lib/behavioral-engine.ts`, `src/lib/trading-dna.ts`

**Impact:** No server-side behavioral analysis. Cannot build aggregate insights. Cannot drive server-rendered personalization. Cannot generate behavioral reports.

**Fix:** Decouple `collectInputs()` from localStorage. Accept `RawInputs` as a parameter instead of reading from browser storage. Create a server-side `collectServerInputs(studentId)` that fetches from DB.

**Cost:** Medium (refactor of input collection; the scoring logic itself is already pure)

---

### TD-H06 — No AI Prompt Versioning

**Location:** `src/app/api/ai-mentor/route.ts`, `src/app/api/ai-mentor-v2/route.ts`

**Impact:** Prompt changes are code changes. No A/B testing. No rollback. No audit of what prompt generated what response.

**Fix:** Extract prompts to versioned prompt files or a prompt registry. Track prompt version in the mentor conversation record. Allow per-tenant prompt override.

**Cost:** Small-Medium

---

### TD-H07 — Hardcoded Content in src/data/

**Location:** `src/data/academy/`, `src/data/coins.ts`, `src/data/academyPath.ts`, etc.

**Impact:** Adding a new lesson or coin requires a code deploy. Non-technical content editors cannot publish content. Does not scale past 200 lessons.

**Fix:** Phase plan: (a) abstract content into a typed schema; (b) move to a flat-file CMS or headless CMS with API; (c) allow content updates without deploys.

**Cost:** Large (requires content pipeline architecture decision)

---

### TD-H08 — Rate Limit Not Multi-Instance Safe

**Location:** `src/lib/rate-limit.ts`

**Impact:** In-memory fallback creates per-process counters. With PM2 cluster or multiple containers, each instance allows the full limit. Effective rate limit in a 4-core PM2 setup is 4× the configured value.

**Fix:** Require Redis for production rate limiting. Log a startup warning (not just silent fallback) when Redis is unavailable. Never silently allow unlimited in production.

**Cost:** Small (configuration + startup check)

---

## Medium Debt

Items that create friction but do not block immediate enterprise readiness.

---

### TD-M01 — Dual Academy-Auth API Paths

`/api/academy-auth/` and `/api/academy/auth/` both exist serving the same domain. Consolidate to `/api/v1/auth/academy/`.

**Cost:** Small

---

### TD-M02 — Secret Fan-Out in session.ts

`user_session` falls back through `TECPEY_SESSION_SECRET` → `JWT_SECRET` → `NEXTAUTH_SECRET`. Any of these leaking breaks auth. Remove fallbacks; use exactly one secret per cookie.

**Cost:** Small (but requires verified environment variable cleanup)

---

### TD-M03 — No Pagination on List Endpoints

`/api/mentor-conversations`, `/api/achievements` return all records. Add `?page=&limit=` cursor pagination.

**Cost:** Small per route

---

### TD-M04 — Placeholder Routes Registered

~15 academy pages (`portfolio-lab`, `psychology-lab`, `practice-lab`, etc.) appear to be shell routes with no content. They are discoverable by crawlers. Either add a `noindex` directive or redirect to the hub page until implemented.

**Cost:** Small

---

### TD-M05 — phase5-achievement-engine.ts Naming

Phase-numbered filename in a production library. Rename to `achievement-engine.ts` and `db-schema.ts` call should use the new name.

**Cost:** Small (rename + update imports)

---

### TD-M06 — Database Pool Size Hardcoded

`max: 10` in `db.ts`. Should be `parseInt(process.env.DB_POOL_MAX ?? "10")` to allow tuning without code changes.

**Cost:** Small

---

### TD-M07 — AI Token Budget Not Enforced

Conversation history passed to Anthropic API is not bounded. Add token counting or a message-count hard limit before building the API payload.

**Cost:** Small

---

### TD-M08 — No Structured Error Types

API errors are returned as `{ ok: false, error: "string message" }`. No error codes, no machine-readable error classification. SDK consumers and frontend components must string-match error messages.

**Fix:** Define an error code enum: `{ code: "AUTH_EXPIRED", message: "..." }`.

**Cost:** Small-Medium

---

## Low Debt

Items that are cosmetic, minor, or already documented.

---

### TD-L01 — Legacy CSS Variables

`globals.css` contains `.about-*` CSS classes that are unused. Dead CSS.

### TD-L02 — Navbar `<img>` → `<Image>`

ESLint warning. Performance: Next.js `<Image>` provides lazy loading and optimization.

### TD-L03 — `middleware.ts` Filename

Next.js 16 may deprecate the `middleware` convention. The existing note in `Roadmap.md` documents this. Keep monitoring; rename to `proxy.ts` when confirmed.

### TD-L04 — `TODO(sameAs)` in entity.ts

Five `sameAs` fields have placeholder TODO comments. Fill in as TecPey's public profiles are established (Wikidata, LinkedIn, CrunchBase).

### TD-L05 — `TODO(mentor-queue)` in mentor-events.ts

Documents the need for a durable background queue to replace in-process async. Correct observation; track in Phase 20+ planning.

### TD-L06 — `TODO(i18n-mentor)` in mentor-signals.ts

Insight label strings are English-only. Needs Persian localization pass.

---

## Debt Paydown Priority

| Priority | Item | Phase Target |
|---|---|---|
| 1 | TD-C02 — Migration system | Phase 20 |
| 2 | TD-C05 — Observability (Pino + Sentry) | Phase 20 |
| 3 | TD-C03 — Unified auth | Phase 21 |
| 4 | TD-C01 — localStorage → server persistence | Phase 21–22 |
| 5 | TD-C04 — Tenant model | Phase 22 |
| 6 | TD-H04 — Input validation (Zod) | Phase 20 |
| 7 | TD-H01 — Admin sessionStorage → httpOnly | Phase 20 |
| 8 | TD-H02 — community-career.ts raw client | Phase 20 |
| 9 | TD-H03 — API versioning | Phase 21 |
| 10 | TD-H05 — Behavioral engine server-side | Phase 21 |
| 11 | TD-H07 — Content pipeline | Phase 22–23 |
| 12 | TD-M01–M08 | Ongoing (1–2 per phase) |
| 13 | TD-L01–L06 | Ongoing cleanup |
