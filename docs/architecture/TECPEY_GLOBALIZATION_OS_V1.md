# TecPey Globalization OS v1

Status: architecture authority + quality-gated implementation foundation
Base: Academy-first, Mentor-led first release
Primary objective: make every activated locale feel authored in that language, not mechanically translated

## 1. Global Core decision

TecPey will not launch twelve shallow language editions at once. The first global wave is ten total languages, including the two existing editions:

1. Persian (`fa`) — active, historic unprefixed canonical routes
2. English (`en`) — active, global edition
3. Spanish (`es`) — quality-gated
4. Brazilian Portuguese (`pt-BR`) — quality-gated
5. Arabic (`ar`) — quality-gated, RTL
6. Turkish (`tr`) — quality-gated
7. Indonesian (`id`) — quality-gated
8. Hindi (`hi`) — quality-gated
9. Vietnamese (`vi`) — quality-gated
10. French (`fr`) — quality-gated

Tier 2 candidates: German, Japanese, Korean, Simplified Chinese and Russian. They are intentionally deferred until Search Console, organic acquisition, retention, content engagement and operational translation-quality evidence justify activation.

The selection balances global reach with crypto/financial-education demand across Latin America, Brazil, MENA, Türkiye, Southeast Asia, India and Francophone markets. More languages are not automatically more growth: thin or unnatural editions create indexing noise, weak engagement, duplicate-content risk and brand damage.

## 2. Non-negotiable quality bar

An activated locale must read as if TecPey was originally built for that language.

Translation alone is insufficient. Localization must cover:

- product terminology
- navigation and information architecture
- UI microcopy
- empty/loading/error/success states
- Academy lessons, quizzes, explanations and certificates
- AI Mentor system language and learning feedback
- Trading Arena educational copy and journal language
- News cards, full articles, summaries and evidence labels
- coin/tool/market educational context
- notifications and transactional messages
- metadata, OpenGraph and social cards
- JSON-LD `inLanguage`
- canonical and reciprocal hreflang
- internal links and breadcrumbs
- answer-engine summaries and entity descriptions
- AEO/GEO question-answer vocabulary
- locale-native keyword/search-intent models
- dates, numbers, currencies, pluralization and relative time
- LTR/RTL layout behavior
- accessibility labels and screen-reader copy

No page may present translated chrome around untranslated primary content and claim to be a localized edition.

## 3. Routing model

Persian keeps existing URLs to protect accumulated authority:

- `/`
- `/academy`
- `/crypto-news`

Every non-Persian locale uses a stable sub-path:

- `/en/academy`
- `/es/academy`
- `/pt-br/academy`
- `/ar/academy`
- `/tr/academy`
- `/id/academy`
- `/hi/academy`
- `/vi/academy`
- `/fr/academy`

Route segments are intentionally separate from BCP-47 metadata tags. Example: the URL segment is `pt-br`, while HTML and hreflang use `pt-BR`.

Changing language must preserve semantic location whenever that localized route exists. A user on `/en/crypto-news/example` switching to Spanish should land on the equivalent `/es/crypto-news/example`, never the Spanish home page merely because a localized URL mapper is missing.

## 4. Search architecture

Every indexable localized page must have:

- a self-referencing canonical
- a fully localized primary body
- `lang` and `dir` matching the locale
- reciprocal hreflang for every variant that actually exists
- an `x-default` fallback
- localized title and description
- localized OpenGraph copy
- JSON-LD with correct `inLanguage`
- locale-aware breadcrumbs and internal links
- a sitemap entry only after the page passes publication quality gates

Hreflang must never advertise a planned or incomplete page. Return links must be reciprocal across every live variant.

The default alternate is the Persian canonical because Persian retains the unprefixed historic route. This can be revisited only through an explicit SEO migration plan; it must not drift accidentally.

## 5. SEO / GEO / AEO rule

Global discovery is not implemented by translating Persian keywords word-for-word.

For every locale, the content optimizer must produce locale-native:

- search intents
- primary and secondary query clusters
- question clusters
- entity vocabulary
- glossary synonyms
- short-answer blocks
- comparison framing
- internal-link anchors
- title and description variants
- structured-data text
- LLM/answer-engine summaries
- source/evidence language
- freshness labels

AEO/GEO output must answer the questions users in that language actually ask. Search demand, accepted terminology and phrasing are locale-specific.

## 6. News and content fan-out

One verified source event may create up to ten locale artifacts, but each locale is its own governed publication unit.

Pipeline:

`verified source -> evidence extraction -> source digest -> locale fan-out -> deterministic integrity -> terminology/glossary -> semantic fidelity -> native-fluency evaluation -> financial-safety evaluation -> localized SEO/AEO/GEO -> locale publication gate -> index/update`

The pipeline should generate locale drafts concurrently for latency efficiency. Publication remains independent per locale: one bad Arabic translation must not force a good Spanish artifact to publish incorrectly or be silently marked complete.

Raw machine output never publishes directly. For an already-active locale, high-volume low-risk artifacts such as News and evidence-backed market/coin/tool/SEO context may publish automatically only after the governed automation gate proves all base localization requirements, low risk, an independent semantic evaluator pass and confidence of at least 0.97. Any ambiguity, failed gate, elevated risk or inactive locale routes the artifact to review instead of publication. Legal/compliance content is never eligible for automated publication.

This distinction is intentional: TecPey can achieve simultaneous multilingual freshness without turning translation speed into an editorial or financial-safety bypass.

The all-locale batch is complete only when every required target locale has either:

- passed and published, or
- produced an explicit fail-closed/review state with reason evidence.

No missing locale may disappear from observability.

