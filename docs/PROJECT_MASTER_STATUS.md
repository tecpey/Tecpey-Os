# TecPey — Project Master Status & Roadmap

**Last updated:** 2026-06-26
**Status as of Phase 9.5:** Complete

**SUPERSESSION NOTICE (Phase 39.5):**
- **Product identity section** → See `docs/TECPEY_DNA.md`
- **Roadmap section** → See `docs/MASTER_ROADMAP_v3.md`
- **UX decisions section** → Preserved in `docs/TECPEY_DNA.md`
- **Phase history section** → Preserved here for reference
- **This document remains valid for:** Core UX decisions (Section 2), Completed phase details (Section 3), and Master principle (Section 5).

> This document is the single source of truth for TecPey's product definition, UX decisions, phase history, and roadmap. It does not override Product Owner decisions — it preserves them between sessions.

---

## 1. Product Definition

**TecPey is not an exchange with an education section.**
TecPey is a **safe crypto market entry ecosystem** built for Persian-speaking users, with an exchange as one component of five.

### The Five Components

| Component | URL | Purpose |
|---|---|---|
| **TecPey Exchange** | `my.tecpey.ir` | Live prices, buy/sell BTC, USDT, ETH, 30+ coins. Transparent fees. Local support. |
| **TecPey Academy** | `tecpey.ir/academy` | Free structured crypto education: text courses, quizzes, certificates, learning path. |
| **TecPey AI Mentor** | `tecpey.ir/academy` (widget) | AI-powered personalized mentor. Adapts to each student's Learning DNA: quiz results, trading history, weak areas, learning style. |
| **TecPey Trading Arena** | `tecpey.ir/academy` (module) | Virtual risk-free trading simulation. Results feed into AI Mentor profile. |
| **TecPey Knowledge Center** | `tecpey.ir/learn` | Crypto glossary, educational articles, beginner explainers. |
| **TecPey SEO/GEO Engine** | `tecpey.ir` | Bilingual (fa-IR + en-US) discoverability layer: structured data, hreflang, llms.txt, keyword clusters. |

### Brand Slogan

> **تک‌پی، نقطه امن ورود به بازار رمزارز**
>
> TecPey — the safe entry point to the crypto market.

### Legal Entity

TechnoPardakht — Babol, Mazandaran, Iran.
Phone: +98-11-32338026 | Email: info@tecpey.ir | Support: support@tecpey.ir

---

## 2. Core UX Decisions

These decisions are permanent and must survive every phase. Do not override without explicit Product Owner instruction.

### 2.1 Home Page: Two Equal Paths

The home page must always present two equally weighted CTAs:

| Path | Label | Target |
|---|---|---|
| Exchange path | **ورود به صرافی** | `my.tecpey.ir` |
| Academy path | **آکادمی رایگان** | `/academy` |

**Rule:** The exchange must never be hidden behind the academy. The academy must always be visible as a safe, parallel path for beginners.

### 2.2 Exchange CTA Sub-label

Below or near the "ورود به صرافی" CTA, always display:

> **برای شروع مطمئن، آکادمی کنار توست.**

This positions the exchange and academy as partners, not competitors.

### 2.3 Mobile Sticky Bottom Bar

On mobile viewports, always show two equal sticky bottom CTAs side by side:

```
[ ورود به صرافی ]   [ آکادمی رایگان ]
```

Neither CTA may be hidden, reduced, or deprioritized on mobile.

### 2.4 Safe Wording Principle

TecPey content must never:
- Promise profit or investment returns
- Describe itself as a financial advisor
- Describe the Trading Arena as real trading
- Describe the AI Mentor as a financial advisor

TecPey content must use:
- آموزش / education
- تمرین شبیه‌سازی شده / simulated practice
- آگاهی از ریسک / risk awareness
- تصمیم‌گیری آگاهانه / informed decision-making
- ورود امن‌تر / safer onboarding

Risk disclosure: `tecpey.ir/risk-disclosure`

---

## 3. Completed Phases

### Phase 0 — Security Stabilization ✅

Audited and hardened all existing API routes. Fixed auth gaps. Added CSRF protection. Established baseline security posture before any feature work.

### Phase 1 — Database Pool + Schema Centralization ✅

Introduced shared PostgreSQL pool in `src/lib/db.ts`. Centralized all schema definitions in `src/lib/db-schema.ts`. Eliminated scattered `pg` client instantiations.

