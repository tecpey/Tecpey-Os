# TecPey Visual Identity, Arena, Mentor and Discovery Audit

**Status:** Working execution brief
**Date:** 2026-08-09
**Scope:** UI/UX redesign governance, Trading Arena data reality, Mentor AI provider/memory boundary, crypto news/coin/tool discovery integration
**Companion contract:** `docs/architecture/TECPEY_CONTENT_GROWTH_AUTOMATION_CONTRACT.md`
**Design system foundation:** `docs/ui/TECPEY_DESIGN_SYSTEM_FOUNDATION.md`
**Route inventory:** `docs/architecture/TECPEY_ORGANIC_GROWTH_ROUTE_INVENTORY.md`

## Executive Decision

TecPey must be treated as a Persian-first financial education and trading operating system, not a generic crypto landing page. The UI/UX rebuild should use the official TP blue/cyan identity supplied by the founder and must stay consistent across public pages, Academy, Trading Arena, Mentor, markets, coin pages, tools, news, and bilingual English surfaces.

The next work should not be a single large visual rewrite. It should be executed as a sequence of bounded PRs:

1. Design-system and brand-token hardening.
2. Growth discovery architecture for coins, news, tools, lessons, quizzes and SEO/GEO/AEO.
3. Trading Arena datafeed and simulation maturity.
4. Mentor AI operating-layer maturity.
5. Page-by-page UI/UX rebuild with evidence, screenshots and accessibility checks.

## Brand and UI Direction

### Design Read

TecPey should read as:

- Persian-first trust platform for crypto market entry.
- Education-first financial operating system.
- Professional trading practice environment.
- Calm, secure, dense where data matters, and clear for beginners.
- Blue/cyan TP identity as the visual anchor.

### Locked Visual Principles

- Use the official TP mark as the only primary brand symbol.
- Treat the uploaded TP blue/cyan assets and the governed brand registry as the visual source of truth; do not introduce alternate marks or color families.
- Keep the core palette in the blue/cyan family. Avoid AI-purple gradients, beige/tan fintech templates, decorative orbs, and generic dark mesh backgrounds.
- Use one radius scale per surface. Financial dashboards should be tighter than marketing surfaces.
- Use lucide only where the repo already depends on it; do not add icon libraries without review.
- Preserve Persian RTL quality first, then ensure English LTR parity.
- Make charts, tables, cards, forms, empty states, loading states, error states and mobile navigation share one system.
- Data-heavy views may be denser than landing sections, but must keep 44px touch targets and keyboard access.
- Motion should be restrained: 150-300ms, transform/opacity only, reduced-motion support, no blocking animations.

### Page Families

| Surface | Design Priority | Notes |
| --- | --- | --- |
| Public landing | Trust, clear dual path | Exchange entry and free Academy should stay equally visible. |
| Academy | Structured learning confidence | Lessons, quizzes, progress, Mentor and certificates must feel like one learning OS. |
| Trading Arena | Dense professional practice | TradingView-level chart shell plus TecPey risk, journal and Mentor overlays. |
| Markets and coins | Discoverability and decision hygiene | Price, data, news, risk, official sources and lessons should be connected. |
| Tools | Curated professional toolbox | Featured tools first, then ranked list with official links, warnings and fallback when iframe is blocked. |
| News | Market intelligence, not hype | Fresh news must route users into coins, lessons, quizzes and risk context. |

## Current Trading Arena Reality

### What Exists

The Arena has two different layers:

1. **Authoritative execution path**
   - Endpoint: `/api/trading-arena/execution`
   - Main files:
     - `src/app/api/trading-arena/execution/route.ts`
     - `src/lib/trading-arena-execution-v2.ts`
     - `src/lib/arena-market-price.ts`
     - `src/components/academy/trading-arena/TradingArenaExecutionClient.tsx`
   - It is server-authoritative and PostgreSQL-backed.
   - It stores active attempt aggregate, revision, commands, events, positions, pending orders, closed trades, fees, PnL and Mentor trade-decision signals.
   - Initial virtual balance is `$100,000`.
   - Attempts are exactly three per cycle.
   - It supports BTC and ETH only today.
   - Supported command types: `market_buy`, `limit_buy`, `cancel_order`, `close_position`, `refresh_market`.
   - Risk controls include minimum trade, 20% max single allocation, 5% warning flag, max five open positions, max twenty pending orders, slippage and fee model.

