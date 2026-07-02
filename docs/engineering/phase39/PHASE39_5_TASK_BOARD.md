# PHASE 39.5 TASK BOARD

Date: 2026-07-02  
Source plan: `docs/engineering/phase39/PHASE39_5_MASTER_PLAN.md`  
Rule: one task equals one logical change, maximum five files per task, independently mergeable.

## Tasks

### TP-0001
- Title: Classify current release scope
- Category: Release Management
- Priority: P0
- Estimated hours: 3
- Files affected: `PHASE39_5_RELEASE_SCOPE.md`
- Dependencies: None
- Acceptance Criteria: Worktree artifacts are classified as include, defer, ignore, or manual-review.
- QA Checklist: Run `git status --short`; verify no source files changed.
- Rollback Method: Revert the release scope document.
- Git Commit Name: `docs: classify phase 39.5 release scope`

### TP-0002
- Title: Decide Phase 39 wallet source ownership
- Category: Release Management
- Priority: P0
- Estimated hours: 2
- Files affected: `PHASE39_5_RELEASE_SCOPE.md`
- Dependencies: TP-0001
- Acceptance Criteria: Untracked wallet/HSM/MPC/multisig/policy files have a documented include/defer decision.
- QA Checklist: Confirm every untracked `src/lib/wallet/**` path is listed.
- Rollback Method: Revert the decision document.
- Git Commit Name: `docs: record phase 39 wallet scope decision`

### TP-0003
- Title: Add CSRF to session revocation routes
- Category: Security
- Priority: P0
- Estimated hours: 4
- Files affected: `src/app/api/auth/sessions/route.ts`, `src/app/api/auth/sessions/[id]/route.ts`
- Dependencies: TP-0001
- Acceptance Criteria: DELETE session routes reject cross-origin requests.
- QA Checklist: Add negative same-site/cross-site route checks; run lint and typecheck.
- Rollback Method: Revert this route-only commit.
- Git Commit Name: `security: enforce csrf on session revocation routes`

### TP-0004
- Title: Add CSRF to API key management routes
- Category: Security
- Priority: P0
- Estimated hours: 5
- Files affected: `src/app/api/api-keys/route.ts`, `src/app/api/api-keys/[id]/route.ts`
- Dependencies: TP-0001
- Acceptance Criteria: Cookie-auth API key create/update/delete flows require same-origin requests.
- QA Checklist: Verify signed API-key auth paths remain unaffected; run lint and typecheck.
- Rollback Method: Revert this route-only commit.
- Git Commit Name: `security: enforce csrf on api key management`

### TP-0005
- Title: Replace raw admin token cookie with signed admin session
- Category: Security
- Priority: P0
- Estimated hours: 8
- Files affected: `src/lib/admin-auth.ts`, `src/lib/auth-session.ts`, `src/app/api/command-center/summary/route.ts`, `src/app/api/command-center/campaign/route.ts`
- Dependencies: TP-0001
- Acceptance Criteria: Admin cookie does not equal `TECPEY_ADMIN_TOKEN`; admin access still works after token submission.
- QA Checklist: Test invalid token, valid token, expired cookie, and command center access.
- Rollback Method: Revert admin-auth commit and clear admin cookies.
- Git Commit Name: `security: use signed admin session cookie`

### TP-0006
- Title: Protect price-feed status endpoint
- Category: Security
- Priority: P0
- Estimated hours: 4
- Files affected: `src/app/api/internal/price-feed-status/route.ts`, `.env.example`, `.env.production.example`
- Dependencies: TP-0001
- Acceptance Criteria: Endpoint requires explicit trust boundary such as server token or same-origin CSRF.
- QA Checklist: Verify unauthenticated POST is rejected; valid caller is accepted; rate limit remains.
- Rollback Method: Revert endpoint and env example changes.
- Git Commit Name: `security: protect price feed status endpoint`

### TP-0007
- Title: Fail closed for API key replay protection in production
- Category: Security
- Priority: P0
- Estimated hours: 5
- Files affected: `src/lib/security/api-key-auth.ts`, `src/lib/redis-pubsub.ts`, `.env.production.example`
- Dependencies: TP-0001
- Acceptance Criteria: Production signed API requests cannot proceed without durable nonce storage.
- QA Checklist: Test no-Redis production path rejects signed requests; Redis path accepts first request and rejects replay.
- Rollback Method: Revert API-key auth change.
- Git Commit Name: `security: require nonce storage for signed api keys`