### Phase 2 — Auth Unification ✅

Introduced `getCanonicalSession()` in `src/lib/auth-session.ts` as the single session resolution function. Migrated all routes (`trading-arena`, `offline-sync`, `command-center`, etc.) to use it. Eliminated duplicate session logic.

### Phase 3 — Global i18n Foundation ✅

Fixed broken locale config (empty message files for ar/ch/de/es/ru/tu, wrong ISO codes ch→zh, tu→tr). Introduced two-tier active/future locale model. Renamed cookie to match canonical locale ID. Created `src/lib/i18n-locale.ts` and `src/lib/locale.ts`.

### Phase 4 — Mentor Memory Engine ✅

Built the full mentor memory infrastructure:
- `mentor_profiles` table (level, riskProfile, weakAreas, strongAreas, learningStyle, confidenceScore, disciplineScore, goal)
- `mentor_memories` table (key-value with TTL)
- `mentor_conversations` table (per-student conversation history)
- `src/lib/mentor-memory.ts` — profile read/write, context prompt builder
- `GET /api/mentor-insights` — profile snapshot endpoint
- `POST /api/mentor-insights` — manual profile update

**Docs:** `docs/internal-qa/PHASE_4_MENTOR_MEMORY_ENGINE.md`

### Phase 5 — Mentor Profile Auto Update ✅

Extended mentor profile to include `discipline_score` and `learning_style` (DB ALTER IF NOT EXISTS). Built `src/lib/mentor-signals.ts` — all signal collectors (`collectQuizSignals`, `collectTradingSignals`, `collectConversationSignals`) and `computeMentorProfileUpdate` / `applyMentorProfileUpdate`. Wired `?generate=1` on mentor-insights to trigger signal collection. Added `POST /api/mentor-profile/recompute`.

**Docs:** `docs/internal-qa/PHASE_5_MENTOR_PROFILE_AUTO_UPDATE.md`

### Phase 6 — Event-Driven Mentor Profile Updates ✅

Made mentor profile updates automatic after real user actions (non-blocking fire-and-forget). Added `src/lib/mentor-events.ts` with `runMentorProfileUpdateSafely()` and `scheduleMentorProfileUpdate()`. Hooked into:
- `POST /api/academy-term-progress` — after quiz submission
- `POST /api/trading-arena` — after trade creation (both DB-success and local-fallback paths)
- `POST /api/ai-mentor` — after live AI conversation success

**Docs:** `docs/internal-qa/PHASE_6_EVENT_DRIVEN_MENTOR_PROFILE_UPDATES.md`

### Phase 7 — Server-Driven Mentor Widget ✅

Migrated `GlobalAiMentorWidget` from localStorage profile to server-side `mentor_profiles`. Built `src/hooks/useMentorInsights.ts` (stale-while-revalidate, 5-min module cache, AbortController cleanup, 401 → null). Widget now shows Learning DNA: weakAreas, strongAreas, learningStyle, confidenceScore formatted as display tags. Removed two localStorage profile effects.

**Docs:** `docs/internal-qa/PHASE_7_MENTOR_WIDGET_PROFILE_INTEGRATION.md`

### Phase 8 — Server Chat Memory Migration ✅

Retired all localStorage chat history. `mentor_conversations` is now the single source of truth. Added:
- `src/lib/mentor-cleanup.ts` — batch-delete expired mentor_memories (safe for cron, `FOR UPDATE SKIP LOCKED`)
- `GET /api/mentor-conversations` — cursor-paginated student conversation history
- `POST /api/mentor-conversations/migrate` — one-shot localStorage→DB migration (rate-limited, 3/hour)
- Widget: server fetch + migrate effects; localStorage write effect removed

**Docs:** `docs/internal-qa/PHASE_8_SERVER_CHAT_MEMORY_MIGRATION.md`

### Phase 9 — Persian SEO + GEO Foundation ✅

