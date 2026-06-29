# Changelog

All notable changes to TecPey are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow semantic milestones (Phase-based).

---

## [v0.26] — 2026-06-30 — Production Observability and Operations Foundation

### Added — Request ID / Trace ID Propagation

- `src/lib/trace.ts` (new): `generateRequestId()`, `getRequestId(req)`, `attachRequestId(response, id)`
  - Header `x-tecpey-request-id` set by proxy on forwarded request headers
  - Header `x-request-id` returned to clients on every page response
  - API routes use `getRequestId(req)` to extract or generate a per-request UUID
- `src/proxy.ts`: generates `requestId` alongside nonce; sets `x-tecpey-request-id` on forwarded request and `x-request-id` on response

### Added — Structured Logging Improvements

- `src/lib/logger.ts`: added `service` and `environment` fields to every log entry;
  added `logger.child(context)` — returns a child logger with pre-bound context fields
  merged into every call; backward-compatible with existing `logger.info/warn/error/debug` usage
- Log format: `{ ts, level, service, environment, msg, ...context }` — all entries are NDJSON

### Added — API Observability Wrapper

- `src/lib/observe.ts` (new): `withObservability(req, options, handler)` — wraps any API handler body with:
  - Request ID extraction and `x-request-id` response header
  - Structured `[api] request` log on completion (route, method, status, latencyMs)
  - In-memory metrics recording via `metrics.recordRequest()`
  - Error capture via `captureError()` on unhandled rejections
- Used on `GET /api/admin/metrics` as the adoption example

### Added — Enterprise Health Center

- `src/app/api/health/route.ts` rewritten with full enterprise health fields:
  - `checks.database`: `ok | unavailable | unconfigured` with `latencyMs`
  - `checks.redis`: existing check + latency tracking
  - `checks.email`: existing (Phase 25)
  - `migrations.applied`: count from `_migrations` table (fast, bypasses migration runner)
  - `tenantSystem.status`: reflects DB availability
  - `build`: `version`, `commit`, `node` from env vars / process
  - `memory`: RSS, heapUsed, heapTotal, external (all in MB)
  - `featureFlags`: snapshot from `getAllFlags()`
  - `observability`: error tracking and alert webhook status
  - `healthCheckLatencyMs`: total time to assemble response
  - `warnings[]`: production misconfiguration notices
  - Emits `DB_DOWN` / `REDIS_DOWN` / `EMAIL_NOT_CONFIGURED` alerts on degraded state
- `src/lib/db.ts`: added `checkDbHealth()` — direct pool connection (`SELECT 1`) without triggering the migration runner; also queries `_migrations` count

### Added — Metrics Foundation

- `src/lib/metrics.ts` (new): in-memory metrics store backed by `globalThis`
  - `metrics.recordRequest(route, status, latencyMs)` — per-route request count + latency tracker
  - `metrics.recordError(route, code)` — per-route error counter
  - `metrics.increment(name)` — named counter
  - `metrics.getSnapshot()` — totals, per-route breakdown, error rate
- `src/app/api/admin/metrics/route.ts` (new): `GET /api/admin/metrics` — admin-protected metrics endpoint

### Added — Error Tracking Adapter

- `src/lib/error-tracking.ts` (new): provider-agnostic error capture
  - `captureError(error, context?)` — never throws; safe to call anywhere
  - `ERROR_TRACKING_PROVIDER=betterstack`: push to Logtail via `fetch` (no new package)
  - `ERROR_TRACKING_PROVIDER=sentry`: stub ready for `@sentry/nextjs` (see TODO comment)
  - Default (`none`): structured `error` log to stdout
  - `isErrorTrackingConfigured()` — used by health endpoint

### Added — Alerting Foundation

- `src/lib/alerts.ts` (new): typed alert emitter
  - 7 alert types: `DB_DOWN`, `REDIS_DOWN`, `EMAIL_NOT_CONFIGURED`, `EMAIL_SEND_FAILED`,
    `API_ERROR_SPIKE`, `PRICE_FEED_DOWN`, `MIGRATION_FAILED`
  - Severity: `critical` (logged at error) or `warning` (logged at warn)
  - Deduplication: same alert type fires at most once per 60 seconds
  - Webhook delivery: `ALERT_WEBHOOK_URL` receives POST with `AlertEvent` JSON payload
  - Non-blocking: webhook failure is swallowed and logged as a warning

### Added — Environment Documentation

- `.env.example`: `ERROR_TRACKING_PROVIDER`, `BETTERSTACK_SOURCE_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`,
  `ALERT_WEBHOOK_URL`, `NEXT_PUBLIC_GIT_COMMIT`, `NEXT_PUBLIC_BUILD_VERSION`

### Added — Operational Documentation

- `docs/OPERATIONS_RUNBOOK.md` (new): incident runbooks for DB down, Redis down, email missing,
  migration failure, API error spike, price feed outage, CI failure, deployment rollback;
  environment variable checklist; production launch checklist
- `docs/OBSERVABILITY.md` (new): logging format reference, request ID usage guide, child logger,
  API wrapper adoption guide, health endpoint schema, metrics plan, alerting plan,
  recommended production stack

---

## [v0.25] — 2026-06-30 — Tenant Membership and Production Services Foundation

### Added — DB-backed Tenant and Membership Storage

- `src/lib/db-migrate.ts`: Added migration `0003_tenant_membership.sql`
  - `platform_tenants` table: `id`, `slug`, `display_name`, `plan`, `owner_id`, `products`, timestamps
  - `platform_workspaces` table: `id`, `tenant_id`, `slug`, `display_name`, `products`, `settings`, `created_at`
  - `platform_memberships` table: `id`, `user_id`, `tenant_id`, `workspace_id`, `roles`, `joined_at`, `expires_at` + indexes
  - Seeds default `tecpey` tenant and `main` workspace via `INSERT … ON CONFLICT DO NOTHING`
- `src/lib/tenant-service.ts` (new): DB query layer for tenant/membership data
  - `getTenant(tenantId)` — fetch tenant row
  - `getDefaultTenant()` — convenience wrapper for `PLATFORM.DEFAULT_TENANT_ID`
  - `getWorkspace(workspaceId)` — fetch workspace row
  - `getMembership(userId, tenantId)` — fetch user membership
  - `upsertMembership(userId, tenantId, roles, workspaceId?)` — create or update membership (idempotent)
  - `resolvePlatformContext(session)` — derives `PlatformContext` from canonical session; falls back to `["guest"]` when DB unavailable

### Added — Email Delivery Foundation

- `src/lib/email.ts` (new): Provider-agnostic email service; no new npm packages (fetch-based)
  - `sendEmail(message)` → `EmailResult` — routes to configured provider or logs in dev
  - Provider selection via `EMAIL_PROVIDER` env var: `resend` | `sendgrid` | `dev` | `none`
  - Resend provider: POST to `https://api.resend.com/emails` with `RESEND_API_KEY`
  - SendGrid provider: POST to `https://api.sendgrid.com/v3/mail/send` with `SENDGRID_API_KEY`
  - `isEmailConfigured()` — used by health endpoint
  - In production with no `EMAIL_PROVIDER` set, logs an error and returns failure instead of silently discarding emails

