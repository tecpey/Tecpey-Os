# PHASE 39.5 MASTER PLAN

Date: 2026-07-02  
Owner: Lead Engineering  
Input audit: `docs/engineering/phase39/PROJECT_AUDIT_PHASE39.md`  
Scope: execution planning only. This document does not implement source changes.

## 1. Executive Summary

Phase 39.5 is a stabilization and release-readiness phase. The platform already has strong foundations: Next.js 16, TypeScript, PostgreSQL, Redis, JWT sessions, CSRF helpers, CSP/HSTS, WebSocket support, trading/wallet modules, deployment templates, and a broad academy/product surface. The risk is that several production paths are incomplete, inconsistent, or fallback-driven.

The safest strategy is to harden the platform in layers:

1. Freeze and clarify release scope.
2. Close security blockers before touching financial flows.
3. Align runtime and deployment paths so production runs the same server capabilities as development.
4. Add repeatable QA gates and test execution.
5. Disable or explicitly gate incomplete financial features.
6. Improve UX, SEO, accessibility, and performance after the platform is safe to ship.

Execution rule: no milestone should merge unless its QA gate passes and rollback path is documented.

## 2. Critical Blockers

### Security

- State-changing authenticated routes have inconsistent CSRF/origin enforcement.
- Admin cookie stores the raw admin token value.
- Internal price-feed alert endpoint is public and unauthenticated.
- API-key replay protection degrades when Redis is unavailable.
- Rate limiting falls back to per-instance memory in production.
- Local JSON auth storage can be enabled in production.
- KYC can return mock sessions when provider env is missing.
- CSP falls back to broad `https:`, `wss:`, and `ws:` when env vars are incomplete.

### Architecture

- PM2 starts `next start`, while `npm start` starts `server.ts`; PM2 bypasses WebSocket, Redis pub/sub, and withdrawal worker bootstrap.
- Auth model spans unified sessions, refresh tokens, legacy cookies, academy auth, student auth, admin token, and API keys.
- DB schema exists in both SQL and TypeScript migration strings.
- Phase 39 wallet/HSM/MPC files are untracked and not release-scoped.
- Stop-limit, HSM, MPC, KYC, and price-feed alerting are not fully implemented.

### Performance

- Global `Navbar`, `Footer`, and `GlobalAiMentorWidget` load through the root layout.
- Multiple chart systems are present.
- Many academy/product pages rely on localStorage scanning and client computation.
- In-memory order book/rate-limit fallbacks do not scale across instances.
- `inlineCss` may reduce first-load blocking but hurts repeat-load caching.

### UX

- Persian and English pages use different shells and styling systems.
- Contact forms look functional but only route to mailto.
- Academy route surface is broad, but some pages are shallow CTA shells.
- Card radius, color, dark-mode, and spacing patterns vary heavily.

### SEO

- English routes set `lang/dir` at a wrapper level and rely on hydration to correct root HTML attributes.
- Metadata appears strong on some routes but inconsistent across the large route surface.
- Some docs and structured-data references may be stale relative to implementation.
- Broad route surface increases risk of thin/duplicative pages.

### Accessibility

- Root `html` language/direction mismatch for English pages can affect screen readers before hydration.
- Many custom controls and visual-only cards need keyboard/focus review.
- Color-heavy dark slate/cyan layouts need contrast checks.
- Contact forms lack real labels and submit semantics.

## 3. Risk Matrix

| Risk | Impact | Probability | Priority | Notes |
|---|---:|---:|---:|---|
| CSRF gaps in authenticated state-changing routes | High | High | P0 | Direct account/security risk |
| Raw admin token stored as cookie value | High | Medium | P0 | Cookie theft equals token theft |
| Production PM2 path bypasses custom server | High | High | P0 | WebSocket/workers/pubsub absent |
| API-key replay protection disabled without Redis | High | Medium | P0 | Financial API risk |
| Incomplete HSM/MPC selected by env and throwing | High | Medium | P0 | Withdrawal/signing failure |
| Mock KYC session in production | High | Medium | P0 | Compliance risk |
| Untracked Phase 39 files and unrelated artifacts | Medium | High | P1 | Release ambiguity |
| Missing test runner despite wallet tests | Medium | High | P1 | No repeatable safety net |
| LocalStorage-heavy academy state | Medium | Medium | P2 | Data loss/privacy/perf risk |
| SEO lang/dir mismatch on English pages | Medium | Medium | P2 | Search and accessibility risk |
| Multiple chart/icon stacks | Medium | Medium | P2 | Bundle and design drift |
| Visual-only contact forms | Low | High | P3 | Trust/UX issue |

