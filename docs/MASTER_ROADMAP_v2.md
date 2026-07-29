# TecPey — Master Roadmap v2.0

**Phase 19 | Rebuilt Roadmap**
**Date:** 2026-06-28
**Status:** **SUPERSEDED** — See `docs/MASTER_ROADMAP_v3.md` (Phase 39.5)  
Reason: Superseded by `MASTER_ROADMAP_v3.md` which adds Phase 39.5, Phase 39.6, Phase 40+, and restructures future phases.  
This document is retained for historical reference. Do not use as current source of truth.

History is preserved. Future phases are redesigned from an enterprise-first perspective. Do not delete completed phases.

---

## Format

Each phase entry uses this structure:

```
Mission     — Why this phase exists
Goal        — What done looks like
Deliverables — Concrete output list
Dependencies — Must be complete before this phase starts
Future impact — What this phase enables long-term
QA requirements — Definition of ready-to-ship
Rollback considerations — What to do if this phase must be undone
```

---

## ── COMPLETED PHASES ──────────────────────────────────────────────────────────

### Phase 0 — Security Stabilization ✅ 2025
**Mission:** Establish a baseline security posture before any feature work.
**Goal:** All existing API routes are protected. Auth gaps are closed.
**Deliverables:** CSRF protection, JWT hardening, auth gap audit.
**Dependencies:** None.

---

### Phase 1 — Database Pool & Schema Centralization ✅ 2025
**Mission:** Replace scattered pg clients with a shared pool.
**Goal:** Single `withDb()` pattern used everywhere. Schema defined centrally.
**Deliverables:** `src/lib/db.ts`, `src/lib/db-schema.ts`.
**Dependencies:** Phase 0.

---

### Phases 2–3 — Core Foundation ✅ 2025
**Mission:** Build the Next.js App Router foundation.
**Goal:** Persian RTL layout, navigation, public pages, market board.
**Deliverables:** Root layout, `/en` subtree, navbar, footer, markets page.

---

### Phases 4–6 — Content & Education Layer ✅ 2025
**Mission:** Build the Academy learning product.
**Goal:** 7-term curriculum, quizzes, progress tracking, certificates.
**Deliverables:** Term pages, quiz engine, certificate issuance, knowledge center.

---

### Phases 7–8 — AI Intelligence Layer ✅ 2025
**Mission:** Add AI Mentor and behavioral tracking.
**Goal:** Students receive personalized coaching based on their learning signals.
**Deliverables:** `mentor-memory.ts`, `mentor-events.ts`, `mentor-signals.ts`, mentor conversation API, localStorage→DB migration.

---

### Phase 9 — SEO & GEO Foundation ✅ 2025
**Mission:** Make TecPey discoverable by humans and AI crawlers.
**Goal:** Full structured data, hreflang, sitemap, llms.txt.
**Deliverables:** `src/lib/seo.ts`, `src/lib/entity.ts`, Organization/FAQ/Article schemas.

---

### Phase 9.5 — Bilingual SEO/GEO Expansion ✅ 2025
**Mission:** Persian + English parity for AI search (GEO).
**Goal:** `llms.txt` and `llms-full.txt` are AI-readable and factually accurate.
**Deliverables:** EN keyword clusters, bilingual entity table, AI compliance language.

---

### Phase 10 — Enterprise UI/UX ✅ 2026-06-27
**Mission:** English pages reach Persian parity. Brand is enterprise-grade.
**Goal:** Every English page matches its Persian counterpart in content and design.
**Deliverables:** Enterprise design system (`globals.css`), `EnglishUI.tsx` rewrite, mobile sticky CTA.

---

### Phase 11 — Enterprise Visual Polish ✅ 2026-06-27
**Mission:** Eliminate CSS debt. Unify the design token system.
**Goal:** Zero legacy CSS classes. Dark mode consistent. Accessibility baseline.
**Deliverables:** Skeleton system, alert/badge/input tokens, reduced-motion support.

---

### Phase 12 — Enterprise GitHub Foundation ✅ 2026-06-27
**Mission:** Make the project professional and contributor-ready.
**Goal:** Complete documentation suite, GitHub templates, CI pipeline.
**Deliverables:** CHANGELOG, CONTRIBUTING, SECURITY, README, issue/PR templates, docs suite.

---