### TP-0008
- Title: Make production rate-limit fallback explicit
- Category: Security
- Priority: P0
- Estimated hours: 5
- Files affected: `src/lib/rate-limit.ts`, `scripts/validate-env.mjs`, `.env.production.example`
- Dependencies: TP-0007
- Acceptance Criteria: Production deployments either configure Redis REST or explicitly fail/deny high-risk limiter modes.
- QA Checklist: Validate missing Redis REST fails env check; local dev still works.
- Rollback Method: Revert limiter and env validation changes.
- Git Commit Name: `security: harden production rate limit fallback`

### TP-0009
- Title: Align npm and PM2 production start path
- Category: Architecture
- Priority: P0
- Estimated hours: 4
- Files affected: `package.json`, `ecosystem.config.cjs`
- Dependencies: TP-0001
- Acceptance Criteria: PM2 and `npm start` both run the intended custom server path.
- QA Checklist: Start via npm and PM2 in staging-like mode; verify HTTP server boots.
- Rollback Method: Revert process config commit.
- Git Commit Name: `ops: align pm2 with custom server`

### TP-0010
- Title: Align Docker production start path
- Category: Architecture
- Priority: P0
- Estimated hours: 4
- Files affected: `Dockerfile`, `package.json`
- Dependencies: TP-0009
- Acceptance Criteria: Container starts the custom server with WebSocket bootstrap available.
- QA Checklist: Docker build; container health check; `/ws` upgrade smoke.
- Rollback Method: Revert Dockerfile change.
- Git Commit Name: `ops: run custom server in docker`

### TP-0011
- Title: Align systemd production start path
- Category: Architecture
- Priority: P0
- Estimated hours: 3
- Files affected: `deploy/systemd/tecpey-web.service`, `DEPLOY_UBUNTU_24_PRODUCTION.md`
- Dependencies: TP-0009
- Acceptance Criteria: systemd service command matches the authoritative production start path.
- QA Checklist: Dry-run command review; staging service restart; health check.
- Rollback Method: Revert service file and doc change.
- Git Commit Name: `ops: align systemd production command`

### TP-0012
- Title: Add runtime capability health reporting
- Category: Architecture
- Priority: P1
- Estimated hours: 6
- Files affected: `src/app/api/health/route.ts`, `server.ts`, `scripts/check-health.mjs`
- Dependencies: TP-0009
- Acceptance Criteria: Health output reports DB, Redis, worker, and WebSocket mode where available.
- QA Checklist: Run health script with Redis configured and unconfigured.
- Rollback Method: Revert health reporting changes.
- Git Commit Name: `ops: report runtime capabilities in health check`

### TP-0013
- Title: Expand production env validation baseline
- Category: Environment
- Priority: P0
- Estimated hours: 5
- Files affected: `scripts/validate-env.mjs`, `.env.example`, `.env.production.example`
- Dependencies: TP-0008
- Acceptance Criteria: Required production vars include session, refresh, admin, Redis, site URL, backend URL, socket URL, DB.
- QA Checklist: Validate good sample passes and placeholder sample fails.
- Rollback Method: Revert validation and example changes.
- Git Commit Name: `ops: expand production env validation`

### TP-0014
- Title: Block local JSON auth storage in production
- Category: Security
- Priority: P0
- Estimated hours: 4
- Files affected: `src/app/api/academy-auth/route.ts`, `src/app/api/academy-term-progress/route.ts`, `src/app/api/offline-sync/route.ts`
- Dependencies: TP-0013
- Acceptance Criteria: Production cannot enable local JSON auth/progress storage by env flag.
- QA Checklist: Production-mode tests reject local fallback; development remains usable.
- Rollback Method: Revert local fallback guard changes.
- Git Commit Name: `security: block local storage auth fallback in production`

### TP-0015
- Title: Prevent mock KYC sessions in production
- Category: Compliance
- Priority: P0
- Estimated hours: 4
- Files affected: `src/lib/compliance/sumsub.ts`, `src/lib/compliance/index.ts`, `.env.production.example`
- Dependencies: TP-0013
- Acceptance Criteria: Missing Sumsub config blocks production KYC session creation instead of returning mock data.
- QA Checklist: Production missing env rejects; development fallback remains documented.
- Rollback Method: Revert KYC adapter change.
- Git Commit Name: `compliance: disable mock kyc sessions in production`

### TP-0016
- Title: Tighten production CSP connect-src fallback
- Category: Security
- Priority: P1
- Estimated hours: 4
- Files affected: `src/proxy.ts`, `scripts/validate-env.mjs`
- Dependencies: TP-0013
- Acceptance Criteria: Production CSP does not use broad connect-src fallbacks when configured URLs are missing.
- QA Checklist: Inspect CSP in production mode; verify configured backend/socket origins work.
- Rollback Method: Revert CSP changes.
- Git Commit Name: `security: tighten production csp connect sources`

