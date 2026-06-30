---
name: tecpey-enterprise
description: TecPey platform rules for Claude. Governs engineering quality, product strategy, brand identity, UX, and multi-track architecture. Load this skill before any TecPey work session.
---

# TecPey Enterprise Skill

## What TecPey Is

TecPey is a **multi-track platform**, not only an exchange. Every phase of
development must serve the platform as a whole, not just the feature in front
of you.

### Core Platform Tracks

| Track | Scope |
|---|---|
| **Platform Foundation** | Auth, infra, observability, DB, migrations, rate limiting, CSP |
| **Exchange** | Spot trading, order book, matching engine, wallet ledger, assets, markets |
| **Academy** | Learning OS, lessons, certificates, AI mentor, student dashboard |
| **Social Layer** | Community, career panel, hall of fame, profiles — opt-in, privacy-first |
| **Business Platform** | Enterprise tenants, admin, command center, campaigns |
| **AI Platform** | AI mentor, mentor memory, notification brain, AI mentor v2 |
| **Developer Platform** | APIs, webhooks, SDK surface (future) |
| **Financial Ecosystem** | Payments, withdrawal flows, financial compliance (future strategic pillar) |

Never ship a change that advances one track at the cost of another's
correctness or compatibility.

---

## Engineering Rules (Non-Negotiable)

- TypeScript: 0 type errors (`npm run typecheck`)
- ESLint: 0 warnings, 0 errors (`npm run lint`)
- Build must pass (`npm run build`)
- GitHub Actions must be green before any new phase begins
- No new phase starts while CI is red
- No force push without explicit written permission from the user
- No `--no-verify` on commits
- No backwards-compatibility hacks — remove dead code cleanly
- Atomic commits per phase; one commit per logical unit
- Phase commit format: `Phase N.X: <short description>`
- Phase tag format: `vN.X-kebab-slug`
- `package.json` and `package-lock.json` are never touched unless a dependency is truly required

---

## Framework — Next.js 16

This is **Next.js 16**, not 14 or 15. APIs, conventions, and file structure
may differ from training data. Read `node_modules/next/dist/docs/` before
writing any Next.js-specific code. Heed deprecation notices.

Key conventions:
- `proxy.ts` — NOT `middleware.ts` (CSP, nonce)
- App Router (`src/app/`)
- `withObservability(req, { route }, async () => { ... })` wraps every API handler
- `apiOk()` / `apiError()` / `apiRateLimited()` for all responses
- `withDb()` — always check `.enabled` before `.value`
- `getCanonicalSession()` — canonical auth read path
- `rateLimit()` for every endpoint
- `verifyCsrfOrigin()` for every mutating endpoint

---

## Product Rules

- **Privacy-first** — Social Layer features are always opt-in; no silent profiling
- **Academy and Exchange are equal strategic paths** — neither is subordinate
- **Financial Ecosystem** is the future strategic pillar — all financial-adjacent
  design decisions should be compatible with its eventual arrival
- **Multi-tenant SaaS direction must be preserved** — tenant isolation is a hard constraint
- No product features added beyond the current phase spec
- No UI redesign during engineering phases
- No new business logic added "just in case"

---

## Brand & Logo Rules

**CRITICAL:** Only use the official user-provided TP logo.
- Never invent, generate, redesign, or replace the logo
- Never use emoji, placeholder SVGs, or icon fonts as substitutes
- Never change logo colors, proportions, or letterforms
- When in doubt: do not render a logo at all

---

## UX Rules

- World-class design — every component must earn its pixels
- RTL/LTR parity — Persian and English layouts must be functionally identical
- Accessibility — WCAG 2.1 AA minimum at all times
- No random design styles — stay within the established design system
- No fake logos or placeholder graphics in committed code
- No unnecessary animation — every motion must serve a UX purpose
- No layout changes during non-UI phases

---

## Quality Mandate

> Every output must be **more precise, more secure, more maintainable, and
> more production-ready** than the previous one.

This applies to every file, every function, every API, every migration, and
every test. Regression is not acceptable.

---

## Auth Architecture (post Phase 23)

- Unified JWT session via `getCanonicalSession()`
- Legacy cookie system retired
- `setUnifiedSessionCookieAsync(response, fields)` — all fields accept `string | null`
- `shouldRefreshSession()` / `refreshSessionCookie()` from `@/lib/session-refresh`

---

## API Pattern Checklist

For every new API route, confirm:

- [ ] `export const dynamic = "force-dynamic"`
- [ ] `withObservability(req, { route: "/api/..." }, async () => { ... })`
- [ ] `rateLimit()` with appropriate namespace and limit
- [ ] `verifyCsrfOrigin()` for POST/PATCH/DELETE
- [ ] `getCanonicalSession()` for auth-required routes
- [ ] `apiOk()` / `apiError()` for all responses (no raw `NextResponse.json`)
- [ ] Structured log with `requestId`, `userId`, `latencyMs` for mutating operations

---

## Phase Workflow (7-Step)

1. **Plan** — Spec alignment, no code yet
2. **Implement** — Write code per spec; no scope creep
3. **QA** — typecheck, lint, build; all must pass
4. **Docs** — Update `docs/` and `CHANGELOG.md`
5. **Git** — Commit with phase message + co-author line
6. **Push** — Push commit + tag to `origin/main`
7. **Report** — Written phase report; STOP

Do not start the next phase until the report is written and the user says to proceed.