### Phase 13 — Production Hardening ✅ 2026-06-27
**Mission:** Harden the platform for real production traffic.
**Goal:** CI green. Security headers on. Fingerprinting off. SEO sitemap complete.
**Deliverables:** GitHub Actions CI, security headers, `experimental.inlineCss`, `global-error.tsx`.

---

### Phase 14 — Global Strategy & Educational Constitution ✅ 2026-06-27
**Mission:** Define TecPey's expansion path and educational standards.
**Goal:** Documented strategy for Iran → Middle East → Global.
**Deliverables:** `GLOBAL_STRATEGY.md`, `ACADEMY_EDUCATIONAL_STANDARD.md`, `ACADEMY_COMPETITIVE_BENCHMARK.md`.

---

### Phase 15 — Academy V2 ✅ 2026-06-27
**Mission:** Full Academy V2 implementation — curriculum, progress, smart review.
**Goal:** 7-term curriculum with spaced repetition, lesson player, knowledge map.
**Deliverables:** `AcademyLessonPlayer`, `AcademyStudentDashboardV2`, `spaced-repetition.ts`, `knowledge-graph.ts`.

---

### Phase 16 — AI Mentor Behavioral Intelligence ✅ 2026-06-27
**Mission:** Build behavioral coaching UI on top of the 12-dimension engine.
**Goal:** Students see their behavioral profile, coaching cards, review queue.
**Deliverables:** `LearningInsightsDashboard.tsx`, `MentorV2.tsx`, `behavioral-engine.ts`, `/academy/mentor-v2`, `/academy/insights`.

---

### Phase 17 — Trading Arena V2 ✅ 2026-06-27
**Mission:** Build a production-grade behavioral paper trading simulator.
**Goal:** $10k paper wallet, 6 scenarios, trade journal, Trading DNA integration.
**Deliverables:** `trading-arena.ts`, `trading-scenarios.ts`, `trading-journal.ts`, `trading-dna.ts`, arena/scenarios/journal routes.

---

### Phase 18 — Community & Social Learning Layer ✅ 2026-06-28
**Mission:** Transform solo learning into structured community accountability.
**Goal:** Privacy-first leaderboards, challenges, study groups, peer journals, instructor dashboard.
**Deliverables:** `community-profile.ts`, `community-leaderboard.ts`, `community-challenges.ts`, 6 community routes.

---

## ── INFRASTRUCTURE DEBT PHASES ────────────────────────────────────────────────

These phases address the debt identified in `ARCHITECTURE_REVIEW.md` and `TECHNICAL_DEBT_REPORT.md`. They must precede any further feature development.

---

### Phase 19 — Vision Refactor & Architecture Foundation ✅ 2026-06-28

**Mission:** Align architecture with 10-year platform vision before adding features.
**Goal:** Complete documentation of architectural decisions, debt, roadmap, and target architecture. No feature implementation.
**Deliverables:**
- `ARCHITECTURE_REVIEW.md`
- `TECHNICAL_DEBT_REPORT.md`
- `VISION_v2.md`
- `MASTER_ROADMAP_v2.md`
- `PLATFORM_BLUEPRINT_v2.md`
- `WHITEPAPER_STRUCTURE_v2.md`
- `DEPENDENCY_MAP.md`
- `FUTURE_MODULES.md`
- `PHASE19_REPORT.md`

**Dependencies:** Phases 0–18 complete.
**Future impact:** All subsequent phases build against a documented target architecture. No further unplanned debt accumulation.
**QA:** All docs reviewed against actual codebase state. No aspirational claims without a Phase target.
**Rollback:** N/A — documentation only.

---

### Phase 20 — Engineering Foundation

**Mission:** Fix the four critical infrastructure gaps that block enterprise readiness.
**Goal:** Database migrations, observability, input validation, and admin auth are production-grade.

**Deliverables:**
- Migration runner (`migrations/` directory, numbered SQL files, migration lock table)
- Pino structured logger (request ID propagation, log levels, JSON output)
- Sentry integration (error capture, performance traces)
- Upgraded `/api/health` endpoint (deep health: DB + Redis + AI)
- Zod input validation on every API route
- Admin session moved to `httpOnly` cookie
- `community-career.ts` migrated to `withDb()`
- `phase5-achievement-engine.ts` renamed to `achievement-engine.ts`
- Redis requirement enforced for production rate limiting (startup warning when unavailable)