2. **TradingView chart/display path**
   - Main file: `src/components/TradingViewChart.tsx`
   - Uses bundled TradingView charting library in `public/charting_library`.
   - Uses UDF datafeed adapter under `public/datafeeds`.
   - Datafeed URL is `${NEXT_PUBLIC_API_BACKEND_URL}/api/v1/chart/spot`.
   - This is a display/chart integration path, not the same authority as Arena execution.

### Market Data Reality

- Arena execution currently fetches server-side BTC/ETH prices from:
  - configured `ARENA_PRICE_FEED_URL`, or
  - public Binance spot ticker fallback when allowed.
- Default fallback URL is Binance public spot ticker for `BTCUSDT` and `ETHUSDT`.
- Cache TTL is two seconds.
- Snapshot max age is 15 seconds.
- Production fails closed unless a permitted HTTPS feed is configured or public Binance fallback is explicitly enabled.
- Public displayed chart prices remain TradingView/UDF/API-backend driven, not a full independent server-side market data oracle for all display paths.

### How Close Is It To TradingView?

TecPey has the TradingView advanced charting shell, but it is not yet TradingView-level as a complete product.

| Area | Current Status | Gap To TradingView-Level |
| --- | --- | --- |
| Advanced chart UI | Bundled TradingView library exists | Need reliable UDF backend, symbol coverage, health, caching, and licensing review. |
| Indicators | TradingView library can expose chart tools depending on configuration | Need product decision on enabled studies, templates, layouts and user saved settings. |
| Drawing tools | TradingView library includes line tools | Need persistence policy and user ownership if saved drawings are enabled. |
| Real-time data | Chart depends on external UDF backend and socket paths | Need multi-provider market data pipeline and SLA. |
| Paper trading | Arena server execution exists for BTC/ETH long-only buy/close | Need shorts, sell flows, more assets, historical replay, scenarios, position sizing tools, and market-maker simulation. |
| Journal/Mentor link | Trade decisions and flags are saved | Need post-trade reflections, mistake tags, learned lessons and durable Mentor feedback loop. |

## Mentor AI Reality

### What Exists

Main files:

- `src/app/api/ai-mentor/route.ts`
- `src/lib/ai/mentor-provider.ts`
- `src/lib/ai/mentor-trust-boundary.ts`
- `src/lib/ai/mentor-trust-store.ts`
- `src/lib/mentor-memory.ts`
- `src/lib/mentor-events.ts`

Mentor currently:

- Uses OpenAI Responses API through `callMentorProvider`.
- Has primary and fallback model env vars: `OPENAI_MODEL`, `OPENAI_MODEL_FALLBACK`.
- Falls back to local Academy guidance when provider is disabled, unavailable, low-cost greeting path, or evidence cannot be persisted.
- Stores conversation pairs server-side when persistence succeeds.
- Records append-only AI request evidence.
- Blocks secret egress before external provider calls.
- Ignores client-supplied history/progress/behavioral context.
- Can use server-owned Academy context, Mentor memory and optional behavioral personalization.
- Schedules non-blocking Mentor profile updates after meaningful events.

### What Does Not Exist Yet

The broader "TecPey AI Operating System" is not complete yet.

It is not currently:

- An autonomous AI employee that freely searches the internet, installs MCP tools and performs operational tasks.
- A complete multi-provider AI router with evaluations, budgets, tool permissions and human approval workflow.
- A durable background-agent platform that reads all logs and auto-fixes issues.
- A real exchange adviser or trading signal engine.
- Connected to real exchange user signals; `real_exchange_signals_enabled` is intentionally forced false.

