# Organic Growth OS v2 — trend intelligence, answerability and measurable distribution

**Base main:** `96b56d0e469b356ccf8ee698c5a75a36d1cabe60`

**Dependencies:** #709 for governed news/trend inputs; existing Organic Growth Profile/content automation foundations; #708 performs final integration hardening.

## Objective

Build a durable organic-growth operating system that converts real audience questions and timely market/learning topics into useful, source-grounded content—without SEO spam, fake expertise or duplicate pages.

## Operating loop

Trend Intelligence → Topic/Intent Map → Content Brief → Human/AI Production → Experience/Internal Linking → Distribution → Measurement → Refresh/Retire.

## Research-derived search/answerability controls

Primary references:
- Google structured-data policies: https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- Structured-data introduction: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
- Localized versions / hreflang: https://developers.google.com/search/docs/specialty/international/localized-versions

Implementation consequences:
- structured data must represent visible/main page content; hidden or misleading schema is a release blocker;
- JSON-LD is preferred when appropriate, but eligibility for rich results is never treated as guaranteed ranking/traffic;
- every FA/EN alternate set is reciprocal/self-referential and uses one maintained hreflang strategy rather than contradictory HTML/header/sitemap implementations;
- canonical and hreflang semantics are tested together for localized pages;
- FA and EN main content must be genuinely localized; translating chrome/navigation alone does not qualify as content parity;
- publication/modified dates shown to users and machine-readable metadata stay consistent;
- AEO/GEO summaries are derived from canonical visible content and cannot contain claims/qualifiers absent from the page;
- no crawler/LLM-only copy, cloaking, doorway generation or schema inflation;
- sitemap/indexability validation must be coupled to an authoritative publication/indexability decision for any generated content surface.

## Current-main reconciliation: publication authority → sitemap

The current-main audit distinguishes **proven authority** from architectural intent:

1. `src/lib/news-automation.ts` already constructs governed content objects and requires publishability/Organic Growth readiness before a materialized news item can be publishable.
2. `src/lib/news-impact-history-authority.ts` is the effective public News authority. Its archive/read paths re-apply publication-source eligibility and freshness constraints before returning items; `src/app/sitemap.ts` consumes `getNewsDetailSitemapEntriesFromAuthority()`.
3. The remaining sitemap families—curated static routes, `learningSeoPages`, trader-tool catalogs, coin catalogs and Academy articles—are not currently passed through the generic `ContentPublicationStatus` / `decideLocalizationPublication()` authority. They are trusted catalog/static sources rather than demonstrated examples of draft/retired leakage.
4. Therefore, the audit **does not claim an observed draft/retired sitemap leak** on current-main. The actual integration gap is architectural: the generic publication/indexability authority is not yet the single contract for every sitemap-producing family.
5. PR #743 remains Draft until this boundary is either:
   - closed by a real adapter that maps each sitemap-producing family to explicit published/indexable/canonical/hreflang authority, with exact-head regression coverage; or
   - explicitly accepted as a bounded architecture exception with owner, evidence, review date and a follow-up implementation PR.
6. No second competing sitemap source of truth should be introduced merely to satisfy this contract. The preferred implementation is one shared publication/indexability boundary consumed by sitemap generation.

This reconciliation is intentionally fail-closed: absence of evidence of leakage is not treated as proof that every generated URL is governed.

### Adapter matrix for closing the boundary

The closure must distinguish **stateful generated content** from **curated catalog content**; treating every static catalog as if it had a hidden draft state would create false authority rather than real governance.

| Sitemap family | Current source | Required publication adapter | Minimum indexability evidence |
|---|---|---|---|
| News detail | `getNewsDetailSitemapEntriesFromAuthority()` | existing News authority | publication/source eligibility + canonical detail identity + locale authority |
| Learning SEO | `learningSeoPages` | curated-content adapter | non-empty canonical identity, visible title/description/body, explicit curated-published state |
| Trader tools | `getTraderToolSlugs()` / tool growth snapshot | tool publication adapter | published tool record, valid official destination, canonical route, locale availability |
| Coins / price / crypto | `coinPages` | coin catalog adapter | published catalog record, stable slug/symbol, canonical route, explicit locale availability |
| Academy articles | `academyArticles` | academy article adapter | published article record, `updatedAt`, canonical route, visible content identity |
| Static product/trust routes | `staticPaths` / `englishPaths` | static-route registry | explicit route ownership; no generated-content state implied |