**Dependencies:** Phase 19 (architecture review complete, debt prioritized).
**Future impact:** Enables reliable production operations. Enables Phase 21 auth overhaul. Enables Phase 22 tenant model.
**QA:** All 20 API routes covered by Zod validation. Migration runner idempotent (run twice = same result). Pino logs visible in CI output. Sentry test event received.
**Rollback:** All changes are additive. Removing Pino/Sentry = remove imports. Migration runner can be disabled without reverting schema.

---

### Phase 21 — Unified Identity & API Versioning

**Mission:** Consolidate three auth cookies into one unified identity. Version all API routes.
**Goal:** A single JWT governs all authenticated access. All routes live under `/api/v1/`.

**Deliverables:**
- `TecPeyIdentity` JWT design (sub, email, tenant, roles, scopes)
- Session migration endpoint: reads legacy cookies, issues unified JWT
- Middleware updated to validate unified JWT
- All 50+ API routes moved to `/api/v1/` (with redirects from legacy paths during transition window)
- Structured error codes (`{ code: string, message: string, details?: unknown }`)
- Pagination protocol defined and implemented on list endpoints

**Dependencies:** Phase 20 (observability to monitor migration, Zod for input validation).
**Future impact:** Enables OAuth, SDK, multi-tenant roles, developer platform.
**QA:** All existing session-authenticated routes pass with new JWT. No regression on academy login/logout flow. Legacy cookie paths return `301` or `410` with clear documentation.
**Rollback:** Keep legacy auth routes alive for 30 days post-migration. Rollback = re-enable legacy middleware path.

---

### Phase 22 — Server-Side Persistence for Behavioral Data

**Mission:** Move all localStorage-dependent learning data to server-side persistence.
**Goal:** A student can switch devices and their full learning history, behavioral DNA, trading arena state, and journal are intact.

**Deliverables:**
- New DB tables: `student_learning_progress`, `student_trading_arena`, `student_trading_journal`, `student_behavioral_snapshots`, `student_community_profile`, `student_challenge_participation`
- Sync layer: write-through API endpoints for all behavioral data
- localStorage becomes a read cache (invalidated on login)
- `computeBehavioralSnapshot(studentId)` runs server-side
- `computeMyLeaderboardScores(studentId)` computes from DB
- Real leaderboard (replaces LCG demo peers)
- GDPR export endpoint: `GET /api/v1/student/export` returns all student data as JSON

**Dependencies:** Phase 21 (unified identity, API versioning).
**Future impact:** Enables aggregate analytics, real leaderboards, enterprise reporting, GDPR compliance.
**QA:** Multi-device test: login on device A, trade on device B, verify history visible on device A. Export endpoint tested. Old localStorage data migrated via one-shot migration endpoint.
**Rollback:** Keep localStorage reads as fallback for 60 days. If server returns 500, fall back to localStorage. Rollback = disable server write path, re-enable localStorage as source of truth.

---

### Phase 23 — Multi-Tenant Infrastructure

**Mission:** Make every layer of TecPey tenant-aware.
**Goal:** A second organization can deploy TecPey with full data isolation, custom branding, and separate configuration.

**Deliverables:**
- `tenants` table: id, slug, display_name, plan, config (JSONB), created_at
- `tenant_memberships` table: tenant_id, user_id, role, created_at
- `tenant_id` column on all behavioral/community tables (Phase 22 tables get it from creation; older tables get migration)
- Tenant resolution middleware: subdomain or `X-Tenant-ID` header
- Per-tenant configuration: AI model, rate limits, feature flags, branding tokens
- Tenant admin API: CRUD for tenant settings (authenticated as tenant_admin role)
- White-label foundation: tenant can override logo URL, primary color, domain

**Dependencies:** Phase 22 (server-side persistence), Phase 21 (unified identity with tenant claim in JWT).
**Future impact:** Enables B2B sales, university deployments, prop firm contracts, enterprise SaaS billing.
**QA:** Tenant A data is inaccessible to Tenant B (verified by attempting cross-tenant API calls). New tenant onboarding tested end-to-end. Tenant config override applies to branded UI.
**Rollback:** Tenant-aware queries include `AND tenant_id = $tenantId`. Removing tenancy = remove this clause and hardcode default tenant. Data is not deleted.