### Improved — Production Rate-Limit Enforcement

- `src/lib/rate-limit.ts`: Added `warnRedisUnconfigured()` — logs at ERROR level (once per process) when falling back to in-memory limiting in `NODE_ENV=production`
  - In development/test: silent fallback unchanged
  - In production: operators are alerted on first rate-limit call when Redis is missing

### Improved — Health Endpoint

- `src/app/api/health/route.ts`: Added `email` check (`configured` | `unconfigured`) to `/api/health` response
  - Added `warnings[]` array surfacing production misconfiguration (Redis unconfigured, email unconfigured)

### Fixed — TODO(cookie-migration) Cleanup

- `src/app/api/command-center/campaign/route.ts`: Replaced `hasAdminAccess(req)` → `(await getCanonicalSession(req)).isAdmin`. Removed `adminUnauthorizedResponse` and `hasAdminAccess` imports.
- `src/app/api/command-center/summary/route.ts`: Same migration — now uses canonical session for admin check.
- `src/app/api/academy/mentor-memory/route.ts`: Removed stale `TODO(cookie-migration)` comment (already resolved in Phase 23).

### Added — Environment Documentation

- `.env.example`: Added `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY`, `SENDGRID_API_KEY` with provider descriptions and production behavior notes.

---

## [v0.24.6] — 2026-06-30 — Enterprise Integrity Repair

### Fixed — Database Migration (CRITICAL)

- `src/lib/db-migrate.ts`: Added migration `0002_extended_schema.sql` that closes the
  schema drift gap between the committed `0001` migration and the columns referenced
  by production API routes. All changes use `ADD COLUMN IF NOT EXISTS` — idempotent
  and safe against already-extended databases.
  - `notification_center` +5 columns: `action_url`, `priority`, `channels`, `metadata`, `scheduled_for`
  - `admin_audit_log` +1 column: `actor` (alongside existing `admin_id`)
  - `academy_question_bank` +9 columns: `lesson_slug`, `topic`, `cognitive_skill`, `correct_option`,
    `explanation`, `usage_count`, `success_count`, `approved`, `updated_at` + 2 indexes
  - `mentor_challenge_attempts` +3 columns: `question_id`, `selected_option`, `is_correct` + index
  - `academy_students` +1 column: `last_seen_at`
  - `learning_brain_profiles` +3 columns: `decision_score`, `confidence_score`, `weak_topics`

### Fixed — Security Header Conflict

- `next.config.ts`: Changed `X-Frame-Options` from `SAMEORIGIN` to `DENY`.
  Resolves contradiction with `frame-ancestors 'none'` in `proxy.ts`. Both headers
  now enforce the same no-framing policy across legacy and modern browsers.

### Updated — Environment Documentation

- `.env.example`: Added `OPENAI_PROJECT_API_KEY`, all 5 `FEATURE_*` flags,
  `TECPEY_COOKIE_SECURE`, session max-age vars. Added explicit warning that
  **Redis is required in production** for rate limiting to coordinate across instances.

### Fixed — Low-Priority Code Cleanup

- `src/lib/admin-auth.ts`: Removed local `shouldUseSecureCookie()` (now imports from
  `platform-config`); `adminNotConfiguredResponse()` and `adminUnauthorizedResponse()`
  now use `apiError()` instead of bare `Response.json()`.
- `src/lib/session.ts`: Replaced hardcoded `"user_session"` string with `COOKIES.USER_SESSION`.
- `src/app/api/academy-auth/route.ts`: Auth rate limit tightened from 20 to 10 req/min.

### QA

- `npm run typecheck`: 0 errors
- `npm run lint`: 0 warnings, 0 errors
- `npm run build`: ✓ 292 pages, 7.0s, Proxy (Middleware) registered

---

## [v0.24] — 2026-06-30 — Enterprise Platform Foundation (Multi-Tenant Architecture)

### Added — Platform Libraries

- `src/lib/platform-config.ts`: Single source of truth for all platform configuration.
  Exports `COOKIES` record (SESSION, ACADEMY_AUTH, STUDENT_SESSION, STUDENT_ID, USER_SESSION),
  `shouldUseSecureCookie()` (reads `TECPEY_COOKIE_SECURE` env var or infers from `NEXT_PUBLIC_SITE_URL`),
  `sessionMaxAge()` (JWT duration string), `sessionMaxAgeSeconds()` (cookie maxAge integer),
  and `PLATFORM` metadata object (NAME, SITE_URL, API_BACKEND_URL, DEFAULT_TENANT_ID, DEFAULT_WORKSPACE_ID).
  Eliminates three separate `shouldUseSecureCookie()` implementations that existed in unified-session.ts,
  academy-auth.ts, and academy-session.ts.

- `src/lib/platform-types.ts`: Core type definitions for the multi-tenant model.
  Branded types: `TenantId`, `WorkspaceId`, `UserId`. Role union: `admin | moderator | teacher |
  student | trader | support | guest`. Product union: `exchange | academy | social | mentor |
  knowledge | marketplace`. Composite types: `TenantPlan`, `Tenant`, `Workspace`, `Membership`,
  `PlatformContext`. Pure types, zero runtime code.

- `src/lib/feature-flags.ts`: Runtime feature flag system driven entirely by environment variables.
  `FeatureFlag` union type (5 flags: academy.enabled, exchange.enabled, social.enabled,
  mentor.enabled, future.marketplace.enabled). `FLAG_CONFIG` record maps each flag to its env var
  and production-safe default. `isFeatureEnabled(flag)`: reads env var, falls back to default.
  `getAllFlags()`: snapshot of all current values for health/debug endpoints. No hardcoded booleans.

- `src/lib/product-registry.ts`: Central registry for all TecPey products.
  `Product` type (id, slug, displayName, description, requiredPermission, featureFlag, isEnabled()).
  `PRODUCTS` record with 6 entries: exchange, academy, social, mentor, knowledge, marketplace.
  `getEnabledProducts()`: filters by live feature flag. `getProductBySlug()`: reverse-lookup by URL slug.

- `src/lib/permission.ts`: Unified permission layer replacing scattered ad-hoc checks.
  `ROLE_PERMISSIONS` map: admin→`["*"]`, moderator→social+academy, teacher→academy+mentor,
  student→academy+mentor+social, trader→exchange+academy, support→admin view+academy+social,
  guest→view-only. `resolveRoles(session)`: derives Role[] from CanonicalSession claims.
  `matchesGrant()`: supports wildcard (`*`), product-wildcard (`product.*`), and exact match.
  `permission(session)` factory returns `PermissionContext`: `can(action)`, `require(action)`,
  `hasRole(role)`, `hasFeature(flag)`, `roles`. `require()` returns `null | NextResponse` for
  guard-return pattern.

- `src/lib/route-guards.ts`: Unified guard functions for route protection.
  `requireTenant(session)`: 401 for fully unauthenticated, null otherwise (forward-compatible hook).
  `requireRole(session, role)`: 403 if session lacks role.
  `requirePermission(session, action)`: 403 if action not in role grants.
  `requireFeature(flag)`: 403 with `feature_disabled` code if flag is off.
  All return `NextResponse | null` for the guard-return pattern.

### Updated — Existing Libraries