### Provider and Memory Policy

TecPey should continue using approved external model providers behind a strict server boundary. The correct direction is:

1. External provider for reasoning and generation.
2. TecPey-owned memory, evidence and event log as durable institutional memory.
3. Retrieval from authorized TecPey data before provider calls.
4. Redaction and data-class filtering before egress.
5. No raw secrets, tokens, credentials or unauthorized financial behavior leaving TecPey.
6. Every AI action should write evidence that future TecPey AI can use.

This means "TecPey AI" is born as a governed memory and orchestration layer over providers, not as a magical self-contained model.

## Exchange and Account Separation

Current product reality:

- Public/Academy domain: `tecpey.ir`
- Exchange/auth subdomain: `my.tecpey.ir`
- Auth gateway links point to `https://my.tecpey.ir/signin` and `https://my.tecpey.ir/signup`.
- Academy dashboard text states that Dashboard, terms, Mentor and Trading Arena belong to the dedicated Academy account.
- During the current transition, the Academy account and the external/subdomain exchange account are separate.

This separation is acceptable for the launch window if the UI states it clearly. The future direction should be account unification through a governed identity bridge, not silent mixing of credentials, sessions or financial authority.

## Discovery Layer: Coins, News, Tools, Lessons

### Current News

Main file: `src/app/api/crypto-news/route.ts`

The news route:

- Pulls RSS feeds for English and Persian.
- Uses fallback items when feeds fail.
- Calculates tone, impact, breaking status, trend score, category and related lesson.
- Revalidates source fetches at 900 seconds today.
- Can generate news quiz bank when `quiz=1`.

Gap:

- It is not yet a ten-minute ranked cross-linking engine for coin pages, tool pages and Academy lessons.
- News items are not yet normalized into durable entities with symbols and priority lifecycle.
- New/updated news content is not yet forced through an automated SEO/GEO/AEO enrichment and quality gate before publication.

### Current Coin Pages

Main files:

- `src/app/coins/page.tsx`
- `src/app/coins/[slug]/page.tsx`
- `src/data/coins.ts`
- `src/data/coinKnowledge.ts`

The coin pages already include:

- Persian SEO metadata.
- FAQ schema.
- Coin profile content.
- Official website/docs/whitepaper links.
- Risk, tokenomics and checklist content.

Gap:

- They do not yet surface top news by symbol priority.
- They do not yet rank coins by fresh high-impact news.
- English coin parity needs a dedicated audit.
- Live market data and long-form content are not yet unified in one content model.
- Coin pages are not yet connected to a materialized ten-minute priority ranking from high-impact news.

### Current Tools

Main files:

- `src/app/trading-tools/page.tsx`
- `src/components/tools/TradingToolsClient.tsx`
- `src/data/traderTools.json`

The tools page already has:

- Search.
- Category filter.
- Tool detail dialog.
- Official site, iOS and Android links.
- Persian and English copy fields.
- Accessibility dialog handling.

Gap:

- No featured/ranking model yet.
- No safe iframe feature yet.
- No iframe-block fallback model.
- Tool pages are modal-only, not deep-linkable detail pages.
- Tools are not yet passed through the same automatic SEO/GEO/AEO, ranking and publication contract as coins/news/Academy content.

## Content Growth Automation Contract

The next execution branch must use `docs/architecture/TECPEY_CONTENT_GROWTH_AUTOMATION_CONTRACT.md` as the source of truth for automated organic acquisition. The contract locks:

- Persian-first and English/global discoverability;
- automatic SEO/GEO/AEO enrichment before publication;
- entity contracts for content, coins, news, tools, lessons, quizzes and relations;
- ten-minute target cadence for news-to-coin ranking materialization;
- featured and ranked tool surfaces;
- safe iframe plus blocked-frame fallback;
- quality gates against hype, thin content, copied source text and financial advice;
- sitemap/feed refresh and privacy-safe growth measurement;
- AI evidence retention so future TecPey AI can reuse prior content, ranking and operational decisions.