---

## ── FEATURE PHASES ────────────────────────────────────────────────────────────

These phases build new capabilities on top of the infrastructure established in Phases 20–23.

---

### Phase 24 — Developer Platform V1

**Mission:** Enable third-party developers to build on TecPey.
**Goal:** A developer can authenticate with OAuth, receive webhooks, and call versioned APIs.

**Deliverables:**
- OAuth 2.0 server (authorization code flow): `GET /oauth/authorize`, `POST /oauth/token`
- Developer portal: API key management, webhook registration, docs
- Webhook system: events for `student.progress.updated`, `certificate.issued`, `mentor.session.completed`
- Public API documentation (OpenAPI 3.1 spec auto-generated from Zod schemas)
- SDK v1 (TypeScript): wraps `/api/v1/` endpoints

**Dependencies:** Phase 21 (API versioning, structured errors), Phase 23 (multi-tenant for app registration).
**Future impact:** App marketplace, integration partners, enterprise automation.
**QA:** OAuth flow tested with a mock third-party client. Webhook delivery verified with at least 3 event types. SDK test suite passes.

---

### Phase 25 — AI Operating System V1

**Mission:** Unify all AI capabilities under one orchestrated layer.
**Goal:** A single AI service handles mentor, support, and admin queries with shared context, prompt versioning, and per-tenant model selection.

**Deliverables:**
- `src/services/ai/` — AI gateway service
- Prompt registry: versioned prompt templates, A/B testing support
- Model selection: per-tenant override, fallback chain
- AI response logging (opt-in per tenant, privacy-preserving)
- Token budget enforcement: hard limit on context window per request
- Graceful degradation: static educational fallback when AI unavailable
- Mentor AI V3: reads from server-side behavioral data (Phase 22)

**Dependencies:** Phase 22 (server-side behavioral data), Phase 23 (per-tenant model config).
**Future impact:** Support AI, Admin AI, Trading AI, Knowledge AI all run through the same gateway.
**QA:** Token budget test: response rejected if context exceeds limit. Prompt version tracked in DB. Fallback response fires when API unavailable.

---

### Phase 26 — Financial Ecosystem Foundation

**Mission:** Establish the architecture for financial products beyond spot trading.
**Goal:** Defined data models and API contracts for savings, investment clubs, and compliant financial flows. No real money flows in this phase.

**Deliverables (architecture only — no live money):**
- Savings plan model: goal, duration, contribution schedule, progress tracking
- Investment club model: group goals, shared progress, individual contribution tracking
- Wallet abstraction layer: `AbstractWallet` interface that can be implemented by exchange wallet, educational wallet, or future custodial wallet
- Escrow model: locked funds with release conditions (manual, date-based, oracle-based)
- Compliance flags: per-product Islamic finance compliance status, jurisdiction restrictions

**Dependencies:** Phase 23 (multi-tenant — financial products are tenant-scoped), Phase 20 (observability — financial flows need audit trails).
**Future impact:** Enables regulated financial products in Phase 28+.
**QA:** All models defined with TypeScript types and Zod schemas. No real transaction processing. Architecture reviewed by a compliance-aware team member.

---

### Phase 27 — Analytics & Intelligence Layer

**Mission:** Build aggregate insights from behavioral and platform data.
**Goal:** An instructor, admin, or enterprise client can see cohort-level analytics without accessing individual student data.

**Deliverables:**
- Aggregate behavioral analysis: distribution of Trading DNA scores per cohort
- Curriculum effectiveness metrics: correlation between lesson completion and behavioral improvement
- Instructor analytics dashboard: cohort weak topics, risk pattern distribution, completion rates
- Platform health metrics: DAU/MAU, graduation funnel, retention cohorts
- Privacy-preserving aggregation: k-anonymity floor (minimum cohort size before showing aggregate data)

**Dependencies:** Phase 22 (server-side behavioral data), Phase 23 (tenant-scoped analytics).
**Future impact:** Enterprise reporting, curriculum optimization, investor metrics, prop firm hiring signals.

---

### Phase 28 — Content Pipeline & CMS

**Mission:** Decouple content from code.
**Goal:** A content editor can publish a new lesson, coin page, or glossary entry without a code deploy.