### TP-0017
- Title: Add executable test runner
- Category: QA
- Priority: P1
- Estimated hours: 6
- Files affected: `package.json`, `package-lock.json`, `tsconfig.json`
- Dependencies: TP-0001
- Acceptance Criteria: `npm test` runs a TypeScript-compatible test runner.
- QA Checklist: Fresh install; `npm test`; lint; typecheck.
- Rollback Method: Revert package and config changes.
- Git Commit Name: `test: add executable test runner`

### TP-0018
- Title: Wire wallet tests into test command
- Category: QA
- Priority: P1
- Estimated hours: 5
- Files affected: `src/tests/wallet/address-validation.test.ts`, `src/tests/wallet/fee-calculation.test.ts`, `src/tests/wallet/idempotency.test.ts`, `package.json`
- Dependencies: TP-0017
- Acceptance Criteria: Existing wallet tests are discovered and pass or have documented skips for missing infra.
- QA Checklist: `npm test`; targeted wallet test command.
- Rollback Method: Revert test registration changes.
- Git Commit Name: `test: run wallet test suite`

### TP-0019
- Title: Add CI test gate
- Category: QA
- Priority: P1
- Estimated hours: 3
- Files affected: `.github/workflows/ci.yml`, `package.json`
- Dependencies: TP-0017, TP-0018
- Acceptance Criteria: CI runs tests between typecheck and build.
- QA Checklist: Local command order mirrors CI; PR check dry-run reviewed.
- Rollback Method: Revert CI workflow change.
- Git Commit Name: `ci: run tests before build`

### TP-0020
- Title: Gate incomplete HSM/MPC keystore selection
- Category: Wallet
- Priority: P0
- Estimated hours: 6
- Files affected: `src/lib/wallet/signing/keystore.ts`, `src/lib/wallet/types.ts`, `.env.production.example`
- Dependencies: TP-0002, TP-0013
- Acceptance Criteria: Production cannot select throwing HSM/MPC stubs unless a completed provider implementation is present.
- QA Checklist: Production env with HSM/MPC vars fails safely; hot wallet/simulated dev paths unaffected.
- Rollback Method: Revert keystore gate.
- Git Commit Name: `wallet: gate incomplete hsm mpc keystores`

### TP-0021
- Title: Gate MPC orchestrator provider stub
- Category: Wallet
- Priority: P0
- Estimated hours: 5
- Files affected: `src/lib/wallet/mpc/orchestrator.ts`, `src/lib/wallet/mpc/types.ts`
- Dependencies: TP-0002, TP-0020
- Acceptance Criteria: Unimplemented provider cannot be used in production signing/address derivation.
- QA Checklist: Test provider creation with missing real adapter; verify clear error.
- Rollback Method: Revert MPC gate.
- Git Commit Name: `wallet: block unimplemented mpc provider in production`

### TP-0022
- Title: Gate withdrawal worker on signing readiness
- Category: Wallet
- Priority: P0
- Estimated hours: 6
- Files affected: `src/workers/withdrawal-worker.ts`, `src/lib/wallet/withdrawal-executor.ts`, `src/lib/security/withdrawal-service.ts`
- Dependencies: TP-0020, TP-0015
- Acceptance Criteria: Worker cannot process real withdrawals unless signing and compliance readiness checks pass.
- QA Checklist: Start worker without provider; verify no broadcast path; dry-run configured mode.
- Rollback Method: Revert worker readiness gate.
- Git Commit Name: `wallet: require signing readiness for withdrawal worker`

### TP-0023
- Title: Reject stop-limit until trigger implementation exists
- Category: Trading
- Priority: P0
- Estimated hours: 4
- Files affected: `src/lib/trading/validation.ts`, `src/app/api/orders/route.ts`, `docs/SPOT_ENGINE.md`
- Dependencies: TP-0018
- Acceptance Criteria: Stop-limit requests receive a clear unsupported error instead of behaving as plain limit orders.
- QA Checklist: Unit/route test for stop-limit rejection; normal limit and market orders unaffected.
- Rollback Method: Revert validation change and doc update.
- Git Commit Name: `trading: reject unsupported stop limit orders`

