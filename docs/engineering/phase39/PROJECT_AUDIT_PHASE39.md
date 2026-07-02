# PROJECT AUDIT PHASE 39

Date: 2026-07-02  
Repository root audited: `/Users/vajihi/Desktop`  
Scope: tracked repository files plus visible untracked Phase 39 wallet/HSM/MPC files. Local secret values in `.env.local` were not read. Build, lint, and typecheck were not executed because they can update generated or incremental artifacts.

## Executive Summary

TecPey is a large Next.js 16 / React 19 / TypeScript 5 application for a Persian-first crypto education, market, academy, trading, wallet, and community platform. The codebase has significant production-oriented foundations: App Router, PostgreSQL, JWT/httpOnly cookies, CSRF origin checks, CSP/HSTS headers, rate limiting, audit logging, WebSocket support, Redis integration, trading engine abstractions, wallet execution modules, deployment files, and a substantial docs suite.

The main release risks are consistency and completion, not lack of direction. Several critical paths are partially implemented or still simulation/fallback based: HSM/MPC, KYC fallback, contact forms, price-feed alert wiring, some academy/community routes, API-key CSRF posture, admin token handling, multi-instance rate limiting/replay prevention, and generated/untracked artifacts in the working tree.

## 1. Tech Stack

- Framework: Next.js 16 App Router with custom `server.ts` for WebSocket support.
- Runtime: Node.js 22 target, npm 10 expected.
- Language: TypeScript 5 with `strict: true`, `allowJs: true`, `skipLibCheck: true`.
- UI: React 19, Tailwind CSS 4, custom CSS tokens in `src/app/globals.css`.
- i18n: `next-intl`, Persian root layout, English `/en` subtree.
- State/data: `@tanstack/react-query`, extensive `localStorage` use for academy/offline/simulator features.
- Database: PostgreSQL via `pg`, custom `withDb` / `withTx` wrappers, schema/migrations in code and SQL.
- Real-time: custom `ws` server, Redis pub/sub, Socket.IO client dependency for external market socket.
- Queue/cache: Redis/ioredis, BullMQ withdrawal workers, in-memory fallbacks.
- Auth/security: `jose` JWTs, httpOnly cookies, CSRF origin checks, refresh tokens, 2FA, WebAuthn, API keys.
- Crypto/wallet: `@noble/secp256k1`, `@noble/hashes`, QR code generation, wallet provider modules.
- Charts: TradingView static library, Chart.js, Recharts, react-chartjs-2, react-virtuoso.
- Deployment: Docker, docker-compose, PM2 ecosystem config, systemd, Nginx templates, GitHub Actions CI.

## 2. Folder Structure

- `src/app`: App Router pages and API routes. Approximately 161 `page.tsx` files and 73 API `route.ts` files.
- `src/components`: UI components grouped by academy, admin, charts, community, content, crypto, footer, home, markets, navbar, SEO, tools, and primitives.
- `src/data`: academy content, coins, glossary, exchange comparison, SEO and tool data.
- `src/lib`: core services: auth, DB, API validation, CSRF, rate limiting, learning OS, mentor, trading, wallet, compliance, security.
- `src/lib/security`: API keys, audit log, session store, refresh tokens, 2FA, WebAuthn, withdrawal controls.
- `src/lib/trading`: markets, matching/order services, order book, ledger, wallet balances.
- `src/lib/wallet`: wallet execution, signing, providers, queues, confirmations; Phase 39 untracked subfolders add HSM/MPC/multisig/policy/address derivation.
- `src/workers`: withdrawal worker bootstrap.
- `src/tests`: wallet test files, but no test script is defined in `package.json`.
- `public`: static assets, fonts, logos, charting library, service worker, SEO files.
- `docs`: large architecture, roadmap, QA, security, deployment, trading, wallet, and product documentation.
- `scripts`: health, env validation, QA scripts, Ubuntu deployment helpers.
- `deploy`: Nginx and systemd templates.
- `.github`: CI workflow and issue/PR templates.

## 3. Build System

- Primary scripts:
  - `npm run dev`: runs `tsx server.ts`.
  - `npm run build`: runs `next build`.
  - `npm run start`: runs `NODE_ENV=production tsx server.ts`.
  - `npm run lint`: runs ESLint.
  - `npm run typecheck`: runs `tsc --noEmit`.
  - `npm run release:check`: env check, lint/typecheck, build.
- CI performs `npm ci`, `tsc --noEmit`, `eslint . --max-warnings 0`, and `npm run build`.
- Docker uses multi-stage Node 22 images and copies `.next`, `public`, `node_modules`, `next.config.ts`, and `package.json`.
- PM2 config starts `next start`, while package `start` starts the custom WebSocket server. This is inconsistent: PM2 bypasses custom WebSocket/Redis/worker bootstrap.
- `tsconfig.json` includes `.next/types` and has incremental enabled; local typecheck may update `tsconfig.tsbuildinfo`.
- `.gitignore` excludes `.next`, `node_modules`, env files, and `*.tsbuildinfo`, but `.next`, `node_modules`, and `tsconfig.tsbuildinfo` are present in the local working directory.