## 7. Translation integrity

The deterministic gate is the first floor, not the final quality judgment.

It protects:

- numbers and percentages
- dates and durations
- URLs
- interpolation/ICU placeholders
- asset symbols
- product/entity names
- source names

Numeric comparison normalizes Latin, Arabic-Indic, Persian and Devanagari digits before comparison so native numeral glyphs do not create false failures.

Semantic evaluation must separately prove:

- no meaning was removed
- no unsupported claim was added
- uncertainty and confidence were preserved
- financial-risk wording was not strengthened into advice
- source attribution still means the same thing
- the result is fluent to a native reader

## 8. Financial-safety localization

Translation must never turn education into execution language.

The following must survive every locale:

- no personalized buy/sell signal
- no guaranteed return
- no leverage recommendation
- no autonomous order execution
- no autonomous fund movement
- no invented market certainty
- clear distinction between simulation and real financial exposure

Financial-safety evaluation happens after translation, not only on the source text. A safe English sentence can become unsafe through an aggressive or inaccurate localization.

## 9. Legal and compliance content

Rules, privacy, risk disclosure, fee/legal claims and jurisdiction-sensitive content always require human approval before public publication in a new locale.

AI can produce a draft and terminology evidence, but it cannot be the final release authority for legal meaning.

No locale activation may imply that a financial capability is available in a jurisdiction where TecPey has not explicitly enabled it.

## 10. Locale activation gate

A locale remains `quality_gated` until all of the following are proven:

- complete required dictionary coverage
- zero source-language leakage on the P0 journey
- native-quality Home / Academy / Mentor / Trading Arena / News / Markets / Coins / Tools shell
- correct LTR/RTL and typography behavior
- responsive mobile QA
- accessibility labels localized
- locale-specific metadata and structured data
- reciprocal hreflang
- sitemap correctness
- internal-link parity
- News materialization in that locale
- SEO/AEO/GEO generation in that locale
- deterministic translation-integrity tests
- semantic/native-fluency evaluation evidence
- no-added-advice safety evidence
- browser smoke evidence
- staging screenshots for mobile + desktop

Activation is a code/config decision backed by evidence. The presence of `<locale>.json` is never sufficient.

## 11. Language switcher behavior

The language selector shows only active locales in production.

Rules:

- display native language names
- preserve the current semantic route
- persist explicit user choice
- never silently override an explicit choice
- do not show unavailable locales as clickable destinations
- do not use flags as the primary representation of language
- support keyboard and screen-reader navigation
- handle RTL/LTR transition without layout flash

Browser language can be used to suggest an edition on first visit, but explicit user selection remains authoritative.

## 12. Dictionary architecture

UI strings must migrate from page-local hard-coded bilingual branches into typed namespaces.

Recommended namespaces:

- `common`
- `navigation`
- `footer`
- `auth`
- `academy`
- `mentor`
- `arena`
- `news`
- `markets`
- `coins`
- `tools`
- `profile`
- `notifications`
- `legal`
- `seo`
- `errors`
- `accessibility`

Keys represent product meaning rather than English wording. Example: `academy.startFree` is stable; `start_free_academy_button_text_v2` is not.

## 13. Translation memory and glossary

Every generated artifact records:

- source locale
- source content ID
- immutable source digest
- target locale
- translation provider
- model/version
- glossary version
- semantic evaluator version
- quality outcome
- review outcome where required
- publication timestamp

The glossary is versioned and shared by UI, News, Academy, Mentor and SEO automation. Product names and financial terms must not drift between subsystems.

## 14. Native-content rule

High-value evergreen pages should eventually become locale-authored, not permanently machine-translated.

Priority for native editorial passes:

1. Home
2. Academy landing and curriculum
3. AI Mentor positioning
4. Trading Arena explanation
5. security education
6. core glossary
7. top coin/tool pages
8. highest-organic News/topic hubs

Automation remains ideal for high-volume News and freshness content, provided every locale passes the same fail-closed quality system.

## 15. Observability

Globalization dashboards must expose per locale:

- translation queue depth
- translation latency p50/p95
- deterministic QA failure rate
- semantic QA failure rate
- human-review backlog
- source-language leakage count
- published article count
- indexable URL count
- hreflang error count
- crawl/index coverage
- organic impressions/clicks
- AEO/GEO referral/mention evidence when measurable
- conversion to Academy
- retention and return visits

A language is an operating surface, not a checkbox.

## 16. Rollout order

### Wave 0 — foundation

- locale registry
- routing identity
- SEO/hreflang builders
- deterministic translation integrity
- publication authority
- test contracts

### Wave 1 — global public shell

- Home
- Navbar/Footer/language selector
- Academy landing
- AI Mentor landing/entry
- Trading Arena education entry
- News index
- Markets/Coins/Tools index

### Wave 2 — content automation

- ten-locale News fan-out
- locale-native SEO/AEO/GEO enrichment
- localized trend intelligence
- localized coin/tool context
- indexing only after locale gate

### Wave 3 — learning OS

- Academy terms
- quizzes and explanations
- Term 8 Infinite Growth
- Mentor coaching output
- notifications
- profile/settings
- certificates

### Wave 4 — depth and optimization

- native editorial upgrades for winning topics
- search-intent expansion by locale
- market-specific internal-link graphs
- Tier 2 activation only from evidence

## 17. Definition of Done

Globalization v1 is not complete when routes exist. It is complete when an activated locale can traverse the full P0 learning journey without seeing Persian/English leakage, receives News/content automation with equivalent evidence and safety, exposes correct SEO/AEO/GEO signals, and passes native-quality responsive and accessibility evidence.