**Deliverables:**
- Content schema (typed TypeScript interfaces for Lesson, Term, CoinPage, GlossaryEntry, Article)
- Content API (flat-file or headless CMS backend — decision to be made)
- Content delivery: Next.js `generateStaticParams` for static coin/glossary pages; ISR for lesson content
- Migration: all existing `src/data/` TypeScript objects migrated to content format
- Localization: content per locale (fa-IR primary, en-US secondary)
- Editorial workflow: draft → review → publish

**Dependencies:** Phase 20 (migration system — content schema needs DB or file system migrations).
**Future impact:** Scale to 1000+ lessons without code changes. Non-technical content teams. Multi-market localization.

---

### Phase 29 — Trust & Verification System

**Mission:** Make TecPey credentials credible to external parties.
**Goal:** A certificate can be verified by an employer, a prop firm, or a university without contacting TecPey.

**Deliverables:**
- Public certificate verification page (already exists: `/verify/[certificateId]`)
- Certificate anchoring: hash stored on an immutable ledger (not necessarily blockchain — append-only log is sufficient)
- Trading DNA attestation: signed behavioral snapshot that a student can share
- Verified identity option (opt-in): connect government ID or student ID to reduce anonymity
- Anti-fraud: report fake certificate flow, automated revocation for verified violations
- Prop firm integration API: `GET /api/v1/verify/dna/{studentId}` (with student consent JWT)

**Dependencies:** Phase 21 (API versioning), Phase 22 (server-side behavioral data).

---

### Phase 30 — Global Launch Readiness

**Mission:** Verify all systems before a global public launch.
**Goal:** The platform handles 10,000 concurrent users with p99 < 500ms on all key routes.

**Deliverables:**
- Load test: 10k concurrent on markets, academy, mentor
- End-to-end security red team: session fixation, CSRF, SQL injection, XSS, privilege escalation
- GDPR compliance audit: data export tested, consent flow verified, retention policy enforced
- Multi-region deployment plan (Phase 30 does not implement — plans the architecture)
- Legal review: risk disclosure, privacy policy, terms of service per target jurisdiction
- SLA definition: uptime, response time, support response time

**Dependencies:** Phases 20–29 complete.

---

## ── FUTURE PHASES (Beyond Phase 30) ──────────────────────────────────────────

Not roadmapped in detail. Reserved for post-launch expansion.

| Phase | Name | Pillar |
|---|---|---|
| 31 | Mobile Application (React Native) | Academy + Exchange |
| 32 | Arabic Language Market Entry | Academy |
| 33 | Islamic Finance Module | Academy + Financial Ecosystem |
| 34 | Prop Firm Partnership Network | Trust + Enterprise SaaS |
| 35 | Creator Economy Foundation | Social Layer + Developer Platform |
| 36 | Multi-Region Infrastructure | Multi-Tenant Infrastructure |
| 37 | Regulated Financial Products | Financial Ecosystem + Compliance |
| 38 | AI Trading Coach (live market signals) | AI OS + Exchange |
| 39 | Governance Model | Governance + Compliance |
| 40 | IPO/Institutional Readiness | All Pillars |

---

## Dependency Graph (Key)

```
Phase 20 (Engineering) → Phase 21 (Auth) → Phase 22 (Persistence)
                                          → Phase 23 (Multi-tenant)
                                                      ↓
                     Phase 24 (Dev Platform) ←── Phase 21 + Phase 23
                     Phase 25 (AI OS)        ←── Phase 22 + Phase 23
                     Phase 26 (Financial)    ←── Phase 23 + Phase 20
                     Phase 27 (Analytics)    ←── Phase 22 + Phase 23
                     Phase 28 (Content CMS)  ←── Phase 20
                     Phase 29 (Trust)        ←── Phase 21 + Phase 22
                     Phase 30 (Launch)       ←── All prior complete
```

---

## Principles That Govern This Roadmap

1. **Infrastructure before features.** Phases 20–23 must complete before Phases 24+.
2. **No phase skipping.** Dependencies are hard. Skipping Phase 22 and building Phase 27 produces analytics with no data.
3. **No feature phases during debt phases.** While Phases 20–23 are in progress, no new user-facing features.
4. **Every phase has rollback.** Nothing is irreversible. Every migration has a down path.
5. **QA is not optional.** The QA requirements for each phase are the definition of done, not the definition of aspirational.