- `src/lib/unified-session.ts`: Removed local `shouldUseSecureCookie()` and `cookieMaxAge()`.
  Now imports from `platform-config`. Re-exports `UNIFIED_SESSION_COOKIE = COOKIES.SESSION`
  for backward compatibility with all existing importers.

- `src/lib/academy-session.ts`: Imports `COOKIES` from `platform-config`.
  Removed dead exports: `signStudentSession`, `setStudentSessionCookie`,
  `getStudentSessionFromServerCookies`, local `shouldUseSecureCookie`.
  Retained: `isSessionConfigured`, `verifyStudentSessionToken`, `getStudentSessionFromRequest`,
  `clearStudentSessionCookie` (used by logout handler).

- `src/lib/academy-auth.ts`: Imports `COOKIES` from `platform-config`.
  Removed dead exports: `signAcademyAuthSession`, `setAcademyAuthCookie`,
  local `shouldUseSecureCookie`.
  Retained: `isAcademyAuthConfigured`, `verifyAcademyAuthToken`, `getAcademyAuthFromRequest`,
  `clearAcademyAuthCookie`, helper normalizers (`normalizeAcademyEmail`, `normalizeAcademyUsername`,
  `academyAccountIdFromEmail`).

- `src/lib/auth-session.ts`: Imports `COOKIES` from `platform-config`.
  Removed local `COOKIE_ACADEMY_AUTH`, `COOKIE_STUDENT_SESSION`, `COOKIE_USER_SESSION` constants
  (were only used internally — no external callers confirmed by grep).
  Removed dead `isAnyAcademySession` export (zero external callers).
  Retained: `CanonicalSession` type, `getCanonicalSession()`.

### Deleted

- `src/lib/db-schema.ts`: Entirely `@deprecated` file with zero external callers (confirmed by grep).
  Contained `initSchema()` which imported `ensureStudentCartaxTables`, `ensurePhase5Tables`,
  `ensureCertificateTables` — all superseded by the Phase 22 migration runner. 334 lines removed.

### QA

- `npm run typecheck`: 0 errors
- `npm run lint`: 0 warnings, 0 errors
- `npm run build`: ✓ 292 pages, 7.0s, Proxy (Middleware) registered

---

## [v0.23] — 2026-06-28 — Legacy Cookie Retirement, API Standardization & CSP

### Security — Cookie Retirement

- Stopped issuing `tecpey_academy_auth` and `tecpey_student_session` legacy cookies on new logins.
  Only `tecpey_session` (unified JWT) is set on login/register since Phase 23.
- `getStudentSessionFromRequest()` and `getAcademyAuthFromRequest()` retain read-only fallback:
  check legacy cookie first, then fall back to unified cookie — existing browser sessions continue
  to work until their 30-day JWT expires.
- Logout still clears all three cookies (`clearStudentSessionCookie`, `clearAcademyAuthCookie`,
  `clearUnifiedSessionCookie`) to clean browsers holding legacy cookies.
- `academy-student-profile/route.ts`: removed `signStudentSession` + `setStudentSessionCookie` calls.
- `academy-auth/route.ts`: removed `signAcademyAuthSession` + `setAcademyAuthCookie` calls.

### Security — Content Security Policy