## 4. Dependencies

Core dependencies appear used: Next, React, next-intl, next-themes, jose, pg, ioredis, BullMQ, TanStack Query, qrcode, socket.io-client, lucide-react, Chart.js, Recharts, react-virtuoso.

Potential dependency issues:

- Both `lucide` and `lucide-react` are installed; code imports overwhelmingly from `lucide-react`, so `lucide` may be redundant.
- Multiple chart stacks are present: TradingView library, Chart.js, Recharts. This increases bundle and maintenance surface.
- `react-icons` is used only in selected social/contact UI while Lucide is the main icon system.
- Wallet/security code uses crypto libraries directly and custom encoders; this deserves dedicated tests before production signing.
- No test runner dependency or `npm test` script exists despite `src/tests/wallet/*`.

## 5. Existing Features

- Persian-first landing, market, crypto, content, glossary, comparison, fees, privacy, rules, security, support, and legal pages.
- English `/en` mirror for many public routes.
- Academy with term pages, lessons, quizzes, certificates, dashboard, AI mentor, flashcards, daily challenge, profile, trading arena, community, career, and onboarding surfaces.
- AI mentor endpoint with local fallback, OpenAI Responses API integration, cost guard, memory persistence, and rate limiting.
- Unified session JWTs, legacy cookie fallback, refresh token flow, session revocation, 2FA, WebAuthn, API keys, admin metrics.
- PostgreSQL-backed auth, trading, notification, learning, withdrawal, API-key, and session functionality.
- Trading engine/order placement/cancel APIs with balance hold, risk checks, order book, matching engine factory, and audit logging.
- Wallet and withdrawal pipeline abstractions: withdrawal requests, compliance gates, confirmation polling, queues/workers, providers, signing keystore.
- Compliance adapters for Sumsub, Chainalysis, OFAC with graceful degradation.
- Observability primitives: request trace IDs, logger, metrics, health endpoints, alert webhook.
- Deployment/runbook assets for Docker, Ubuntu, Nginx, systemd, PM2.
- Static QA scripts for academy/offline/phase checks.

## 6. Incomplete Features

- HSM and MPC are not production complete. `src/lib/wallet/signing/keystore.ts` still throws for HSM/MPC. Untracked `src/lib/wallet/mpc/orchestrator.ts` has provider stubs and public key retrieval not implemented.
- Sumsub KYC returns `mock_${userId}` sessions when unconfigured, which is safe as a fallback but not production KYC.
- Contact pages render form fields but submit via `mailto:` link rather than a backend form handler.
- Price feed status endpoint states that client wiring is deferred, so feed-down alerting is not active end-to-end.
- Stop-limit orders are documented as accepted but not trigger-implemented.
- Redis replay protection for API-key signed requests depends on `globalThis.tecpeyRedisClient`; when Redis is unavailable, replay prevention is disabled.
- Several academy/community/product pages are route-registered content shells rather than deep product workflows.
- Test files exist for wallet logic, but there is no executable test setup in `package.json`.
- Untracked Phase 39 wallet files are not part of git and therefore not releasable until added intentionally.

## 7. Security Risks

- Several state-changing authenticated routes do not call `verifyCsrfOrigin`, including session revocation and API-key creation/update routes. SameSite=Lax helps, but explicit CSRF origin checks should be consistent.
- Admin auth stores the raw `TECPEY_ADMIN_TOKEN` as the httpOnly cookie value. A stolen cookie equals the admin token. Prefer signed short-lived admin session IDs.
- `src/app/api/internal/price-feed-status/route.ts` is public, unauthenticated, and lacks CSRF/origin checks. It is rate limited but can still generate false operational alerts.
- API-key nonce replay protection silently degrades without Redis. In production, this should fail closed or use a durable nonce store.
- Rate limiting falls back to per-instance memory in production if Redis REST is absent. This is not sufficient for horizontally scaled deployments.
- `docker-compose.production.yml` contains a placeholder Postgres password. It is a template, but the file name suggests production use.
- Local JSON auth storage can be enabled in production via `TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE=true`; that should be guarded hard or removed from production images.
- CSP uses broad `https:`, `wss:`, and `ws:` fallbacks when backend envs are placeholders/missing.
- `auth-session` allows sessions if JTI revocation Redis check fails. This is availability-friendly but security-weak for revoked tokens.
- Extensive `localStorage` stores learning history, mentor migration data, simulator state, and reflections. Avoid storing sensitive data and sanitize any migration payloads carefully.

## 8. Performance Issues

- The app has a very large route surface and many heavy client components. Global `Navbar`, `Footer`, and `GlobalAiMentorWidget` load across the root layout.
- Multiple charting libraries and bundled TradingView assets increase payload and maintenance cost.
- `next.config.ts` enables `experimental.inlineCss`; it may improve first load but sacrifices stylesheet caching for repeat visits.
- Many pages use large, page-local Tailwind class strings rather than shared primitives, increasing CSS churn and review cost.
- Numerous academy features rely on localStorage scanning and client-side computation.
- In-memory rate limit/order book fallbacks are process-local and unsuitable for multi-instance performance/consistency.
- WebSocket server and withdrawal workers run only through `server.ts`; deployment paths that use `next start` miss those services.