No page-by-page redesign should start until the page family is mapped to this contract or explicitly documented as unaffected.

## Required Architecture For The Next PRs

### Data Models

Add or formalize:

- `CoinEntity`
- `NewsArticle`
- `NewsCoinImpact`
- `ToolEntity`
- `ToolRanking`
- `LessonEntity`
- `QuizEntity`
- `SeoProfile`
- `EntityRelation`

### Ranking Rules

Coin ranking should combine:

- news freshness;
- news impact;
- symbol confidence;
- market importance;
- volatility/liquidity context;
- editorial risk warnings;
- user learning relevance.

Tool ranking should combine:

- featured flag;
- safety/reputation score;
- beginner usefulness;
- professional usefulness;
- category importance;
- official link availability;
- iframe availability;
- popularity/editorial weight.

### Update Cadence

- News ingestion target: hourly.
- Public pages should serve cached server results, not client-only recomputation.
- The UI should show "updated at" and degraded/fallback states.
- No hype labels should imply trading advice.

## Recommended PR Sequence

1. `agent/design-system-brand-foundation`
   - TP logo authority.
   - CSS tokens.
   - core layout primitives.
   - page shell and section rules.
   - RTL/LTR verification.
   - route-family evidence from `docs/architecture/TECPEY_ORGANIC_GROWTH_ROUTE_INVENTORY.md`.

2. `agent/growth-discovery-entity-model`
   - durable model/contract for news, coins, tools, lessons and relation ranking.
   - no large UI rewrite yet.

3. `agent/content-optimization-pipeline`
   - automated SEO/GEO/AEO metadata and structured-data generation.
   - quality/safety gate before publication.
   - sitemap/feed refresh hooks.

4. `agent/news-detail-entity-pages`
   - canonical TecPey news detail pages.
   - source attribution.
   - related coin/tool/lesson blocks.

5. `agent/news-coin-priority-surface`
   - top five high-impact coin news units.
   - coin page related-news module.
   - `/crypto-news` detail/deep-link path.

6. `agent/tools-ranking-detail-pages`
   - featured five tools.
   - ranked list.
   - tool detail pages.
   - safe iframe with blocked-frame fallback.

7. `agent/seo-geo-aeo-public-surfaces`
   - route inventory for FA/EN public pages.
   - metadata, canonical, hreflang, schema and AEO validation.

8. `agent/arena-market-data-maturity`
   - broaden Arena feed beyond BTC/ETH.
   - design market data provider abstraction.
   - align chart UDF, Arena execution and market-board contracts.

9. `agent/mentor-ai-operating-memory`
   - durable queue for Mentor profile updates.
   - richer event ingestion.
   - AI evidence retrieval for repeated incident patterns.
   - admin/support log-reading plan with human approvals.

10. `agent/academy-content-depth-term-by-term`
   - term/lesson/quiz quality pass.
   - wrong-answer-to-Mentor loop.
   - news/tool/coin links inside lessons.

11. `agent/growth-measurement-foundation`
   - privacy-safe organic/referral measurement.
   - page-to-signup, page-to-Academy and page-to-Arena path evidence.

12. `agent/page-by-page-ui-redesign`
   - rebuild pages in batches with screenshots, accessibility checks and public route tests.

## Hard Product Truths

- The current Arena is a serious start, but it is not yet a full TradingView-grade paper trading terminal.
- The current chart can look TradingView-like because the library is bundled, but datafeed reliability and product-level tooling decide the real quality.
- The current Mentor is provider-backed and governed. It is not a self-running company AI yet.
- The AI memory/evidence foundation is valuable and should become the core of TecPey AI, but autonomous operations need a separate governed platform.
- `my.tecpey.ir` can remain separate during this phase, but the UI must be explicit that Academy and exchange accounts are separate until the identity bridge is implemented.
- All SEO/GEO/AEO work must be tied to real content quality and structured data, not only metadata.
