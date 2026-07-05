# Discoverability Strategy — Phase 39.5 Final Governance Lock

**Date:** 2026-07-05  
**Phase:** 39.5 — Strategic Freeze & TecPey DNA Synchronization (Final Governance Lock)  
**Status:** Official — Architecture and strategy only. No implementation.  
**Purpose:** Define how TecPey becomes discoverable and citable by traditional search engines and modern AI systems. This is a permanent platform capability, not a post-launch marketing task.

**Scope:** SEO, GEO, AEO, LLMO, structured data, knowledge graph, schema, AI citations, canonical content, authority, Academy content, entity strategy, and future AI indexing.

**Rule:** Implementation may not begin until this strategy is approved. No code for llms.txt, schema, or AI crawlers may be written without reference to this document.

---

## 1. Strategic Context

TecPey is a Persian-first financial education and trading platform. Its primary audience is Persian-speaking learners and traders in Iran and the diaspora. However, long-term success requires discoverability across:

- Traditional search (Google, Bing)
- Persian search and local engines
- Emerging AI answer engines (ChatGPT, Claude, Gemini, Perplexity, Copilot, Grok, and future models)
- Knowledge graphs and structured data consumers
- Academic and research citations

**Core Principle:** Content and entities created for humans must also be machine-readable and citable without compromising educational integrity or creating SEO spam.

---

## 2. Discoverability Layers

### 2.1 SEO (Search Engine Optimization) — Traditional Web

**Goal:** Rank for Persian and English queries related to cryptocurrency, trading education, financial literacy, and specific coins/strategies.

**Key Surfaces:**
- Landing pages
- Academy curriculum pages (term pages, lessons)
- Crypto dossiers (50+ coins)
- Glossary
- Markets page
- Certificate verification pages
- Blog / educational articles (future)

**Requirements:**
- Persian (fa-IR) as primary language with correct `lang` and `dir="rtl"`.
- English (`/en/`) as first-class mirror with proper hreflang.
- Structured data (schema.org) on key entity pages (Coin, Course, Certificate, Organization).
- Canonical URLs to prevent duplicate content between Persian and English.
- Sitemap covering all public educational content.
- Meta titles/descriptions optimized for both Persian and English.

**Anti-Patterns to Avoid:**
- Keyword stuffing in Academy content.
- Thin English pages created only for SEO.
- Duplicate content between Persian and English without proper canonical/hreflang.

---

### 2.2 GEO (Geographic / International SEO)

**Goal:** Correct targeting for Iranian users while remaining accessible to Persian speakers worldwide.

**Requirements:**
- `hreflang` tags for `fa-IR`, `fa`, `en`, and any additional supported locales.
- `og:locale` and `og:locale:alternate` tags.
- Geo-specific landing pages or sections only when content genuinely differs (e.g., regulatory notes).
- Avoid cloaking or IP-based content switching that search engines penalize.

**Persian Diaspora Consideration:**
- Many Persian speakers are outside Iran. Do not over-optimize for `.ir` or Iranian-only signals at the expense of global Persian users.

---

### 2.3 AEO (Answer Engine Optimization) — AI Answer Engines

**Goal:** TecPey content is cited, quoted, or surfaced when users ask AI systems questions about cryptocurrency, trading, or financial education.

**Key AI Systems (current):**
- ChatGPT / GPTs (OpenAI)
- Claude (Anthropic)
- Gemini (Google)
- Perplexity
- Microsoft Copilot
- Grok (xAI)
- Future models and agents

**Strategy:**
- High-quality, authoritative, citable educational content.
- Clear question → answer structure in Academy lessons.
- Factual, neutral tone (no hype, no profit promises).
- Structured data that AI crawlers can parse (schema.org Course, HowTo, FAQ, etc.).
- Consistent entity naming (e.g., always "TecPey" not alternating brands).

**Content Principles for AEO:**
- Every Academy term should be able to answer: "What is X?" or "How do I Y?" in a self-contained way.
- Definitions in glossary should be concise and citable.
- Coin dossiers should contain verifiable facts, not marketing copy.

---

### 2.4 LLMO (Large Language Model Optimization) / LLM Discoverability

**Goal:** TecPey becomes a known, trusted source that future LLMs are trained on or retrieve from.

**Tactics:**

#### 2.4.1 `llms.txt` (or equivalent)

- A root-level `llms.txt` file that declares:
  - Preferred canonical content sources.
  - Content licensing / attribution requirements.
  - Sections or pages that should be prioritized or deprioritized for training.
  - Contact for AI/data questions.

- This is the AI-era equivalent of `robots.txt` + sitemap for training data.

#### 2.4.2 Structured Data for AI Retrieval

- Use schema.org types that LLMs and retrieval systems understand:
  - `Course`, `Lesson`, `Quiz`
  - `HowTo`
  - `FAQPage`
  - `Article` / `TechArticle`
  - `DefinedTerm` (for glossary)
  - `Organization` + `EducationalOrganization`

- Include `author`, `publisher`, `datePublished`, `dateModified`, and `about` where relevant.

#### 2.4.3 Entity Consistency