### TP-0024
- Title: Add financial feature flag registry entries
- Category: Architecture
- Priority: P1
- Estimated hours: 4
- Files affected: `src/lib/feature-flags.ts`, `src/lib/platform-config.ts`, `.env.example`, `.env.production.example`
- Dependencies: TP-0013
- Acceptance Criteria: HSM, MPC, withdrawals, KYC, and stop-limit exposure are controlled by explicit flags.
- QA Checklist: Defaults are production-safe; env examples document flags.
- Rollback Method: Revert feature flag additions.
- Git Commit Name: `config: add financial feature flags`

### TP-0025
- Title: Fix English language and direction strategy
- Category: SEO / Accessibility
- Priority: P1
- Estimated hours: 6
- Files affected: `src/app/layout.tsx`, `src/app/en/layout.tsx`, `src/components/seo/HtmlLangDir.tsx`
- Dependencies: TP-0019
- Acceptance Criteria: English routes expose correct language/direction with minimal hydration mismatch.
- QA Checklist: Inspect `/en`, `/en/academy`, `/en/contact-us`; screen-reader metadata check.
- Rollback Method: Revert layout changes.
- Git Commit Name: `seo: improve english lang dir handling`

### TP-0026
- Title: Make contact flows honest and accessible
- Category: UX / Accessibility
- Priority: P2
- Estimated hours: 5
- Files affected: `src/app/contact-us/page.tsx`, `src/app/en/contact-us/page.tsx`
- Dependencies: TP-0025
- Acceptance Criteria: Visual-only forms become real labeled forms or clearly styled contact CTAs.
- QA Checklist: Keyboard navigation, labels, focus states, mobile layout, mailto behavior.
- Rollback Method: Revert contact page changes.
- Git Commit Name: `ux: clarify contact page submission flow`

### TP-0027
- Title: Create shared page shell primitive
- Category: UX
- Priority: P2
- Estimated hours: 6
- Files affected: `src/components/ui/PageShell.tsx`, `src/components/ui/Skeleton.tsx`
- Dependencies: TP-0025
- Acceptance Criteria: A reusable shell exists for later Persian/English route normalization.
- QA Checklist: No existing routes changed; component typechecks.
- Rollback Method: Remove new primitive file.
- Git Commit Name: `ux: add shared page shell primitive`

### TP-0028
- Title: Normalize top academy shell pages
- Category: UX
- Priority: P2
- Estimated hours: 8
- Files affected: `src/app/academy/page.tsx`, `src/app/en/academy/page.tsx`, `src/components/ui/PageShell.tsx`
- Dependencies: TP-0027
- Acceptance Criteria: Persian and English academy entry pages share layout structure and accessible heading flow.
- QA Checklist: Visual compare desktop/mobile; keyboard/focus; build.
- Rollback Method: Revert academy shell commit.
- Git Commit Name: `ux: normalize academy entry shells`

### TP-0029
- Title: Add metadata parity checklist script
- Category: SEO
- Priority: P2
- Estimated hours: 5
- Files affected: `scripts/qa-route-check.mjs`, `scripts/qa-production-static.mjs`
- Dependencies: TP-0025
- Acceptance Criteria: QA scripts report missing canonical/alternate metadata on high-value pages.
- QA Checklist: Run QA scripts and confirm actionable output.
- Rollback Method: Revert script changes.
- Git Commit Name: `seo: add metadata parity qa checks`

### TP-0030
- Title: Capture bundle and dependency baseline
- Category: Performance
- Priority: P2
- Estimated hours: 4
- Files affected: `docs/PERFORMANCE_BASELINE_PHASE39_5.md`
- Dependencies: TP-0019
- Acceptance Criteria: Baseline records bundle concerns, chart/icon stacks, and global client components.
- QA Checklist: Build report or manual bundle evidence attached.
- Rollback Method: Revert baseline document.
- Git Commit Name: `perf: document phase 39.5 bundle baseline`

### TP-0031
- Title: Lazy-load global AI mentor widget
- Category: Performance
- Priority: P2
- Estimated hours: 8
- Files affected: `src/app/layout.tsx`, `src/components/academy/GlobalAiMentorWidget.tsx`
- Dependencies: TP-0030
- Acceptance Criteria: Mentor widget no longer increases initial global payload unnecessarily.
- QA Checklist: Home/academy pages render; mentor opens; bundle before/after checked.
- Rollback Method: Revert lazy-load change.
- Git Commit Name: `perf: lazy load global ai mentor widget`