Priority scale: P0 blocks production release, P1 blocks confident release, P2 should land before growth push, P3 can follow after stabilization.

## 4. Milestones

### Milestone 0: Release Scope Freeze

- Goal: Make the worktree and release boundary explicit before implementation.
- Expected outcome: Clear list of in-scope files, out-of-scope artifacts, and Phase 39 wallet files status.
- Files involved:
  - `docs/engineering/phase39/PROJECT_AUDIT_PHASE39.md`
  - `docs/engineering/phase39/PHASE39_5_MASTER_PLAN.md`
  - `.gitignore`
  - untracked root artifacts
  - `src/lib/wallet/**`
- Estimated complexity: Low.
- Estimated time: 0.5 day.
- Dependencies: None.
- Validation checklist:
  - `git status --short` reviewed.
  - Untracked source files classified as include/defer/remove.
  - Non-project files classified as ignore/remove/manual owner review.
  - No production code changed during classification.
- Rollback strategy: Revert only documentation/scope notes; do not delete user files without explicit approval.
- Automation: Automatic for inventory and status reporting.
- Manual review: Required for deciding whether untracked wallet files are product scope.
- Dangerous: Deleting or moving untracked user artifacts.
- Done criteria:
  - Release scope document agreed.
  - No ambiguous Phase 39 files remain unclassified.

### Milestone 1: Security P0 Hardening

- Goal: Close production-blocking security gaps.
- Expected outcome: State-changing routes have consistent CSRF/origin checks or signed API auth, admin sessions no longer store raw admin token, internal alert endpoint is protected, production replay/rate-limit behavior is explicit.
- Files involved:
  - `src/lib/csrf.ts`
  - `src/lib/admin-auth.ts`
  - `src/lib/auth-session.ts`
  - `src/lib/rate-limit.ts`
  - `src/lib/security/api-key-auth.ts`
  - `src/app/api/auth/sessions/**/route.ts`
  - `src/app/api/api-keys/**/route.ts`
  - `src/app/api/admin/**/route.ts`
  - `src/app/api/internal/price-feed-status/route.ts`
  - `scripts/validate-env.mjs`
- Estimated complexity: High.
- Estimated time: 2-4 days.
- Dependencies: Milestone 0 scope freeze.
- Validation checklist:
  - All cookie-auth POST/PUT/PATCH/DELETE routes either call `verifyCsrfOrigin` or document why not.
  - API-key signed routes do not require CSRF but require valid signature and replay prevention.
  - Admin session cookie contains a signed opaque session token or nonce, not the raw admin token.
  - Production mode fails closed for API-key replay protection when Redis is required.
  - Internal price-feed status requires server token, same-origin CSRF, or another explicit trust boundary.
  - `npm run lint`, `npm run typecheck`, and targeted route tests pass.
- Rollback strategy:
  - Keep route changes small and isolated.
  - If auth regression appears, revert security commit as a unit and re-enable previous route behavior temporarily behind maintenance mode.
- Automation: Route scans, lint, typecheck, targeted tests.
- Manual review: Required for auth/session semantics and admin behavior.
- Dangerous: Changing session/auth behavior can lock out admins/users.
- Done criteria:
  - No known P0 security gaps remain open.
  - Manual security review approves route-by-route posture.

### Milestone 2: Runtime and Deployment Alignment

- Goal: Ensure every production path starts the same platform capabilities.
- Expected outcome: Docker, PM2, systemd, and npm production commands consistently run the custom server when WebSocket, Redis pub/sub, and withdrawal workers are required.
- Files involved:
  - `package.json`
  - `server.ts`
  - `Dockerfile`
  - `ecosystem.config.cjs`
  - `deploy/systemd/tecpey-web.service`
  - `DEPLOY_UBUNTU_24*.md`
  - `docs/Deployment.md`
  - `scripts/check-health.mjs`
- Estimated complexity: Medium.
- Estimated time: 1-2 days.
- Dependencies: Milestone 1 for protected runtime health signals.
- Validation checklist:
  - Local production start path documented.
  - Docker CMD uses intended server path.
  - PM2 config uses intended server path.
  - Systemd service uses intended server path.
  - Health endpoint confirms DB, Redis, worker mode, and WebSocket mode where possible.
  - Smoke test confirms `/ws` upgrade works through custom server.
- Rollback strategy:
  - Keep old `next start` command available as `start:next`.
  - Revert deployment config commit if server bootstrap fails in staging.
