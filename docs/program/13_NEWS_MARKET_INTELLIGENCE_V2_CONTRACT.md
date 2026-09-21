# News & Market Intelligence v2 — governed freshness, narratives and discovery

**Base main:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** existing news/market pipelines + #700 Deep Research provenance contract; #707 may consume durable notification candidates; #708 performs final cross-product hardening.

## Objective

Turn News/Markets into a governed, current, source-transparent intelligence surface with premium interaction quality and zero implication of trading advice.

## Product experience

### News home
- latest trustworthy item is first by authoritative publication/event time;
- horizontally swipeable/cards on mobile with keyboard/pointer alternatives on desktop;
- center/focal card + adjacent context without clipping focus or creating gesture-only interaction;
- every card includes governed thumbnail/fallback, source, publication time, freshness and locale-aware summary;
- Persian surface may summarize high-quality non-Persian sources in Persian while preserving original source identity;
- duplicate/near-duplicate stories collapse into one story cluster with source count and materially different viewpoints;
- user can move between cards without losing reading position;
- saved/read/history states are server-bound where persisted.

### Market board
- live price is displayed only with source + freshness timestamp;
- stale/unavailable price becomes explicit degraded state, never a frozen number presented as live;
- trend coins are computed from a versioned, inspectable policy—not editorial hard-coding;
- 5-item compact discovery strip remains clickable and mobile-safe;
- no price color alone conveys meaning; text/icon/accessible name also communicates direction/state.

### Intelligence layer
- story clusters expose “what happened / why it matters / evidence / conflicting evidence / unknowns”;
- social narrative is a separate channel from factual market evidence;
- X/social popularity never becomes market truth or buy/sell signal;
- source quality, recency and independence influence synthesis but are not hidden “magic scores” shown without explanation;
- Deep Research escalation reuses #700 claim/source/citation/freshness contract;
- Mentor may explain a story but cannot invent a source or silently turn sentiment into advice.

## Pipeline and authority

- normalized source registry with canonical source ID, language, trust metadata and allowed usage;
- ingest → normalize → dedupe/cluster → enrich → summarize → publish;
- canonical event/publication timestamps separated from ingestion time;
- deterministic dedupe keys plus semantic clustering with bounded model use;
- thumbnail provenance and safe fallback hierarchy;
- cache invalidation/freshness policy per data class;
- hourly/10-minute jobs remain explicit by source class rather than one global timer;
- replayable pipeline events and dead-letter/retry handling;
- provider/API outage reason codes;
- tenant/public content boundaries explicit.

## Safety / trust

- no “guaranteed move”, “strong buy/sell”, fabricated certainty or hidden affiliate ranking;
- sponsored/promotional content, if ever supported, is explicitly labeled and cannot enter organic ranking without disclosure;
- summaries preserve attribution and separate reported claim from TecPey synthesis;
- material corrections create a visible correction/update trail rather than silently rewriting history.

## Accessibility / interaction

- WCAG 2.2 AA minimum;
- 44px preferred primary swipe/next/previous/read targets;
- horizontal carousel has buttons/keyboard path and does not require drag;
- reduced motion switches card transitions to bounded crossfade/no transform;
- RTL scroll semantics verified on Safari/iOS;
- focus never lands on off-screen/covered cards.

## Observability

- source freshness SLA, ingest lag, dedupe rate, cluster cardinality, summary failure, thumbnail failure, stale-price count;
- no raw private user data in content telemetry;
- user-interest personalization is explainable and opt-out-able.

## Tests / evidence

- deterministic latest-first ordering with conflicting timestamps;
- duplicate story cluster tests across translated headlines;
- stale market-data negative tests;
- social-vs-factual evidence separation tests;
- source/citation integrity;
- FA/EN parity and bidi;
- mobile/desktop browser carousel evidence;
- reduced-motion + keyboard + no-horizontal-overflow;
- exact-head CI and repository audit classification.

## Acceptance

A user can identify source, freshness and uncertainty for every time-sensitive item. When market/news authority fails, the UI degrades explicitly. No story, price or narrative can silently become a trading recommendation.

## Release boundary

Draft until exact-head gates and browser evidence are green. No merge/deploy is authorized by opening this PR.