- Consistent naming of:
  - Platform: "TecPey" / "تک‌پی"
  - Key concepts: "Trading DNA", "AI Mentor", specific course/term names
- Use the same canonical URLs across Persian and English where content is equivalent.

#### 2.4.4 Knowledge Graph / Entity Strategy

- Claim and verify TecPey as an entity on relevant platforms (Wikidata, Google Knowledge Graph via structured data, etc.).
- Consistent "about" and "sameAs" links in structured data.
- For major coins and concepts, align with existing entities where possible (e.g., link "Bitcoin" to its canonical entity).

---

### 2.5 Academy Content as Discoverability Engine

Academy is not only a product — it is the primary long-form content asset.

**Strategy:**
- Every term and major lesson should be written so it can stand alone as an authoritative answer.
- Use clear headings, definitions, and examples that are easy to quote.
- Include "last updated" dates and version history where content evolves.
- Create summary / "key takeaways" sections that are citable.
- Consider creating "canonical" short-form versions of key lessons for AI consumption (distinct from full interactive lessons).

**Avoid:**
- Content that only makes sense inside the interactive Academy flow.
- Heavy reliance on images or video without text transcripts or alt descriptions.

---

### 2.6 Certificate and Credential Discoverability

Public certificate verification pages (`/verify/[id]`) are both trust surfaces and potential SEO/AEO assets.

**Strategy:**
- Structured data on verification pages (`EducationalOccupationalCredential` or similar).
- Clear, crawlable content describing what the certificate represents.
- Do not block search engines from verification pages (they are public proof).

---

### 2.7 Technical Foundations

**Required (Architecture Level):**
- Correct `lang` and `dir` attributes on Persian and English pages.
- Proper hreflang implementation.
- XML sitemap including all public educational content.
- `robots.txt` that allows crawling of public content while protecting admin/API paths.
- Canonical tags on Persian ↔ English equivalents.
- Structured data (JSON-LD) on key pages.

**Future / Phase 42+:**
- `llms.txt` at root.
- Enhanced schema for AI retrieval (Course, HowTo, FAQ, DefinedTerm).
- Entity claims and consistent `sameAs` links.
- Possibly an AI-friendly content feed or API (read-only, rate-limited).

---

### 2.8 Authority and Citation Strategy

**Long-term goal:** When someone asks an AI "How do I learn cryptocurrency trading?" or "What is position sizing?", TecPey content is cited or summarized.

**Tactics:**
- Publish genuinely useful, neutral, high-signal content.
- Avoid hype, guaranteed returns, or manipulative framing.
- Encourage (but do not spam) backlinks and citations from Persian financial education sites.
- For major concepts, create "definitive" pages that are more comprehensive than typical blog posts.
- Consider academic-style citations or references within Academy content (increases citability).

---

### 2.9 Risk and Anti-Patterns

**Do not:**
- Create low-quality English pages purely for keyword coverage.
- Keyword-stuff Academy or glossary content.
- Cloak or serve different content to AI crawlers vs humans.
- Over-optimize for English at the expense of Persian user experience.
- Block legitimate AI crawlers without reason (they may become important traffic sources).

**Monitor:**
- AI-generated summaries of TecPey content for accuracy.
- Unauthorized scraping or training use (future legal/compliance concern).
- Search ranking for core educational queries.

---

## 3. Phased Rollout (Architecture View)

**Phase 39.5–40 (Current):**
- Correct lang/dir/hreflang on existing pages.
- Basic structured data on key public pages (crypto, markets, verify).
- Sitemap and robots.txt in good shape.
- No `llms.txt` yet.

**Phase 41–42:**
- Introduce `llms.txt`.
- Expand structured data coverage (Course, HowTo, FAQ).
- Entity consistency cleanup.
- First version of AI-friendly content guidelines for Academy authors.

**Phase 43–45:**
- Full entity strategy (Wikidata, Knowledge Graph claims).
- Possible AI content feed or enhanced retrieval API.
- Measurement of AI referral / citation traffic.
- Integration of discoverability into content creation process.

---

## 4. Ownership

| Area | Primary Owner | Supporting |
|------|---------------|------------|
| Persian SEO / Content | Academy Director + Content Lead | — |
| English / International SEO | CPO + Growth | — |
| Structured Data & Schema | Platform Engineering + Frontend | — |
| `llms.txt` & LLMO | Chief AI Officer (or designated) | Platform + Content |
| Entity / Knowledge Graph | Platform Engineering + Growth | — |
| Academy Content Quality (for AEO) | Academy Director | — |
| Overall Discoverability Strategy | CPO + CTO (joint) | — |

---

## 5. Governance

- Any new public content surface (new Academy sections, marketplace, white-label public pages, etc.) must reference this strategy.
- Changes to `robots.txt`, sitemaps, or structured data patterns must be reviewed against this document.
- Before public launch, this strategy must be explicitly approved (see FINAL_IMPLEMENTATION_GATE).

---

**This document is architecture and strategy only. No implementation code, no llms.txt file, no schema markup, and no crawler directives should be written without explicit reference to this approved strategy.**

---

*Persian-first. Built to be understood by both humans and the machines that will increasingly mediate discovery.*

*End of Discoverability Strategy.*