Built the full SEO and GEO infrastructure:
- `src/lib/seo.ts` — `getMetadata`, `getOpenGraph`, `getTwitterCard`, `getCanonicalUrl`, `getAlternateLocales`, `buildBreadcrumbSchema`, `buildOrganizationSchema` (5 sub-entities), `buildFAQSchema`, `buildArticleSchema`, `TECPEY_FAQS` (7 Persian Q&As)
- `src/lib/entity.ts` — `TecPeyEntity` type, `TECPEY_ENTITIES` (5 entities), `FA_KEYWORD_CLUSTERS` (12 Persian intent clusters), `getKeywordsForClusters()`
- All main page layouts updated with Persian keywords
- `src/app/learn/layout.tsx` — new knowledge page layout
- `src/app/layout.tsx` — Organization + FAQ + FinancialService + WebSite global schemas
- `src/app/robots.ts` — `/admin/` added to disallow
- `src/app/sitemap.ts` — priority differentiation, English paths added
- `public/llms.txt` — updated with Phase 4–8 ecosystem content + English section
- `public/llms-full.txt` — **new** comprehensive GEO document (5 products, audience, factual constraints, schema.org IDs)

**TypeScript:** 0 errors | **ESLint:** 111 warnings (unchanged)

### Phase 9.5 — Persian + English SEO/GEO Expansion ✅

Added full English parity and AI Search (GEO) content blocks:
- `src/lib/entity.ts` — `TecPeyEntity` type expanded: `alternateName`, `sameAs`, `audienceEn`, `audienceFa`; all 5 entity definitions updated; `EN_KEYWORD_CLUSTERS` (12 English intent clusters); `getEnKeywordsForClusters()`
- `src/lib/seo.ts` — `TECPEY_EN_FAQS` (7 English Q&As including explicit profit-disclaimer answer)
- `/en/page.tsx` — hreflang `"en"` → `"en-US"` (BCP 47 fix); added keywords; `alternateLocale: ["fa_IR"]` on OG
- 6 `/en/*` layouts — English keywords added to all: `/en/about`, `/en/academy`, `/en/markets`, `/en/security`, `/en/fees`, `/en/faq`
- `src/app/robots.ts` — added `/founder/`, `/academy/dashboard`, `/academy/onboarding`
- `public/llms.txt` — GEO content blocks: bilingual one-sentence summary, why TecPey exists, problems solved, audience, safety positioning, AI compliance notes
- `public/llms-full.txt` — full AI Search section: problem/solution table, bilingual audience, safety positioning (bilingual), compliance language (safe vs. avoid), bilingual entity table

**TypeScript:** 0 errors | **ESLint:** 111 warnings (unchanged)

**Docs:** `docs/internal-qa/PHASE_9_5_BILINGUAL_SEO_GEO_EXPANSION.md`

---

## 4. Remaining Phases

### Phase 10 — Global UI/UX + English Parity 🔜 NEXT

**Goal:** Ensure the English-language pages (`/en/*`) have full UI parity with their Persian counterparts. Enforce the two-path home page structure. Validate mobile sticky CTA behavior. Apply brand slogan and safe wording throughout.

**Key tasks:**
- Audit `/en` home page against two-equal-path UX rule
- Verify mobile sticky bottom bar: ورود به صرافی + آکادمی رایگان
- Apply exchange CTA sub-label: برای شروع مطمئن، آکادمی کنار توست
- Wire `TECPEY_EN_FAQS` into `/en/page.tsx` JSON-LD (`FAQPage` schema)
- Raise English sitemap priorities for key `/en/*` pages
- Ensure /en Academy page surfaces AI Mentor and Trading Arena prominently

---

### Phase 11 — Design System Enterprise

Build a formalized component/token system. Extract all colors, spacing, typography, and component variants into a consistent design token layer. Eliminate inline style drift.

---

### Phase 12 — Performance + Core Web Vitals

Target: LCP < 2.5s, FID < 100ms, CLS < 0.1 across all key routes.

Focus areas: image optimization, font loading strategy, lazy hydration for heavy widgets (AI Mentor), JS bundle analysis, critical CSS extraction.

---

### Phase 13 — Accessibility + WCAG

Audit and fix WCAG 2.1 AA compliance. Screen reader compatibility. Keyboard navigation. Focus management. Color contrast. ARIA labels on all interactive elements. RTL (fa) and LTR (en) both must pass.

---

### Phase 14 — Trading Arena Pro

Upgrade the Trading Arena from simulation to a more realistic practice environment. Add: advanced order types, portfolio P&L tracking, risk-of-ruin calculator, trade journal export. Feed richer signals into AI Mentor.

---

### Phase 15 — Notification + Realtime Engine

Implement server-sent events or WebSocket for:
- Live price alerts
- Academy milestone notifications (quiz pass, certificate earned, level up)
- AI Mentor session summaries
- Trading Arena performance milestones

---

### Phase 16 — Content Engine + CMS