- Automation: Command/config consistency checks and health smoke scripts.
- Manual review: Required for production ops owners.
- Dangerous: Changing process manager commands can cause downtime.
- Done criteria:
  - One authoritative production start path exists.
  - Staging can boot with DB/Redis and serve HTTP plus WS.

### Milestone 3: Environment and Production Fallback Policy

- Goal: Make production fail clearly when required services are not configured.
- Expected outcome: Env validation covers security, Redis, refresh tokens, KYC, alerting, wallet, HSM/MPC, and production URLs; dangerous dev fallbacks are blocked in production.
- Files involved:
  - `scripts/validate-env.mjs`
  - `.env.example`
  - `.env.local.example`
  - `.env.production.example`
  - `src/lib/rate-limit.ts`
  - `src/lib/security/api-key-auth.ts`
  - `src/lib/compliance/sumsub.ts`
  - `src/lib/academy-auth.ts`
  - `src/lib/platform-config.ts`
- Estimated complexity: Medium.
- Estimated time: 1-2 days.
- Dependencies: Milestone 1 and 2 decisions.
- Validation checklist:
  - Production placeholders are rejected.
  - Redis requirements are explicit by deployment mode.
  - KYC mock sessions cannot be returned in production unless an explicit non-production flag is set.
  - Local JSON auth storage is impossible in production builds.
  - CSP connect-src does not fall back broadly in production.
- Rollback strategy:
  - Roll back env validation only if it blocks known-good staging deploy; keep runtime fail-closed changes unless they break all startup.
- Automation: Env validation tests using sample env files.
- Manual review: Required for final list of mandatory production env vars.
- Dangerous: Over-strict validation can block deploys.
- Done criteria:
  - `npm run env:check` represents real production readiness.
  - No unsafe production fallback remains undocumented.

### Milestone 4: Financial Feature Gate and Wallet Readiness

- Goal: Prevent incomplete financial flows from being exposed as production-ready.
- Expected outcome: HSM, MPC, stop-limit, KYC, and withdrawal signing are either completed, feature-gated, or disabled with clear errors and docs.
- Files involved:
  - `src/lib/wallet/**`
  - `src/lib/security/withdrawal-service.ts`
  - `src/workers/withdrawal-worker.ts`
  - `src/lib/trading/validation.ts`
  - `src/lib/trading/matching-engine.ts`
  - `src/app/api/orders/**/route.ts`
  - `docs/HOT_WALLET.md`
  - `docs/SPOT_ENGINE.md`
  - `docs/WITHDRAW_SECURITY.md`
- Estimated complexity: High.
- Estimated time: 3-6 days if gating only, 2-4 weeks if implementing HSM/MPC providers.
- Dependencies: Milestones 0-3.
- Validation checklist:
  - Production cannot select throwing HSM/MPC implementations by env accidentally.
  - Stop-limit is either rejected or fully implemented.
  - Withdrawal worker cannot process real withdrawal without configured keystore/compliance.
  - KYC unconfigured state blocks protected withdrawal/compliance flows in production.
  - Wallet tests execute in CI.
- Rollback strategy:
  - Feature flags default to disabled for incomplete financial features.
  - Revert provider integration without affecting public academy/market pages.
- Automation: Unit tests, env checks, feature-flag checks.
- Manual review: Required by security/compliance/product.
- Dangerous: Any signing, withdrawal, balance, or matching-engine behavior change.
- Done criteria:
  - No incomplete financial feature can be triggered in production by normal users.
  - Explicit go/no-go decision exists for every Phase 39 wallet component.

### Milestone 5: Test Harness and QA Gates

- Goal: Turn existing QA intent into executable, repeatable checks.
- Expected outcome: Wallet/security/trading tests run through a real test command and CI includes relevant gates.
- Files involved:
  - `package.json`
  - `package-lock.json`
  - `.github/workflows/ci.yml`
  - `src/tests/**`
  - `scripts/qa-*.mjs`
  - `scripts/validate-env.mjs`
- Estimated complexity: Medium.
- Estimated time: 1-3 days.
- Dependencies: Milestone 4 for financial test scope.
- Validation checklist:
  - `npm test` or equivalent exists.
  - CI runs unit tests.
  - Existing wallet tests are recognized by the runner.
  - QA scripts remain callable.
  - Build/lint/typecheck remain mandatory.
- Rollback strategy:
  - If test runner causes major toolchain churn, isolate test setup in a separate branch and keep existing CI unchanged until stable.