## 9. UI/UX Inconsistencies

- Persian and English pages often use different component shells and styling systems for equivalent content.
- Academy pages heavily use dark slate/cyan card layouts while public pages use mixed light tokens, white cards, and custom gradients.
- Many cards use large radii such as `rounded-[30px]`, `rounded-[34px]`, `rounded-[40px]`, and `rounded-[46px]`, inconsistent with a restrained product UI.
- Contact form inputs appear interactive but do not submit form data; the action is a mailto link.
- English layout sets `lang/dir` on a wrapper div and relies on a client component to correct root `html` attributes, which may cause SEO/accessibility mismatch before hydration.
- Several academy routes repeat similar CTA shell pages, making navigation feel broader than the implemented workflow depth.
- Hardcoded Farsi text appears in many components rather than consistently flowing through `next-intl`.

## 10. Dead Code / Redundant Code

- Legacy auth cookies are still read across `academy-auth`, `academy-session`, `session`, and `auth-session`, while newer unified sessions are primary.
- Duplicate academy auth route families exist: `/api/academy-auth` and `/api/academy/auth/*`.
- Generated/local artifacts are present in the working tree: `.next`, `node_modules`, `tsconfig.tsbuildinfo`.
- Untracked non-project artifacts exist in the repo root: `.localized`, MP3 file, screenshot, zip archive.
- `react-icons` overlaps with Lucide usage.
- Some docs describe older phase states that conflict with current implementation, e.g. Redis order book docs still mention stubs while code has an ioredis implementation.

## 11. TODOs

Code TODOs found:

- `src/lib/error-tracking.ts`: replace stub with Sentry or equivalent.
- `src/lib/i18n-locale.ts`: privacy-safe geo suggestion.
- `src/lib/entity.ts`: verified `sameAs` links.
- `src/lib/mentor-events.ts`: replace in-process async mentor update with durable queue.
- `src/app/api/trading-arena/route.ts`, `src/app/api/academy-student-profile/route.ts`, `src/app/api/academy-term-progress/route.ts`: cookie migration cleanup.
- `src/app/api/ai-mentor/route.ts`: remove client-sent history after mentor DB history is fully adopted.

Explicit implementation stubs:

- HSM/MPC signing in `src/lib/wallet/signing/keystore.ts`.
- MPC public key retrieval and provider integration in `src/lib/wallet/mpc/orchestrator.ts`.
- Error tracking integration.
- Price feed alert client wiring.
- Stop-limit trigger behavior.

## 12. Technical Debt

- Auth model remains complex: unified sessions, refresh tokens, legacy cookies, academy accounts, student sessions, admin token, API-key auth.
- Environment validation checks only a subset of required security vars; newer wallet/HSM/MPC/KYC/2FA vars are not fully enforced.
- DB migrations are split between SQL and large TypeScript migration strings, making schema drift likely.
- Observability is present but unevenly applied; some routes use `withObservability`, others are thinner.
- Product docs, QA reports, and phase reports are extensive but sometimes stale compared to code.
- Local fallbacks are useful for development but are scattered and need production hardening.
- UI primitives are underused; many pages hardcode design decisions.
- Tests are not integrated into CI beyond lint/typecheck/build.
- Working tree contains untracked Phase 39 source files and unrelated local files, making release scope ambiguous.

## 13. Suggested Priorities

1. Stabilize release scope: remove or ignore unrelated root artifacts, decide whether Phase 39 wallet/HSM/MPC files are in scope, and add them intentionally if yes.
2. Align production start path: PM2/systemd/Docker should all run the same server path if WebSocket, Redis pub/sub, and withdrawal workers are required.
3. Close security gaps: add CSRF/origin checks to state-changing cookie-auth routes, replace raw admin-token cookie, fail closed or require Redis for API-key replay protection in production.
4. Harden environment validation: include admin, Redis, refresh, 2FA, wallet, HSM/MPC, KYC, alerting, and production URL requirements.
5. Finish or explicitly disable incomplete financial features: HSM/MPC, stop-limit, KYC mock sessions, withdrawal signing providers.
6. Add a real test runner and wire wallet/security/trading tests into CI.
7. Reduce UI drift: consolidate Persian/English route shells, shared card/button/input primitives, and academy layout components.
8. Replace visual-only forms and placeholder flows with real handlers or clearly non-form contact CTAs.
9. Rationalize chart and icon dependencies to reduce bundle size and design inconsistency.
10. Update docs to match current implementation and archive stale phase reports separately.

## Verification Notes

- Inspected manifests, configs, routing structure, source modules, scripts, deployment files, docs indicators, and git status.
- Did not inspect secret values from `.env.local`.
- Did not execute `npm run build`, `npm run lint`, or `npm run typecheck` to honor the no-modification constraint.
- Created only this report file.
