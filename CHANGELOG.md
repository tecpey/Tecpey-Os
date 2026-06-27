# Changelog

All notable changes to TecPey are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow semantic milestones (Phase-based).

---

## [v0.13.5] — 2026-06-27 — Enterprise QA Stabilization and CI Readiness

### Fixed
- `package-lock.json`: synchronized with `package.json` to resolve `npm ci` failure in GitHub Actions (`@swc/helpers@0.5.23` mismatch)
- `src/app/crypto/[symbol]/page.tsx`: removed unused `Navbar` import (ESLint `no-unused-vars`)
- `src/components/academy/AiMentorExperience.tsx`: removed unused `useMemo` import (ESLint `no-unused-vars`)
- `src/components/academy/AcademyCertificatesClient.tsx`: replaced `<img>` with `<Image>` from `next/image` for QR code display; removed stale `eslint-disable-next-line` comment

### Changed
- `eslint.config.mjs`: rule tuning carried forward from Phase 13 sessions

### QA Results
- ESLint: ✓ 0 errors, 0 warnings
- TypeScript: ✓ 0 errors
- Build: ✓ PASS (278 pages generated)
- `npm ci`: ✓ PASS

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