- Automation: Fully automatic after setup.
- Manual review: Required for deciding acceptable test coverage threshold.
- Dangerous: Adding dependencies may affect lockfile and CI install.
- Done criteria:
  - A fresh checkout can run install, lint, typecheck, tests, build.
  - CI gate catches at least wallet/security regressions.

### Milestone 6: UX, Accessibility, and SEO Foundation

- Goal: Reduce product trust issues and route-level inconsistencies without redesigning the whole app.
- Expected outcome: English root language/direction is correct, contact forms are honest/functional, repeated page shells are standardized, accessibility checks are introduced.
- Files involved:
  - `src/app/layout.tsx`
  - `src/app/en/layout.tsx`
  - `src/components/seo/HtmlLangDir.tsx`
  - `src/app/contact-us/page.tsx`
  - `src/app/en/contact-us/page.tsx`
  - `src/components/ui/**`
  - selected academy shell pages
  - metadata helpers in `src/components/seo/**`
- Estimated complexity: Medium.
- Estimated time: 3-5 days for foundation, longer for full page parity.
- Dependencies: Milestones 1-5.
- Validation checklist:
  - English routes expose correct `lang`/`dir` before or at initial render as much as Next architecture permits.
  - Contact form is either a real form or visually changed to contact CTA.
  - Keyboard focus states verified on nav, forms, buttons, mentor widget, and academy CTAs.
  - Key pages pass basic contrast and heading hierarchy review.
  - Canonicals and alternates reviewed for high-value Persian/English pages.
- Rollback strategy:
  - Keep visual changes grouped by route family.
  - Revert shell changes independently from contact/SEO changes.
- Automation: Static route checks, metadata checks, accessibility smoke tests.
- Manual review: Required for UX copy and visual parity.
- Dangerous: Layout/root HTML changes can affect every route.
- Done criteria:
  - No visual-only form masquerades as a submit flow.
  - High-value pages have consistent language, direction, metadata, and accessible controls.

### Milestone 7: Performance and Dependency Rationalization

- Goal: Reduce bundle and runtime cost after safety work is complete.
- Expected outcome: Global client payload is reduced, chart/icon dependency plan is clear, and performance budget is measurable.
- Files involved:
  - `src/app/layout.tsx`
  - `src/components/academy/GlobalAiMentorWidget.tsx`
  - chart components under `src/components/charts`, `src/components/crypto`, and `src/components/TradingViewChart.tsx`
  - `package.json`
  - `next.config.ts`
- Estimated complexity: Medium to High.
- Estimated time: 3-7 days.
- Dependencies: Milestone 6 baseline.
- Validation checklist:
  - Bundle analyzer or equivalent report captured.
  - Global mentor widget lazy-loading or route gating evaluated.
  - Chart stack consolidation decision documented.
  - `inlineCss` measured before changing.
  - Core Web Vitals smoke check on home, markets, academy, crypto detail.
- Rollback strategy:
  - Keep each performance optimization isolated.
  - Revert dependency removals if build/runtime imports fail.
- Automation: Bundle/build/performance smoke reports.
- Manual review: Required for chart stack removal and UX impacts.
- Dangerous: Removing dependencies or changing global layout can break routes.
- Done criteria:
  - Performance budget exists.
  - At least one high-impact payload reduction lands or is explicitly deferred with evidence.

### Milestone 8: Documentation and Operational Readiness

- Goal: Make docs match implementation and prepare production runbooks.
- Expected outcome: Deployment, security, wallet, trading, and QA docs reflect current system behavior.
- Files involved:
  - `README.md`
  - `docs/Deployment.md`
  - `docs/SECURITY.md`
  - `docs/HOT_WALLET.md`
  - `docs/SPOT_ENGINE.md`
  - `docs/WEBSOCKET.md`
  - `docs/TECHNICAL_DEBT_REPORT.md`
  - `docs/OPERATIONS_RUNBOOK.md`
  - `CHANGELOG.md`
- Estimated complexity: Low to Medium.
- Estimated time: 1-2 days.
- Dependencies: Milestones 1-7.
- Validation checklist:
  - Docs no longer claim stubbed features are production-ready.
  - Deployment commands match actual runtime.
  - Rollback and incident procedures documented.
  - Required env vars listed in one canonical place.
- Rollback strategy:
  - Revert docs commit only; no runtime impact.
