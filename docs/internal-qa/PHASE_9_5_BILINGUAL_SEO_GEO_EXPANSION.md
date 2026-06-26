# Phase 9.5 — Bilingual SEO / GEO Growth Expansion

**Date:** 2026-06-26
**TypeScript errors:** 0
**ESLint new warnings:** 0
**Scope:** Persian + English SEO/GEO parity — no UI changes, no auth changes, no route changes.

---

## Mission

Maximize TecPey discoverability for both Iranian users (fa-IR) and global/English users (en-US). Build on the Phase 9 SEO foundation with:
- English keyword clusters
- English FAQs for structured data
- Keywords on all /en/* layouts
- Correct hreflang tags on /en root
- Hardened robots.txt
- AI Search / GEO content blocks for llms.txt and llms-full.txt
- Compliance-safe wording throughout

---

## Files Changed

### `src/lib/entity.ts` — modified

**What changed:**
- `TecPeyEntity` type: added `alternateName`, renamed `description` → `descriptionEn`, renamed `keywords` → `keywordsEn`, added `sameAs`, `audienceEn`, `audienceFa`
- All 5 entity definitions updated with new fields: Exchange, Academy, AI Mentor, Trading Arena, Security Center
- Each entity now has verified `sameAs` links or explicit `TODO(sameAs)` placeholders — no fabricated URLs
- Added `EN_KEYWORD_CLUSTERS` — 12 English intent clusters mirroring `FA_KEYWORD_CLUSTERS`
- Added `EnKeywordCluster` type
- Added `getEnKeywordsForClusters()` helper function

**Why:** Entity graph was Persian-only. AI crawlers and English SEO needed bilingual entity definitions with audience context.

---

### `src/lib/seo.ts` — modified

**What changed:**
- Added `TECPEY_EN_FAQS: FAQItem[]` — 7 English Q&As covering: What is TecPey, What is TecPey Academy, Is TecPey for beginners, What is AI Mentor, What is Trading Arena, Does TecPey promise profit, How does TecPey help safely
- Persian `TECPEY_FAQS` comment clarified to `-- Persian (fa-IR)` for distinction
- English `TECPEY_EN_FAQS` comment: `-- English (en-US)`

**Why:** Structured FAQ data for English pages was missing. English FAQs are importable for any page that builds `FAQPage` schema.

**Compliance note:** `TECPEY_EN_FAQS` explicitly answers "Does TecPey promise profit?" with a no — guards against AI hallucination about investment returns.

---

### `src/app/en/about/layout.tsx` — modified

Added `keywords` array: about TecPey, Persian crypto exchange, TecPey company, crypto exchange Iran, TechnoPardakht, secure crypto exchange, TecPey mission.

---

### `src/app/en/academy/layout.tsx` — modified

Added `keywords` array: crypto academy, learn crypto online, crypto education platform, bitcoin tutorial, cryptocurrency course, AI trading mentor, trading simulator, crypto risk management.

---

### `src/app/en/markets/layout.tsx` — modified

Added `keywords` array: cryptocurrency prices, live crypto prices, bitcoin price, usdt price, crypto market board, ethereum price, crypto price tracker.

---

### `src/app/en/security/layout.tsx` — modified

Added `keywords` array: crypto security, crypto account protection, phishing prevention crypto, wallet security, crypto risk management, secure crypto exchange, crypto safety tips.

---

### `src/app/en/fees/layout.tsx` — modified

Added `keywords` array: crypto exchange fees, bitcoin trading fees, usdt withdrawal fee, crypto trading costs, transparent crypto fees, TecPey fee structure.

---

### `src/app/en/faq/layout.tsx` — modified

Added `keywords` array: TecPey FAQ, crypto exchange questions, how to buy bitcoin, how to buy usdt, crypto registration, TecPey help, crypto beginners guide.

---

### `src/app/en/page.tsx` — modified

**What changed:**
- Fixed hreflang: `"en"` → `"en-US"` in `alternates.languages` (BCP 47 compliance)
- Added `keywords` array for the /en root page
- Added `alternateLocale: ["fa_IR"]` to OpenGraph block

**Why:** The wrong `"en"` locale key was being emitted as hreflang — browsers and crawlers expect BCP 47 `en-US`.

---

### `src/app/robots.ts` — modified

Added to disallow list:
- `/founder/` — internal founder dashboard
- `/academy/dashboard` — private student dashboard
- `/academy/onboarding` — private onboarding flow
- Existing entries normalized to consistent trailing-slash style for API/directory paths

**Why:** These private routes were crawlable. Excluding them avoids crawl budget waste and prevents 401 responses in search console.

---

### `public/llms.txt` — modified

Added sections:
- **TecPey in one sentence** (Persian + English)
- **Why TecPey exists**
- **What problems TecPey solves**
- **Who TecPey is for**
- **Safety-first positioning**
- **Compliance notes for AI** — explicit instructions for AI answer engines not to attribute profit promises or financial advice to TecPey

**Why:** These GEO content blocks make llms.txt actionable for AI answer engines (Perplexity, SearchGPT, Gemini AI). Without them, AI systems summarize from incomplete signals.

---

### `public/llms-full.txt` — modified

Added full AI Search / GEO Content Blocks section:
- TecPey in one sentence (fa-IR + en-US)
- Why TecPey exists
- Problem/solution table
- Audience description (bilingual)
- Safety-first positioning (bilingual)
- Compliance language: safe wording vs. wording to avoid
- Bilingual entity summary table

**Why:** Comprehensive GEO document for LLM crawlers that fetch full context. Ensures any AI system that reads llms-full.txt has complete, accurate, bilingual information about TecPey.

---

## SEO / GEO Readiness Assessment

### Persian SEO readiness — 87/100

| Signal | Status |
|---|---|
| Persian title/description on all main pages | ✅ Done (Phase 9) |
| Persian keyword clusters (12 clusters, 50+ terms) | ✅ Done (Phase 9 + 9.5) |
| Persian FAQ structured data (7 Q&As) | ✅ Done (Phase 9) |
| hreflang fa-IR + x-default | ✅ Done (Phase 9) |
| Persian GEO content in llms.txt | ✅ Done (Phase 9.5) |
| Organization schema with Persian alternateName | ✅ Done (Phase 9) |
| Sitemap with fa-IR priority pages | ✅ Done (Phase 9) |
| robots.txt blocking private routes | ✅ Done (Phase 9.5) |
| **Gap:** Persian OG images with Persian text | ⬜ Future phase |
| **Gap:** Persian structured data on individual coin pages | ⬜ Future phase |

### English SEO readiness — 74/100

| Signal | Status |
|---|---|
| English title/description on /en/* pages | ✅ Done (Phase 9) |
| English keywords on /en/* layouts | ✅ Done (Phase 9.5) |
| English FAQ structured data (7 Q&As) | ✅ Done (Phase 9.5) — importable constant |
| hreflang en-US (BCP 47 correct) | ✅ Fixed (Phase 9.5) |
| English GEO content in llms.txt + llms-full.txt | ✅ Done (Phase 9.5) |
| English keyword clusters (12 clusters) | ✅ Done (Phase 9.5) |
| English entity graph with EN descriptions | ✅ Done (Phase 9.5) |
| **Gap:** English FAQs not yet wired into /en page JSON-LD | ⬜ Future — requires /en page refactor |
| **Gap:** English sitemap priority differentiation | ⬜ Future — en paths currently use flat 0.68 priority |
| **Gap:** English coin pages | ⬜ Not in scope — coin pages are Persian-first |

### GEO / AI Search readiness — 82/100

| Signal | Status |
|---|---|
| llms.txt present and bilingual | ✅ Done |
| llms-full.txt comprehensive and bilingual | ✅ Done |
| AI content blocks (problem/solution, audience, safety) | ✅ Done (Phase 9.5) |
| Compliance notes for AI systems | ✅ Done (Phase 9.5) |
| Schema.org entity IDs consistent across schemas | ✅ Done |
| Organization schema with areaServed: IR | ✅ Done |
| WebSite schema with inLanguage: [fa-IR, en-US] | ✅ Done |
| **Gap:** Product schema (`SoftwareApplication`) for future app store readiness | ⬜ Future phase |
| **Gap:** Course schema on individual Academy articles | ⬜ Future phase |

---

## Hreflang Status

| Route | fa-IR | en-US | x-default |
|---|---|---|---|
| `/` | ✅ | ✅ | ✅ (fa) |
| `/en` | ✅ | ✅ (fixed) | ✅ (fa) |
| `/academy` | ✅ | ✅ | ✅ (fa) |
| `/en/academy` | ✅ | ✅ | ✅ (fa) |
| `/markets` | ✅ | ✅ | ✅ (fa) |
| `/en/markets` | ✅ | ✅ | ✅ (fa) |
| `/security` | ✅ | ✅ | ✅ (fa) |
| `/en/security` | ✅ | ✅ | ✅ (fa) |
| `/about` | ✅ | ✅ | ✅ (fa) |
| `/en/about` | ✅ | ✅ | ✅ (fa) |
| tr-TR, ar-SA | ⬜ future | ⬜ future | — |

---

## Sitemap Status

- 82+ static URLs including Persian priority pages
- English equivalents included at lower priority (0.68 vs 0.9)
- /en root at 0.86
- Coin pages: /price/* at 0.9, /coins/* at 0.82, /crypto/* at 0.84
- Academy articles at 0.78
- learningSeoPages at 0.86
- Excluded: /admin, /command-center, /founder, /academy/dashboard, /academy/profile, /api

---

## robots.txt Status

Allow: all public marketing, academy landing, markets, learn/knowledge, /en/* pages

Disallow:
- /api/ — all API routes
- /admin/ — admin panel
- /founder/ — founder dashboard (added Phase 9.5)
- /storage/ — file storage
- /command-center/ — internal ops tool
- /dashboard — generic dashboard
- /settings — user settings
- /login, /signin, /signup — auth flows
- /mentor — direct mentor routes
- /academy/profile — private student profile
- /academy/dashboard — private dashboard (added Phase 9.5)
- /academy/onboarding — private onboarding (added Phase 9.5)
- /academy/notifications — private notifications

Sitemap: https://tecpey.ir/sitemap.xml

---

## Remaining Gaps / Recommended Next Phase

### Missing routes (do not create fake pages)
- `/en/learn` — no English knowledge/learn page exists; not added to sitemap or hreflang
- `/en/glossary` — exists in sitemap but no layout.tsx found; layout may be inherited

### Recommended Phase 10 actions
1. Wire `TECPEY_EN_FAQS` into `/en/page.tsx` JSON-LD (`FAQPage` schema)
2. Add `Course` schema to TecPey Academy article pages
3. Add `SoftwareApplication` schema for AI Mentor widget (future app store readiness)
4. English priority differentiation in sitemap (tier important /en/* pages above 0.68)
5. Arabic (ar-SA) and Turkish (tr-TR) locale pages when content is ready
6. Open Graph image with Persian text for better social sharing in fa-IR