### TP-0032
- Title: Decide chart stack consolidation path
- Category: Performance
- Priority: P2
- Estimated hours: 3
- Files affected: `docs/PERFORMANCE_BASELINE_PHASE39_5.md`
- Dependencies: TP-0030
- Acceptance Criteria: TradingView, Chart.js, and Recharts usage has keep/remove/defer decision.
- QA Checklist: Verify import scan supports decision.
- Rollback Method: Revert documentation update.
- Git Commit Name: `perf: document chart stack consolidation plan`

### TP-0033
- Title: Update deployment docs to match runtime
- Category: Documentation
- Priority: P1
- Estimated hours: 5
- Files affected: `docs/Deployment.md`, `DEPLOY_UBUNTU_24_PRODUCTION.md`, `README.md`
- Dependencies: TP-0009, TP-0010, TP-0011
- Acceptance Criteria: Docs use the authoritative production start command and health validation.
- QA Checklist: Commands match package scripts and service files.
- Rollback Method: Revert docs commit.
- Git Commit Name: `docs: update production runtime instructions`

### TP-0034
- Title: Update security runbook
- Category: Documentation
- Priority: P1
- Estimated hours: 5
- Files affected: `docs/SECURITY.md`, `SECURITY.md`, `docs/OPERATIONS_RUNBOOK.md`
- Dependencies: TP-0003, TP-0004, TP-0005, TP-0007
- Acceptance Criteria: Security docs reflect CSRF, admin session, API replay, and rate-limit requirements.
- QA Checklist: Review against implemented security behavior.
- Rollback Method: Revert docs commit.
- Git Commit Name: `docs: update security operations runbook`

### TP-0035
- Title: Update wallet and trading docs
- Category: Documentation
- Priority: P1
- Estimated hours: 5
- Files affected: `docs/HOT_WALLET.md`, `docs/WITHDRAW_SECURITY.md`, `docs/SPOT_ENGINE.md`
- Dependencies: TP-0020, TP-0022, TP-0023
- Acceptance Criteria: Docs no longer describe incomplete HSM/MPC/stop-limit behavior as production-ready.
- QA Checklist: Verify docs match feature flags and route behavior.
- Rollback Method: Revert docs commit.
- Git Commit Name: `docs: update wallet and trading readiness`

### TP-0036
- Title: Add phase closeout checklist
- Category: Documentation / QA
- Priority: P1
- Estimated hours: 3
- Files affected: `docs/PHASE39_5_CLOSEOUT.md`
- Dependencies: TP-0033, TP-0034, TP-0035
- Acceptance Criteria: Closeout checklist references all QA gates and done criteria.
- QA Checklist: Confirm every milestone has evidence slot and rollback note slot.
- Rollback Method: Revert closeout document.
- Git Commit Name: `docs: add phase 39.5 closeout checklist`

## Critical Path

1. TP-0001
2. TP-0002
3. TP-0003
4. TP-0004
5. TP-0005
6. TP-0007
7. TP-0008
8. TP-0009
9. TP-0010
10. TP-0011
11. TP-0013
12. TP-0014
13. TP-0015
14. TP-0017
15. TP-0018
16. TP-0019
17. TP-0020
18. TP-0021
19. TP-0022
20. TP-0023
21. TP-0033
22. TP-0034
23. TP-0035
24. TP-0036

## Parallel Tasks

- TP-0006 can run after TP-0001 in parallel with TP-0003 and TP-0004.
- TP-0012 can run after TP-0009 while Docker/systemd alignment continues.
- TP-0016 can run after TP-0013 in parallel with TP-0014 and TP-0015.
- TP-0024 can run after TP-0013 in parallel with TP-0020.
- TP-0025 can begin after TP-0019 while financial gating continues.
- TP-0026, TP-0027, TP-0029 can run in parallel after TP-0025.
- TP-0030 can run after TP-0019; TP-0032 can run before TP-0031.
- Documentation tasks TP-0033, TP-0034, TP-0035 can run in parallel once their implementation dependencies are complete.

## Blocked Tasks

- TP-0020, TP-0021, TP-0022 are blocked until TP-0002 resolves Phase 39 wallet scope.
- TP-0019 is blocked until a test runner and wallet tests are wired.
- TP-0025 is blocked until CI/test gates exist.
- TP-0031 is blocked until a performance baseline exists.
- TP-0036 is blocked until runtime, security, wallet, and trading docs are updated.

## Estimated Total Engineering Hours

Total estimated engineering hours: 174

By category:

- Release Management: 5
- Security: 39
- Architecture / Runtime: 17
- Environment / Compliance: 17
- QA / CI: 14
- Wallet / Trading: 33
- UX / SEO / Accessibility: 30
- Performance: 15
- Documentation / Closeout: 18