- Automation: Link and keyword scans.
- Manual review: Required by engineering/product/security.
- Dangerous: Low, unless docs are used directly as deployment scripts.
- Done criteria:
  - A new engineer can deploy staging using docs without discovering hidden requirements.

## 5. Safest Execution Order

1. Milestone 0: Release Scope Freeze.
2. Milestone 1: Security P0 Hardening.
3. Milestone 2: Runtime and Deployment Alignment.
4. Milestone 3: Environment and Production Fallback Policy.
5. Milestone 5: Test Harness and QA Gates.
6. Milestone 4: Financial Feature Gate and Wallet Readiness.
7. Milestone 6: UX, Accessibility, and SEO Foundation.
8. Milestone 7: Performance and Dependency Rationalization.
9. Milestone 8: Documentation and Operational Readiness.

Rationale: scope and security first, runtime second, validation third, financial gates before UX/performance polish, docs after behavior stabilizes.

## 6. Automatic, Manual, and Dangerous Task Markers

### Can Be Executed Automatically

- Repository inventory and status scans.
- Route scans for state-changing handlers missing CSRF checks.
- Env placeholder scans.
- Lint/typecheck/build/test execution.
- Static metadata/canonical checks.
- Bundle and dependency reports.
- Documentation link scans.

### Require Manual Review

- Whether to include untracked Phase 39 wallet files.
- Auth/session behavior changes.
- Admin access model.
- Production fallback policy.
- KYC and compliance behavior.
- HSM/MPC provider decisions.
- UX copy and visual shell decisions.
- Dependency removal decisions.

### Dangerous

- Deleting or moving untracked local files.
- Changing auth/session cookie semantics.
- Changing admin authentication.
- Changing withdrawal signing or wallet providers.
- Changing order matching, balance holds, or stop-limit behavior.
- Changing production process manager commands.
- Removing dependencies used dynamically.
- Root layout language/direction changes.

## 7. Git Commit Strategy

Use small, revertable commits. Avoid mixing security, runtime, UI, and docs in one commit.

Suggested commit sequence:

1. `docs: add phase 39.5 master execution plan`
2. `chore: classify release scope and local artifacts`
3. `security: enforce csrf on state-changing session and api key routes`
4. `security: replace raw admin token cookie with signed admin session`
5. `security: harden internal alert and api key replay behavior`
6. `ops: align production server start path across docker pm2 and systemd`
7. `ops: expand production environment validation`
8. `test: add executable wallet security test harness`
9. `wallet: gate incomplete hsm mpc and withdrawal providers`
10. `trading: gate or complete stop limit behavior`
11. `ux: normalize contact flows and route shells`
12. `seo: fix english language direction and metadata parity`
13. `perf: reduce global client payload and chart dependency surface`
14. `docs: update deployment security wallet and operations runbooks`

Branch strategy:

- Main branch remains protected.
- Work in `phase39-5/stabilization`.
- Use separate PRs for P0 security, runtime, test harness, financial gating, UX/SEO, performance, and docs.
- Each PR must include QA evidence and rollback notes.

## 8. QA Gates Before Every Milestone

Baseline gate before any milestone starts:

- `git status --short` reviewed.
- Scope of changed files listed.
- Rollback plan written.
- Security impact classified.
- No unrelated user changes reverted.

Required gate before merge:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run env:check` with staging/prod-like sample env where relevant.
- Targeted QA script or unit test for changed area.
- Manual review for any task marked manual or dangerous.

Milestone-specific gates:

- Security: route-by-route CSRF/auth table and negative tests.
- Runtime: staging boot, `/api/health`, `/ws` smoke, worker startup confirmation.
- Env: placeholder rejection and missing-required-var tests.
- Wallet/trading: unit tests, dry-run withdrawal, no real broadcast without provider.
- UX/SEO/a11y: keyboard pass, contrast pass, metadata/canonical pass.
- Performance: bundle/perf before-after report.
- Docs: command examples reviewed against actual package scripts.

## 9. Done Criteria Summary

Phase 39.5 is done only when:

- P0 security blockers are closed or explicitly disabled behind production-safe gates.
- Production runtime is unified across npm, Docker, PM2, and systemd.
- Env validation blocks unsafe production fallback states.
- Financial features cannot enter incomplete signing/KYC/stop-limit paths in production.
- Test harness runs in CI and covers at least wallet/security/trading critical paths.
- English/Persian high-value routes have sane language/direction, metadata, and accessible interactions.
- Performance budget is measured and global payload risks are documented or reduced.
- Documentation matches actual production behavior.
- Every merged milestone has rollback notes and QA evidence.