The adapter contract must be deterministic and fail closed. A family must not enter the sitemap merely because a URL can be constructed. For stateful/generated records, the adapter must consume the authoritative publication decision; for curated records, the adapter must make the curated-publication assumption explicit in code so a future draft/retired state cannot silently bypass the boundary.

The implementation should expose one sitemap-facing function (for example `getIndexableSitemapEntries`) rather than letting `src/app/sitemap.ts` independently decide publication for each family. Regression tests must prove: draft/needs-review/archived state is excluded where such state exists; missing canonical identity is excluded; unavailable locale alternates are not emitted; and every emitted generated URL has a corresponding publication decision.


## Entity / information architecture

- one canonical entity profile for each important TecPey concept/product/course/coin/topic;
- canonical URL, locale variants, hreflang, breadcrumbs and internal-link graph;
- structured metadata/schema only when content visibly supports it;
- explicit page purpose and search/user intent;
- prevent doorway/thin pages and near-duplicate FA/EN variants;
- content ownership, review date and freshness state.

## AEO / answerability

- concise answer summary for question-like pages;
- claim/source mapping for factual/current statements;
- definitions, comparisons, FAQs and step-by-step sections written for human comprehension first;
- machine-readable structured data mirrors visible content;
- LLM/answer-engine summary is generated from canonical content and never contains hidden claims;
- source attribution for current market/news content;
- “updated at” on time-sensitive pages.

## GEO / AI retrieval readiness

- clear entity names, aliases, relationships and disambiguation;
- stable headings and semantically complete sections;
- no cloaking or content that exists only for crawlers/LLMs;
- source-quality and correction trail;
- retrieval chunks do not sever critical qualifiers/risk context.

## Trend intelligence

- inputs from governed #709 clusters, search demand signals and first-party anonymous product questions where permitted;
- trend score is versioned and explainable by freshness, relevance, user value and source diversity;
- social virality alone cannot dominate;
- sensitive/private Mentor/KYC data never enters topic discovery.

## Content production

- editorial brief includes intent, audience, required evidence, counterpoints, internal links, locale notes, CTA and freshness class;
- AI can draft/research but publication requires policy checks; high-risk financial claims require stronger evidence/review;
- no mass auto-publish solely because a model produced copy;
- image/thumbnail ownership and alt-text requirements;
- Persian content is native-quality, not literal translation.

## Distribution

- owned channels first: site, Academy surfaces, notification candidates, social content queue;
- dedupe across channels;
- UTM/campaign metadata governed;
- no manipulative engagement loops.

## Measurement

- acquisition: impressions/clicks/qualified sessions;
- answer quality: useful engagement, follow-through to learning, return for refresh;
- search health: indexability, canonical/hreflang/schema errors;
- retention: content-assisted Academy actions without claiming causation from correlation;
- no vanity “AI visibility score” without observable methodology.

## Refresh / retirement

- freshness classes define review cadence;
- changed facts trigger revalidation;
- stale/low-value content can be merged, redirected or retired with link preservation;
- material corrections are logged.

## Security / quality

- publishing permissions and audit log;
- preview vs published state;
- prompt/source injection defenses for automated research inputs;
- HTML/schema sanitization;
- exact-head SEO/AEO/GEO tests plus crawlable sitemap/hreflang/canonical assertions.

## Acceptance

Growth OS can take a governed topic signal to a reviewable brief and canonical publishable content object with evidence/freshness/locale/internal-link metadata, then measure and refresh it without generating spam or duplicate authority.

## Release boundary

Draft until exact-head tests and content QA pass. No merge/deploy is authorized by opening this PR.