Build a lightweight CMS or structured content pipeline for:
- Academy articles (currently hardcoded in data/)
- Knowledge Center articles
- Coin pages
- Glossary entries

Enable non-developer content updates without deploys.

---

### Phase 17 — Enterprise QA + Red Team

Full security red team pass:
- Auth penetration test (session fixation, CSRF, JWT, rate limit bypass)
- Input validation audit (all API routes)
- Mentor data isolation verification (student A cannot read student B's data)
- Rate limit stress test
- SQL injection sweep

---

### Phase 18 — Observability + Production Ops

Add structured logging, distributed tracing, error alerting:
- Integrate structured logger (Pino or similar) across all API routes
- Add `/api/health` and `/api/ready` endpoints
- Set up error alerting (Sentry or equivalent)
- Add DB query timing instrumentation
- Wire `runMentorCleanup()` to a cron endpoint

---

### Phase 19 — Mobile + PWA

Upgrade the existing `sw.js` and `site.webmanifest`:
- Offline support for Academy articles and Knowledge Center
- Push notification support (opt-in, for milestones)
- App-like install prompt for mobile
- Mobile-first performance pass

---

### Phase 20 — Launch Readiness

Final pre-launch checklist:
- All Phase 1–19 complete
- Production environment verified (Ubuntu 24 deployment)
- DNS + SSL confirmed
- All environment variables documented
- Load test: target 1 000 concurrent users on markets and academy
- Legal review: risk disclosure, privacy policy, editorial policy
- Analytics baseline established
- Support workflow documented

---

## 5. Master Principle

> **The Product Owner has final authority.**
>
> This document preserves consistency between sessions and phases. It captures decisions, not constraints. If the Product Owner makes an intentional change that contradicts anything written here, the Product Owner's decision is correct and this document should be updated to reflect it.
>
> This document is a memory aid, not a contract.

---

## 6. Next Immediate Task

**Phase 10 — Global UI/UX + English Parity**

Recommended starting prompt:

```
Start Phase 10: Global UI/UX + English Parity.

Reference: docs/PROJECT_MASTER_STATUS.md (Phase 10 definition).

Rules:
- Do NOT touch auth, security, mentor, or DB logic.
- Do NOT change Persian page behavior.
- Minimal, production-safe UI changes only.
- TypeScript must remain 0 errors.
- ESLint must not introduce new warnings.

Before coding:
1. Inspect /en page and /en/* layouts for UX gaps.
2. Verify the home page presents ورود به صرافی and آکادمی رایگان as equal CTAs.
3. Verify mobile sticky bottom bar.
4. Then implement.
```

---

## 7. Reference Index

| Document | Location | Phase |
|---|---|---|
| Phase 4 — Mentor Memory Engine | `docs/internal-qa/PHASE_4_MENTOR_MEMORY_ENGINE.md` | 4 |
| Phase 5 — Mentor Profile Auto Update | `docs/internal-qa/PHASE_5_MENTOR_PROFILE_AUTO_UPDATE.md` | 5 |
| Phase 6 — Event-Driven Mentor Updates | `docs/internal-qa/PHASE_6_EVENT_DRIVEN_MENTOR_PROFILE_UPDATES.md` | 6 |
| Phase 7 — Mentor Widget Profile Integration | `docs/internal-qa/PHASE_7_MENTOR_WIDGET_PROFILE_INTEGRATION.md` | 7 |
| Phase 8 — Server Chat Memory Migration | `docs/internal-qa/PHASE_8_SERVER_CHAT_MEMORY_MIGRATION.md` | 8 |
| Phase 9.5 — Bilingual SEO/GEO Expansion | `docs/internal-qa/PHASE_9_5_BILINGUAL_SEO_GEO_EXPANSION.md` | 9.5 |
| SEO/GEO Growth Engine QA | `docs/internal-qa/QA_SEO_GEO_GROWTH_ENGINE.md` | pre-9 |
| SEO/GEO Worldclass Redteam | `docs/internal-qa/QA_SEO_GEO_WORLDCLASS_REDTEAM_V2.md` | pre-9 |
| Ubuntu 24 Production Deploy | `DEPLOY_UBUNTU_24_PRODUCTION.md` | ops |
| Ubuntu 24 Deploy Guide | `DEPLOY_UBUNTU_24.md` | ops |
| Mac Install Guide | `INSTALL_MAC.md` | dev |
| Production Verify Script | `VERIFY_PRODUCTION.sh` | ops |