- Deleted `src/middleware.ts` (deprecated in Next.js 16).
- Created `src/proxy.ts` (Next.js 16 proxy convention, `export async function proxy(request)`).
- Per-request nonce via `Buffer.from(crypto.randomUUID()).toString("base64")`.
- CSP set on both request (`x-nonce` header) and response (`Content-Security-Policy` header).
- Directives: `default-src 'self'`, `script-src 'self' 'nonce-{n}' 'strict-dynamic'`,
  `style-src 'self' 'unsafe-inline'` (required: inlineCss + React SSR style attrs),
  `img-src 'self' data: blob: https:`, `font-src 'self' data:`,
  `connect-src 'self' https: wss: ws:`, `media-src 'none'`, `object-src 'none'`,
  `frame-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `upgrade-insecure-requests`. Dev adds `'unsafe-eval'` for React DevTools only.

### API Standardization

- Converted all remaining 14 `NextResponse.json()` calls to `apiOk()` / `apiError()` / `apiRateLimited()`.
  Routes: `ai-mentor` (6 calls), `crypto-news` (2), `mentor-conversations` (1), `mentor-insights` (1),
  `mentor-memory` (1), `mentor-profile/recompute` (2), `academy-specialized-lead` (1).
- Final remaining `NextResponse.json` count in API routes: **0**.

### QA

- `npm run typecheck`: 0 errors
- `npm run lint`: 0 warnings, 0 errors
- `npm run build`: ✓ 292 pages, Proxy (Middleware) registered

---

## [v0.22] — 2026-06-28 — Enterprise Identity and Migration Foundation

### Added — Unified Authentication

- `src/lib/unified-session.ts`: Single JWT cookie (`tecpey_session`) signed with
  `TECPEY_SESSION_SECRET`. Carries `accountId`, `studentId`, `email`, `displayName`,
  `username` in one `HttpOnly`, `SameSite=lax` cookie. Replaces the 3-cookie split.
- `src/lib/auth-session.ts`: `getCanonicalSession()` — reads unified cookie first,
  falls back to legacy 3-cookie system for backward compatibility with existing sessions.
- `academy-auth/route.ts`: Login issues unified cookie alongside legacy cookies.
  Logout clears all 4 cookies (`tecpey_academy_auth`, `tecpey_student_session`,
  `tecpey_session`, legacy `tecpey_student_id`).
- `academy-student-profile/route.ts`: Unified cookie re-issued to include `studentId`
  when a student profile is created or loaded.

### Added — Migration Runner

- `src/lib/db-migrate.ts`: Inline migration runner. Replaces ad-hoc `initSchema()`.
  Tracks applied migrations in `_migrations` table with SHA-256 checksums.
  Transaction-wrapped with ROLLBACK on failure. Idempotent via `CREATE TABLE IF NOT EXISTS`.
  Safe for serverless deployments (no filesystem access at runtime).

### Updated — API Standardization (Phase 22 batch)

- 20+ API routes converted from raw `NextResponse.json()` to `apiOk()` / `apiError()` /
  `apiRateLimited()`: `ai-mentor`, `career`, `challenges`, `command-center/*`,
  `community/*`, `device-token`, `health/*`, `learning-events`, `mentor-*`,
  `notification-brain`, `notifications/*`, `offline-sync`, `trading-arena`.

### QA

- `tsc --noEmit`: 0 errors
- `eslint`: 0 warnings
- Build: 292 pages pass

---

## [v0.21] — 2026-06-28 — Enterprise Security and API Hardening

### Added — CSRF Defense-in-Depth

- `academy/auth/login/route.ts`: Added `verifyCsrfOrigin()` check at the wrapper level
  (defense-in-depth — previously checked only inside the canonical handler).
- `academy/auth/register/route.ts`: Same CSRF guard added.

### Updated — Structured Logging Migration

- `src/lib/db.ts`: All `console.error` calls replaced with `logger.error`.
- `src/lib/auth-session.ts`: `console.error` → `logger.error` (2 calls).
- `src/lib/csrf.ts`: `console.error` → `logger.error`.
- `src/lib/mentor-events.ts`: Console calls replaced with structured logger.
- `src/lib/rate-limit.ts`: Warning logging migrated to `logger.warn`.
- `src/lib/api.ts`: Console calls migrated to `logger`.
- Zero production `console.*` remaining in `src/lib/` after this phase.

### Added — Security Headers

- `next.config.ts`: Added security header suite: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options`, `X-DNS-Prefetch-Control`, `Referrer-Policy`,
  `Permissions-Policy`, `Strict-Transport-Security` (2-year HSTS with preload),
  `X-XSS-Protection: 0` (disables legacy auditor per OWASP).

### Updated — Health Endpoint

- `/api/health`: Added Redis ping check (ok / unavailable / unconfigured),
  `version` (npm package version), `environment` (NODE_ENV), structured `checks` object.
  Status becomes `"degraded"` when Redis is unavailable.

### Updated — QA Infrastructure

- `package.json`: Added `"typecheck": "tsc --noEmit"` script for CI and local use.

### QA

- `tsc --noEmit`: 0 errors
- `eslint`: 0 warnings
- Build: 292 pages pass

---

## [v0.20] — 2026-06-28 — Production Readiness and Engineering Foundation

### Added — Database Migration Reference

- `migrations/0001_initial_schema.sql`: Complete schema snapshot for reference.
  Documents all tables created by the Phase 1–18 `initSchema()` calls.
- `migrations/README.md`: Migration rules, numbering convention, and runner plan.

### Added — Observability

- `src/lib/logger.ts`: Structured JSON logger. Fields: `ts` (ISO timestamp),
  `level`, `msg`, plus arbitrary context fields. Server-side only.

### Added — API Validation Helpers

- `src/lib/api-validation.ts`: `apiOk()`, `apiError()`, `apiRateLimited()`,
  `Validate.*`, `checkBodySize()` — shared response builders for API routes.

### Added — Community Career Tables

- `src/lib/db-schema.ts`: Added `academy_public_profiles`,
  `academy_professional_challenges`, `academy_challenge_progress` tables.

### Updated — CI and Engineering Constraints

- `.github/workflows/ci.yml`: Added npm version gate (major version must be 10).
- `package.json`: Set `engines.npm` to `>=10.0.0 <11.0.0` to prevent npm 11
  regenerating the lockfile with incompatible `libc` fields.

### QA

- `tsc --noEmit`: 0 errors
- `eslint`: 0 warnings
- Build: 292 pages pass

---

## [v0.19] — 2026-06-28 — Architecture Vision Refactor and Enterprise Planning

Architecture-only phase. Zero feature changes. Zero UI changes.

### Added — Strategic Documentation

Full audit of Phases 0–18 produced 9 planning documents:

- `docs/ARCHITECTURE_REVIEW.md`: 10-domain audit, 30+ findings, scorecard.
  Identified 5 critical gaps: localStorage as source of truth, no migration system,
  3-cookie auth split, no tenant model, zero observability.
- `docs/TECHNICAL_DEBT_REPORT.md`: Complete debt inventory with fix strategies.
- `docs/VISION_v2.md`: 12-pillar platform vision superseding v1.
- `docs/MASTER_ROADMAP_v2.md`: Phases 0–40 with dependencies, QA gates, rollback plans.
- `docs/PLATFORM_BLUEPRINT_v2.md`: Target identity, tenant, API, DB, and AI design.
- `docs/WHITEPAPER_STRUCTURE_v2.md`: Platform architecture and strategy whitepaper outline.
- `docs/DEPENDENCY_MAP.md`: Module graph, circular dependency analysis, localStorage chains.
- `docs/FUTURE_MODULES.md`: 18 future modules with data models and APIs.
- `docs/PHASE19_REPORT.md`: Final audit report with migration plan and risk matrix.

### QA

- `tsc --noEmit`: 0 errors
- `eslint`: 0 warnings
- Build: 292 pages pass

---

## [v0.18] — 2026-06-28 — Community & Social Learning Layer

### Added — Core Library

- `src/lib/community-profile.ts`: Privacy-first community profile. Interface: `CommunityPrivacySettings` (all defaults private/false), `CommunityProfile` (displayName, anonymousId, avatarInitials, privacy, groupInterests). Functions: `loadCommunityProfile()`, `saveCommunityProfile()`, `createCommunityProfile()` (generates anonymous ID `T-XXXXXX`), `updatePrivacy()`, `addGroupInterest()`, `removeGroupInterest()`, `sanitizeDisplayName()` (strips PII patterns). Storage: `tecpey-community-profile`.

- `src/lib/community-challenges.ts`: 5 weekly challenges cycling via `getCurrentWeekNumber() % 5`. Types: `ChallengeDifficulty`, `ChallengeFocus`, `Challenge`, `ChallengeParticipation`, `ChallengeCompletionCriteria` (union of 4 types). Functions: `getCurrentChallenge()`, `getNextChallenge()`, `loadParticipation()`, `joinChallenge()`, `markChallengeComplete()`. Label tables: `DIFFICULTY_LABEL`, `FOCUS_LABEL`. Storage: `tecpey-challenge-participation`.

- `src/lib/community-leaderboard.ts`: Behavioral-only leaderboard (profit ranking forbidden). Type: `LeaderboardCategory` (6 categories), `LeaderboardEntry`, `MyLeaderboardScores`. Functions: `computeMyLeaderboardScores()` (reads arena + behavioral engine, never uses P&L), `getLeaderboard()` (blends real score with 12 deterministic LCG demo peers), `generateDemoPeers()` (stable per category, seeded by name). Exports: `CATEGORY_LABEL`, `CATEGORY_DESCRIPTION`, `COMMUNITY_SAFETY_RULES` (7 rules).

- `src/lib/community-groups.ts`: 5 static demo study groups. Interface: `StudyGroup` (name, level, focusTopic, memberCount, weeklyGoal, progressSummary, groupChallenge, disciplineScore, isDemo). Groups: bitcoin-basics, risk-masters, psychology, behavioral-discipline, advanced-analysis. Labels: `LEVEL_LABEL`.

### Added — Components

- `src/components/academy/community/CommunityHub.tsx`: Main community hub. Sub-components: `ProfileSetup` (name input + privacy explanation), `MyScoreWidget` (5 dimension mini-scores), `ActiveChallengeCard` (current week challenge + join button), `NavTile` (route cards for 5 sub-sections), `SafetyRules` (expandable 7-rule list). Default-private messaging throughout.

- `src/components/academy/community/LeaderboardView.tsx`: Anti-profit leaderboard. Sub-components: `ScoreBar` (gradient for self, muted for others), `LeaderboardRow` (rank, avatar, name, demo badge, score bar), `MyScoreBreakdown` (5 dimension breakdown with weights), `LeaderboardView` (6 category tabs, anti-profit disclaimer, skeleton when no profile, safety rules footer). Demo peers labeled `نمایشی`.

- `src/components/academy/community/ChallengeCenter.tsx`: Weekly challenge UI. Sub-components: `checkChallengeCompletion()` (reads arena state + journal rate), `ActiveChallengePanel` (rules, scoring, reward, responsible trading note, join/check/complete buttons), `ChallengeHistoryCard` (past challenge status), `ChallengeCenter` (progress bar, active challenge, next week preview, history).

- `src/components/academy/community/StudyGroups.tsx`: Study group interest system. Sub-components: `GroupCard` (name, level, members, discipline score, focus/goal/challenge fields, interest button), `PrivacyGate` (opt-in gate for studyGroupInterest), `StudyGroups` (privacy gate → interest management → group cards). No chat, no DMs.

- `src/components/academy/community/PeerJournals.tsx`: Opt-in journal sharing. Functions: `sanitizeForSharing()` (strips PII, truncates, adds mentor note), `buildMentorNote()` (behavioral flag → coaching message). Sub-components: `SharedEntryCard` (asset, setup, mistake tags, lesson, mentor note), `SharingToggle` (opt-in/out with aria role=switch), `PeerJournals` (toggle + sanitized entries + 3 demo entries). Default off.

- `src/components/academy/community/InstructorDashboard.tsx`: Consent-gated instructor view. Sub-components: `ConsentGate` (explicit list of shared/not-shared data), `MetricBlock`, `WeakTopicsList` (knowledge-graph nodes not yet completed), `RiskPatternBar`, `InstructorDashboard` (profile → consent → `ConsentedView`), `ConsentedView` (6-metric grid, weakest/strongest dims, risk pattern bars, weak topics).

### Added — Routes

- `src/app/academy/community/page.tsx` — Updated: adds `CommunityHub` below existing `CommunityCareerPanel`
- `src/app/academy/community/leaderboards/page.tsx` — `LeaderboardView`
- `src/app/academy/community/challenges/page.tsx` — `ChallengeCenter`
- `src/app/academy/community/groups/page.tsx` — `StudyGroups`
- `src/app/academy/community/journals/page.tsx` — `PeerJournals`
- `src/app/academy/community/instructor/page.tsx` — `InstructorDashboard`

### Added — Documentation

- `docs/COMMUNITY_LEARNING_LAYER.md`: Full spec — privacy model, leaderboard anti-profit formulas, challenge criteria, study group architecture, journal sanitization, instructor consent flow, Phase 19 migration path.
- `docs/REWARD_SYSTEM.md`: Phase 18 section — community challenge XP bonuses, anti-gaming rules.
- `docs/TRADING_DNA_MODEL.md`: Phase 18 section — community leaderboard integration, excluded signals (winRate, avgPnlPct, totalPnl).
- `docs/MENTOR_AI_MODEL.md`: Phase 18 section — Instructor Dashboard architecture, consent stages, shared vs. not-shared data table, privacy boundaries.

### QA

- `npx tsc --noEmit`: 0 errors
- `npm run lint`: 0 errors, 0 warnings
- `npm run build`: Pass — all 6 community routes build as dynamic server routes

---

## [v0.17] — 2026-06-27 — Trading Arena V2: Behavioral Trading Simulator

### Added — Core Library

- `src/lib/trading-arena.ts`: Complete paper-trading engine. Types: `OpenPosition`, `ClosedTrade`, `PendingOrder`, `TradingArenaState`, `MentorFlag`. Functions: `createFreshArenaState()`, `loadArenaState()`, `saveArenaState()`, `executeMarketBuy()` (with slippage ±0.05%), `closePosition()`, `addLimitOrder()`, `cancelLimitOrder()`, `processPriceTick()` (fills limit orders + checks SL/TP), `computeUnrealizedPnl()`, `computeNetEquity()`, `computeArenaStats()`, `resetArenaState()`. Mentor flag detection at trade open: `no-stop-loss`, `over-risk`, `impulse-entry`, `revenge-trade`, `good-discipline`, `proper-sizing`, `target-hit`, `fomo-entry`. Fee: 0.1% per side. Max positions: 5. Storage: `tecpey-trading-arena`.

- `src/lib/trading-scenarios.ts`: 6 production scenarios with deterministic LCG/custom price sequences. Each scenario includes: objective, marketContext, concept, allowedActions, initialBalance, priceSequence, successCriteria, failureCriteria, mentorFeedback (pass/fail headline + body + keyLesson), dnaImpact (6 behavioral dimensions). Scenarios: `beginner-btc` (interface basics), `volatility` (patience under swings), `fomo-scenario` (FOMO resistance — success = zero trades), `revenge-trading` (revenge control), `risk-management` (stop-loss discipline), `news-reaction` (event-driven decision quality).

- `src/lib/trading-journal.ts`: Trade journal storage. Types: `EmotionalState` (6 states), `MistakeTag` (10 tags), `JournalEntry`. Functions: `createJournalEntry()`, `loadJournal()`, `saveJournalEntry()`, `completeJournalEntry()`, `getJournalCompletionRate()`. Persian label tables: `EMOTIONAL_STATE_LABEL`, `MISTAKE_TAG_LABEL`. Storage: `tecpey-trading-journal`.

- `src/lib/trading-dna.ts`: Trading DNA behavioral signal extraction. `collectTradingDNASignals()` reads arena state + journal and produces: stopLossRate, overRiskRate, revengeTradeRate, impulseRate, journalCompletionRate, winRate, targetHitRate, scenariosCompleted, scenariosPassed, avgPnlPct. Scorer functions: `tradingRiskScore()`, `tradingPatienceScore()`, `tradingFOMOScore()`, `tradingRevengeScore()`, `tradingReflectionScore()`, `tradingDecisionScore()`. `blendWithTrading()` weights trading data 0%→40% as trades accumulate (0→10+ trades).

### Updated — Behavioral Engine

- `src/lib/behavioral-engine.ts`: Added `trading: TradingDNASignals` to `RawInputs`. `collectInputs()` now calls `collectTradingDNASignals()`. 7 dimension scorers now blend learning + trading signals: `scoreDisipline`, `scorePatience`, `scoreRiskManagement`, `scoreReflection`, `scoreFomoRisk`, `scoreRevengeRisk`, `scoreDecisionQuality`. Zero-safe: when no trading data exists, blend weight is 0% (full backward compatibility with Phase 16 behavior).

### Added — Components

- `src/components/academy/trading-arena/TradingArenaDashboard.tsx`: Main arena UI. Sub-components: `useSimulatedPrices` (±0.12%/2s random walk, BTC seed $65k, ETH seed $3.5k), `JournalModal` (pre-trade plan + emotional state modal), `TradeForm` (asset + order type + amount + SL/TP), `PositionRow` (live P&L, close button, SL warning), `TradeRow` (closed trade history), `MentorFlagBadge` (colored flag display), `TradingArenaDashboard` (main). Safety disclaimer always visible. Mentor flag analysis box with warning messages. Balance / equity / stats row. Reset with confirm gate.

- `src/components/academy/trading-arena/ScenarioPlayer.tsx`: Complete scenario experience. Sub-components: `PriceSparkline` (SVG line chart of scenario price history), `ScenarioCard` (list item with pass/fail badge + start button), `ActiveScenario` (briefing → trading → result phases with timer, SL/TP checking, success/failure evaluation, mentor feedback, DNA impact grid), `ScenarioList` (main with progress bar). All 6 success/failure evaluation modes implemented.

- `src/components/academy/trading-arena/JournalView.tsx`: Trade journal UI. Sub-components: `PostTradeForm` (reflection + mistake tags + lesson learned), `JournalEntryDetail` (expandable entry with pre/post sections), `MistakePatternSummary` (horizontal bar chart of most frequent mistakes), `JournalView` (main with stats row, pending reflections first, completed entries). Education note footer.

### Added — Routes

- `src/app/academy/trading-arena/page.tsx` — `/academy/trading-arena`
- `src/app/academy/trading-arena/scenarios/page.tsx` — `/academy/trading-arena/scenarios`
- `src/app/academy/trading-arena/journal/page.tsx` — `/academy/trading-arena/journal`

### Updated — Documentation

- `docs/TRADING_SIMULATOR_SPECIFICATION.md` — v2.0, Phase 17 implementation summary
- `docs/TRADING_DNA_MODEL.md` — v2.0, signal collection and blending implementation details

### Safety and Responsible Trading

- "Simulated trading" banner on every route (cannot be dismissed)
- No profit guarantees anywhere in the UI
- Mentor feedback always educational, never financial advice
- Security disclaimer in JournalView footer
- Mentor flag system warns on over-risk, no-stop-loss, revenge trades, FOMO entries
- FOMO scenario's correct answer is "zero trades" — explicitly anti-gambling

### QA Results

- TypeScript: ✓ 0 errors
- ESLint: ✓ 0 errors, 0 warnings
- Build: ✓ PASS (287 pages generated, +3 new routes)

**Tag:** `v0.17-trading-arena-v2`

---

## [v0.16] — 2026-06-27 — AI Mentor V2: Behavioral Intelligence Engine

### Added — Behavioral Engine Libraries

- `src/lib/behavioral-engine.ts`: Client-side behavioral intelligence. Computes 12 behavioral dimensions from localStorage (academy-progress + spaced-repetition + reflection entries): Discipline, Patience, Risk Management, Consistency, Reflection, Confidence, FOMO Risk, Revenge Risk, Preparation, Knowledge Depth, Decision Quality, Execution Quality. Each score includes: value 0–100, trend (up/down/stable/new), Persian explanation, evidence items, action suggestion. `loadOrComputeSnapshot()` with 5-minute localStorage cache. `DIMENSION_LABELS` and `DIMENSION_DESCRIPTIONS` lookup maps. No network calls — pure computation.

- `src/lib/knowledge-graph.ts`: Static topic prerequisite graph for Term 1 concepts (13 concept nodes, 14 prerequisite edges). Functions: `findAllPrerequisites()` (BFS traversal), `getConceptRecommendations()` (returns prioritized review recommendations when a student fails), `getConceptStatusMap()` (mastered vs. weak based on lesson scores). If student fails `scarcity-vs-price`, automatically recommends reviewing `bitcoin-supply` first.

- `src/lib/smart-review.ts`: Adaptive review scheduler combining SM-2 due cards + low-score lesson retries + knowledge graph prerequisite recommendations + missing reflections + next unstarted lesson. Returns `SmartReviewQueue` with priority-sorted items, estimated minutes, due flashcard count. Deduplicates by item ID. `buildSmartReviewQueue()` operates purely from localStorage.

- `src/lib/coaching-engine.ts`: Deterministic coaching generation — no AI API calls. Generates daily, weekly, and monthly coaching cards from behavioral snapshots. Each card includes: headline, body, why, evidence, suggestedAction, expectedImprovement, focusDimension, tone (celebrate/encourage/challenge/warn). Also generates: `generateWarnings()` (critical/important/advisory), `generateEncouragements()` (positive reinforcement), `generateReviewReminder()`. All output in Persian. Full content table for all 12 dimensions (`DIMENSION_COACHING`).

### Added — AI Mentor V2 API

- `src/app/api/ai-mentor-v2/route.ts`: Anthropic Claude API integration for behavioral coaching. CSRF-protected, rate-limited (10 req/min). Injects full behavioral context (overall score, weakest/strongest dimension, learning velocity, style, top warnings) into Claude system prompt. Sensitive data filter (Seed Phrase, private keys). Falls back to local message gracefully when `ANTHROPIC_API_KEY` is absent. Supports `claude-haiku-4-5-20251001` as default model (configurable via `ANTHROPIC_MENTOR_MODEL`). No streaming required — synchronous JSON response.

### Added — Academy V2 Components

- `src/components/academy/v2/LearningInsightsDashboard.tsx`: Premium learning insights dashboard. Components: `RadarChart` (SVG polygon, 8 behavioral dimensions), `XpProgressBar` (animated gradient progress bar), `StudyCalendar` (30-day activity heatmap), `KnowledgeMapViz` (concept nodes by lesson, color-coded mastered/weak/pending), `ProjectionCard` (completion %, graduation ETA, scholarship probability, prop qualification probability), `DimensionBar` (all 12 dimensions with trend arrows), `ReviewQueueWidget` (smart review queue with type icons). Full daily coaching card. 5-minute client-side initialization via `useRef(initialized)`. RTL layout, ARIA labels, responsive grid.

- `src/components/academy/v2/MentorV2.tsx`: Behavioral coaching interface. NOT a chatbot. Shows: overall behavioral score with strongest/weakest dimensions, daily/weekly/monthly coaching tabs (expandable with why/evidence/action/improvement), behavioral score grid (12 score pills with trend icons), weakest-dimension focus card with action, smart review queue (prioritized items with type icons), warnings (critical/important), encouragements, and "Ask Mentor" section (calls `/api/ai-mentor-v2` with full behavioral context injection, handles errors gracefully, security disclaimer). No chatbot scroll, no history list — focus on behavioral coaching.

### Added — Routes

- `src/app/academy/mentor-v2/page.tsx` — `/academy/mentor-v2` with canonical metadata
- `src/app/academy/insights/page.tsx` — `/academy/insights` with canonical metadata

### Updated

- `.env.example`: Added `ANTHROPIC_API_KEY` and `ANTHROPIC_MENTOR_MODEL` entries

### Architecture

- Behavioral engine: fully client-side (no DB, no API). Works immediately for all users.
- Knowledge graph: static (no DB). Enables automatic prerequisite recommendations.
- Coaching engine: deterministic (no AI). Generates consistent, evidence-based coaching.
- AI API: used only when student explicitly asks a question. Falls back gracefully.
- All new components: RTL, keyboard-accessible, ARIA-labeled, responsive.

### QA Results

- TypeScript: ✓ 0 errors
- ESLint: ✓ 0 errors, 0 warnings
- Build: ✓ PASS (284 pages generated, +2 new routes)

**Tag:** `v0.16-ai-mentor-v2`

---

## [v0.15] — 2026-06-27 — Academy V2: World-Class Learning Experience

### Added — Learning Engine Libraries
- `src/lib/spaced-repetition.ts`: Complete SM-2 algorithm implementation (SuperMemo 1987 — Peter Wozniak). Types: `CardState`, `ReviewGrade`. Core functions: `createCard()`, `reviewCard()`, `isDue()`, `getDueCards()`, `daysUntilReview()`. Deck persistence: `loadDeck()`, `saveDeck()`, `upsertCard()`, `ensureCards()`. Storage key: `"tecpey-sr-deck"`.
- `src/lib/academy-progress.ts`: Progress Engine — XP, streak, level (12 levels, 0–39,000 XP), lesson completion, module scores, term status, badges. Functions: `awardXp()`, `recordLessonComplete()`, `recordModuleScore()`, `passTerm()`, `awardBadge()`, `isLessonUnlocked()`, `onProgressChange()`. Custom event `"tecpey-academy-progress-updated"` for reactive UI. Storage key: `"tecpey-academy-progress-v2"`.

### Added — Curriculum Data
- `src/data/academy/term1Curriculum.ts`: Enriched Term 1 data with full TypeScript types (`Term`, `Module`, `Lesson`, `QuizQuestion`, `Flashcard`, `LessonSection`, `PracticeExercise`). 1 module, 3 fully authored lessons (درس ۱: پول و اعتماد; درس ۲: بیت‌کوین؛ درس ۳: بلاکچین). Each lesson contains: learning objectives, content sections with callouts, in-lesson knowledge checks (SM-2-graded), flashcards with front/back/example/relatedTerms, key takeaways, mentor note, practice exercise (checklist/reflection/scenario), reflection prompt, responsible trading insert, next lesson teaser. 10-question module quiz with multi-type questions. Helper functions: `extractFlashcardIds()`, `getLessonById()`, `isLessonAccessible()`.

### Added — Academy V2 Components
- `src/components/academy/v2/QuizEngineV2.tsx`: Multi-type quiz engine with mastery gate. Supported types: `single`, `multi`, `ordering` (drag-and-drop), `matching`, `fillblank`, `scenario`. Features: immediate post-answer feedback with explanation, progress bar with live %, timer, difficulty labels, ARIA labels throughout. Grading: `gradeAnswer()` handles all types including partial credit for matching. State managed via `useReducer`. Configurable pass threshold (default: 80% knowledge-check, 75% module, 70% term exam), retake cooldown, review CTA. Result screen shows pass/fail with elapsed time.
- `src/components/academy/v2/FlashcardDeck.tsx`: SM-2 flashcard component. Card flip animation with front (question) / back (answer + example). Touch swipe support (right = easy grade 5, left = hard grade 1). Grade buttons: 4 levels (نمی‌دانستم/سخت/خوب/آسان → SM-2 grades 1/3/4/5). Due-only mode and study-all mode. Session stats (reviewed, easy, medium, hard, again). Awards `XP_TABLE.FLASHCARD_SESSION` XP once per day. Session complete screen with stats. Empty state when no cards due. Related terms display. Full ARIA accessibility.
- `src/components/academy/v2/LessonPlayerV2.tsx`: Full production lesson player. 4-phase flow: `reading → knowledge-check → flashcards → quiz → complete`. Reading phase: lesson header (title, objectives, meta tags), scrollable content with live scroll progress bar, section content renderer, callout component (warning/tip/important/responsible), key takeaways, collapsible mentor note, practice exercise panel (checklist with completion feedback), reflection journal (localStorage saved), responsible trading card. XP progress widget (reactive to progress events). Knowledge-check phase: QuizEngineV2 at 80% threshold. Flashcard phase: FlashcardDeck in study-all mode. Quiz phase (mastery gate): 80% required. Complete phase: trophy screen, XP display, next-lesson CTA, reflection prompt, responsible trading reminder.
- `src/components/academy/v2/LessonPlayerV2Client.tsx`: Thin client wrapper — wires `useRouter` for next-lesson navigation.
- `src/components/academy/v2/FlashcardsPageClient.tsx`: Daily flashcard hub with due-count/total stats, two modes (mрови امروز / مرور همه), counts from live SM-2 deck.

### Added — Routes
- `src/app/academy/learn/[termSlug]/[lessonIndex]/page.tsx`: Individual lesson page with `generateStaticParams()` (pre-generates all Term 1 lessons), `generateMetadata()`, notFound() on invalid slugs.
- `src/app/academy/flashcards/page.tsx`: Daily flashcard review page with canonical metadata.

### Learning Science Implemented
- **Active Recall**: Every lesson ends with mastery-gated quiz
- **Spaced Repetition**: SM-2 algorithm with exact SuperMemo 1987 EF formula
- **Immediate Feedback**: Explanation shown after every answer
- **Mastery Learning**: 80% gate — lesson locked until passed
- **Retrieval Practice**: Knowledge checks mid-lesson before quiz
- **Micro Learning**: 8–10 min lessons, single concept focus
- **Reflection**: Per-lesson reflection journal saved to localStorage
- **Responsible Trading**: Insert in every lesson and completion screen

### QA Results
- TypeScript: ✓ 0 errors
- ESLint: ✓ 0 errors, 0 warnings
- Build: ✓ PASS (282 pages generated)

**Tag:** `v0.15-academy-v2`

---

## [v0.14] — 2026-06-27 — Global Academy Strategy & Educational Constitution

### Added — Strategic Documents (10 documents, 4,247 lines)
- `docs/ACADEMY_COMPETITIVE_BENCHMARK.md`: Benchmarks 17 global/Iranian competitors; extracts principles; defines TecPey's gap
- `docs/ACADEMY_EDUCATIONAL_STANDARD.md`: Binding educational constitution — learning science, content standards, assessment rubrics, certification criteria, ethics, privacy
- `docs/ACADEMY_CURRICULUM_BLUEPRINT.md`: Complete 7-term curriculum + 3 advanced tracks + TCP/TCM professional track
- `docs/LEARNING_EXPERIENCE_GUIDE.md`: Lesson design, flashcard SM-2, spaced repetition, revision mode, streak, motivation architecture
- `docs/TRADING_SIMULATOR_SPECIFICATION.md`: Trading Arena full spec — real feeds, journal, scenario training, discipline-weighted leaderboard, replay mode
- `docs/MENTOR_AI_MODEL.md`: AI Mentor architecture — behavioral analysis, Socratic coaching, emotional detection, weekly/monthly reports
- `docs/TRADING_DNA_MODEL.md`: Proprietary 12-dimension behavioral competence framework with weighted composite scoring
- `docs/REWARD_SYSTEM.md`: XP, levels, badges, scholarships, prop qualification pathway, fraud prevention
- `docs/GLOBAL_STRATEGY.md`: 3-phase expansion (Iran → Middle East → Global) with language, localization, and compliance frameworks
- `docs/TECPEY_UNFAIR_ADVANTAGE.md`: Product differentiation — why TecPey exists and what no competitor provides

### Changed
- `README.md`: Bilingual (fa/en), Academy structure table, complete strategic docs index, updated roadmap through Phase 20, CI badge added

**Tag:** `v0.14-academy-strategy`

---

## [v0.13.5] — 2026-06-27 — Enterprise QA Stabilization and CI Readiness

### Fixed
- `package-lock.json`: synchronized with `package.json` to resolve `npm ci` failure in GitHub Actions (`@swc/helpers@0.5.23` mismatch)
- `src/app/crypto/[symbol]/page.tsx`: removed unused `Navbar` import (ESLint `no-unused-vars`)
- `src/components/academy/AiMentorExperience.tsx`: removed unused `useMemo` import (ESLint `no-unused-vars`)
- `src/components/academy/AcademyCertificatesClient.tsx`: replaced `<img>` with `<Image>` from `next/image` for QR code display; removed stale `eslint-disable-next-line` comment

### Changed
- `eslint.config.mjs`: rule tuning carried forward from Phase 13 sessions

### CI Workflow Fix
- `.github/workflows/ci.yml`: removed global `NODE_ENV=production` (caused `npm ci` to skip devDependencies, making `tsc` and `eslint` unavailable); scoped it to the Build step only
- `.github/workflows/ci.yml`: tightened ESLint gate to `--max-warnings 0` (was 130)

### QA Results
- ESLint: ✓ 0 errors, 0 warnings
- TypeScript: ✓ 0 errors
- Build: ✓ PASS (278 pages generated)
- `npm ci`: ✓ PASS
- GitHub Actions: ✓ PASS

**Tag:** `v0.13.5-enterprise-qa`

---

## [v0.13] — 2026-06-26 — Production Hardening

### Added
- `.github/workflows/ci.yml`: GitHub Actions CI — install, TypeScript, ESLint, build on every push and PR to `main`
- `src/app/global-error.tsx`: root-level production error boundary (replaces root layout on unhandled errors)
- `next.config.ts`: `headers()` — security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-DNS-Prefetch-Control) at Next.js level for defense-in-depth
- `next.config.ts`: `experimental.inlineCss: true` — inlines Tailwind CSS into HTML, eliminates render-blocking stylesheet request for first-time visitors
- `src/app/sitemap.ts`: 7 missing English pages added (`/en/swap`, `/en/business`, `/en/careers`, `/en/compare-exchanges`, `/en/listing`, `/en/media`, `/en/partners`)

### Changed
- `next.config.ts`: `poweredByHeader: false` — removes `X-Powered-By: Next.js` fingerprinting header
- `next.config.ts`: removed stale `experimental.cpus: 4` (undocumented in Next.js 16)
- `docs/Deployment.md`: updated Node.js version to 22.x; added CI/CD section
- `docs/Roadmap.md`: Phase 13 moved to Completed; Phase 14 promoted to next planned

**Tag:** `v0.13-production-hardening`

---

## [v0.12] — 2026-06-26 — Enterprise GitHub Foundation

### Added
- Professional `README.md` with full project documentation
- `LICENSE` (proprietary, TechnoPardakht)
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `docs/Architecture.md`
- `docs/Deployment.md`
- `docs/API.md`
- `docs/Branding.md`
- `docs/Roadmap.md`
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- GitHub remote configured and all branches/tags pushed

**Tag:** `v0.12-enterprise-foundation`

---

## [v0.11] — 2026-06-26 — Enterprise Visual Polish

### Changed
- Persian 404 page (`not-found.tsx`): full enterprise upgrade, all legacy CSS classes removed
- Persian About page (`about/page.tsx`): 15+ legacy class replacements with enterprise tokens
- `AcademyAuthClient.tsx`: password minimum validation updated to 10 characters (matches API)
- `PriceCardSkeletone.tsx`: replaced `bg-gray-600/50 animate-pulse` with `.skeleton` class
- `PriceTableSkeletone.tsx`: full enterprise skeleton refactor
- `ui/Skeleton.tsx`: enterprise `.skeleton` class, proper TypeScript props
- `ContentUI.tsx`: fixed invalid `bg-white/82` Tailwind value; ContentShell uses token-based dark mode

### Added
- `globals.css`: reduced-motion media query block for all animations
- `globals.css`: mobile safe-area inset utilities (`.pb-safe`, `.pt-safe`, `.sticky-cta-bar`)
- `globals.css`: horizontal table scroll utility (`.tp-table-scroll`)
- `globals.css`: unified form input class (`.tp-input`)
- `globals.css`: unified alert state classes (`.tp-alert-error/success/warn`)
- `globals.css`: unified badge system (`.tp-badge`, `.tp-badge-success/warn/error`)
- `globals.css`: empty state component class (`.tp-empty`)
- Mobile sticky CTAs now use `sticky-cta-bar` for iPhone notch support

**Tag:** `v0.11-enterprise-polish`

---

## [v0.10] — 2026-06-26 — Enterprise UI/UX Redesign

### Added
- Enterprise design system in `globals.css` (~200 lines): keyframes, skeleton, `.tp-card`, `.tp-btn-*`, `.tp-label`, `.tp-gradient-text`, focus rings, hover-lift, scrollbar, page transition
- `src/app/en/layout.tsx`: LTR wrapper for English subtree
- `src/app/en/not-found.tsx`: English 404 page
- English pages: `/en/about`, `/en/contact-us`, `/en/faq`, `/en/security`, `/en/fees` — full content parity with Persian equivalents
- `EnglishUI.tsx`: full rewrite with `EnglishShell`, `EnglishHero`, `EnglishCard`, `EnglishSectionLabel`, `EnglishCTA`

### Changed
- `TecpeyEnterpriseLanding.tsx`: hero CTAs updated to "ورود به صرافی" + "آکادمی رایگان" spec; MobileStickyCTA rebuilt as two equal-width buttons
- `EnglishLandingClient.tsx`: hero CTAs updated to "Enter Exchange" + "Enter Academy"; mobile sticky CTA added; stale import removed
- `HtmlLangDir.tsx`: `lang="en"` corrected to BCP 47 `"en-US"`
- `StructuredData.tsx`: added `@id` anchor to organization schema; fixed `inLanguage` to `["fa-IR", "en-US"]`

**Tag:** `v0.10-enterprise-ui`

---

## [v0.9.5] — QA Security & SEO Blockers (15 fixes)

### Security
- CSRF protection added to 20 previously unprotected state-changing API routes
- `csrf.ts`: fail-closed in production when `NEXT_PUBLIC_SITE_URL` is unset
- JWT secret fallback chain hardened — removed 4-env fallback, single secret per purpose
- Password minimum raised from 6 to 10 characters in API route
- Admin session shortened from 8 hours to 15 minutes

### SEO
- OG image paths made absolute everywhere (`https://tecpey.ir/images/...`)
- Breadcrumb fragment URL fixed (`/#academy` → `/academy`)
- Organization schema consolidated with `@id` anchor; duplicate removed from `page.tsx`
- `inLanguage` corrected to `["fa-IR", "en-US"]`

### Fixes
- `DATABASE_URL` logs clear error in production when missing or placeholder
- `/en/layout.tsx` created (LTR wrapper)
- `/en/not-found.tsx` created
- `TradingToolsClient.tsx` reformatted via Prettier

---

## [v0.1–v0.9] — Core Platform

### Included
- Next.js App Router architecture (Persian RTL primary)
- Academy: 7-term learning path, quizzes, term gates, progress tracking
- AI Mentor: context-aware educational prompt routing
- Trading Arena: practice simulator with discipline scoring
- Community career system: badges, hall of fame, career readiness
- Market board: real-time prices, swap, 50+ crypto dossiers
- Trader toolbox: 20+ analysis and risk tools
- Bilingual foundation: fa-IR + en-US routes
- SEO architecture: Schema.org, canonical URLs, structured data
- Footer, Navbar, authentication, onboarding flow
- Docker, Nginx, systemd deployment setup
