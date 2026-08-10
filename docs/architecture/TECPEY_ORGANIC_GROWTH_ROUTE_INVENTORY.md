# TecPey Organic Growth Route Inventory

**Status:** Execution inventory for SEO/GEO/AEO, content automation and UI/UX redesign
**Date:** 2026-08-09
**Companion contracts:** `docs/DISCOVERABILITY_STRATEGY.md`, `docs/architecture/TECPEY_CONTENT_GROWTH_AUTOMATION_CONTRACT.md`, `docs/ui/TECPEY_DESIGN_SYSTEM_FOUNDATION.md`

## Purpose

This inventory prevents the organic-growth program from losing scope. Any PR that changes public pages, content entities, news, tools, coins, Academy, Arena, Mentor or bilingual SEO must update or cite this file.

## Route Families

| Family | Persian Routes | English Routes | Growth Role | Next Required Work |
| --- | --- | --- | --- | --- |
| Landing and trust | `/`, `/why-tecpey`, `/about`, `/security`, `/transparency`, `/status`, `/support`, `/contact-us`, `/media`, `/methodology`, `/risk-disclosure`, `/rules`, `/privacy`, `/fees`, `/business`, `/partners`, `/careers`, `/listing` | `/en`, `/en/why-tecpey`, `/en/about`, `/en/security`, `/en/transparency`, `/en/status`, `/en/support`, `/en/contact-us`, `/en/media`, `/en/methodology`, `/en/risk-disclosure`, `/en/rules`, `/en/privacy`, `/en/fees`, `/en/business`, `/en/partners`, `/en/careers`, `/en/listing` | Brand trust, branded search capture, conversion to Academy/exchange. | Landing now exposes a server-backed growth radar with exactly five news-led coins from high-priority impact history and five ranked tools plus ItemList schema; next apply remaining design tokens, dual CTA clarity and English parity audit. |
| Markets and prices | `/markets`, `/price`, `/price/[slug]`, `/crypto/[symbol]`, `/swap` | `/en/markets`, `/en/swap` | Search demand around live prices, beginner price intent and market-board discovery. | Align market data source clarity, metadata, price schema strategy and related Academy links. |
| Coins | `/coins`, `/coins/[slug]` | `/en/coins`, `/en/coins/[slug]` | Capture coin research queries and route users into education, news and tools. | Detail pages now show high-priority news impact history with publish/record times; next add ten-minute hub priority row, related lessons/tools and deeper EN parity. |
| News | `/crypto-news`, `/crypto-news/[slug]`, `/academy/news-quiz` | `/en/crypto-news`, `/en/crypto-news/[slug]`, `/en/academy/news-quiz` | Capture market-news search and create fresh entity relations for coins, tools and quizzes. | Canonical news hubs now expose server-rendered impact history with CollectionPage/ItemList schema, and detail pages expose NewsArticle evidence with source/time, related coins/tools/lessons, schema and sitemap. `automation=1` returns an ephemeral materialized snapshot; migration `0058_news_materialization_authority.sql`, `persistMaterializedNewsSnapshotTx`, and `npm run news:materialization:worker` define the append-only DB persistence authority and scheduled execution entrypoint. Public hub/detail/metadata/sitemap, landing structured-data and visible landing radar now read persisted evidence with seed fallback. `news:materialization:env-check`, `tecpey-news-materialization.service`, `tecpey-news-materialization.timer`, append-only operational run evidence and `news-materialization-last-run.json` now define production scheduler evidence and cache freshness reporting; next capture staging/production execution proof and repeated-failure alert policy. |
| Trading tools | `/trading-tools`, `/trading-tools/[slug]`, `/academy/tools`, `/academy/tool-based-decisions` | `/en/trading-tools`, `/en/trading-tools/[slug]` | Capture tool searches and build curated TecPey toolbox authority. | Featured five, governed ranking, detail routes, official links, sitemap, schema and news-impact history are now foundation scope; next add iframe/fallback policy, related lessons/coins and blocked-frame telemetry. |
| Learn and glossary | `/learn`, `/learn/[slug]`, `/glossary`, `/glossary/[slug]`, `/compare`, `/compare/[slug]`, `/compare-exchanges`, `/faq`, `/start-guide` | `/en/glossary`, `/en/compare`, `/en/compare-exchanges`, `/en/faq`, `/en/start-guide` | AEO/LLMO answer surfaces and long-tail education capture. | Add visible definition blocks, concise answers, FAQ/DefinedTerm/Article schema and internal entity links. |
| Academy core | `/academy`, `/academy/free`, `/academy/curriculum`, `/academy/term-1` to `/academy/term-7`, `/academy/[slug]`, `/academy/learning`, `/academy/readiness`, `/academy/evaluation`, `/academy/final-assessment`, `/academy/graduation` | `/en/academy` | Primary educational moat and citable curriculum engine. | Term-by-term content depth, quizzes after lessons, source-aware examples, Course/Lesson schema and Mentor loops. |
| Academy practice labs | `/academy/trading-arena`, `/academy/practice`, `/academy/practice-lab`, `/academy/simulator`, `/academy/crash-simulator`, `/academy/risk-simulator`, `/academy/portfolio-lab`, `/academy/psychology-lab`, `/academy/analysis`, `/academy/decision`, `/academy/market-intelligence` | None complete yet | Convert learners into serious practice users. | UI authority, simulation disclaimers, Arena data-source clarity, journal/Mentor integration and EN parity plan. |
| Mentor and profile | `/academy/mentor-v2`, `/academy/mentor-coach`, `/academy/ai-guide`, `/academy/ai-guide/[slug]`, `/academy/profile`, `/academy/login`, `/academy/signup`, `/login`, `/signin`, `/signup` | `/en/academy/ai-guide`, `/en/signin`, `/en/signup` | Personalized guidance and account conversion. | Provider/privacy explanation, memory controls, account-boundary clarity and evidence-based Mentor summaries. |
| Student outcomes | `/academy/achievements`, `/academy/certificates`, `/academy/hall-of-fame`, `/student/[studentId]`, `/verify/[certificateId]`, `/academy/community`, `/academy/career`, `/academy/specialized-program` | None complete yet | Trust, credential proof and social learning proof. | Credential schema, privacy-safe public profiles, certificate verification copy and opt-in social layer UX. |
| Operations/admin | `/command-center` | None | Internal authority surface, not organic acquisition. | Keep out of public SEO except authenticated/internal policy. |

## Required Entity Connections

| Source Page | Must Link To | Reason |
| --- | --- | --- |
| Landing | Five news-led coins from high-priority impact history and five ranked trading tools | Turns the homepage into a crawlable education radar without overwhelming the core CTA or implying financial advice. |
| Coin hub | Top five news-impacted coins | Fresh search demand and return visits. |
| Coin detail | Related high-priority news history, lessons, tools, glossary | Turns coin curiosity into education and safe practice while showing why the asset was highlighted. |
| News detail | Related coins, tools, lessons, risk notes | Prevents news pages from becoming hype feeds. |
| Tool detail | Related high-priority news history, lessons, coin examples, official source | Makes tool discovery useful, safer and auditable when news changes ranking. |
| Lesson | Related glossary, coins, tools, news quiz | Makes Academy content citable and connected. |
| Arena | Data-source explanation, Mentor, journal, relevant lessons | Makes simulation trustworthy and educational. |
| Mentor | User-permitted evidence, memory controls, no-advice policy | Makes AI useful without pretending it is autonomous magic. |

## SEO/GEO/AEO Gates By Route Family

| Family | Required Metadata | Required Visible Blocks |
| --- | --- | --- |
| Landing and trust | Organization, Breadcrumb, FAQ where useful, canonical, hreflang, ItemList for news-led homepage coins and ranked tools | Brand promise, dual CTA, trust proof, 5 news-led coin/5-tool growth radar, account-boundary note where relevant. |
| Markets and prices | Breadcrumb, Article/FAQ where useful, canonical, `dateModified` | Price-source note, stale state, related Academy link. |
| Coins | Breadcrumb, FAQ, Article/DefinedTerm strategy, canonical, news-impact ItemList where available | Official links, risk context, priority news history with publish/record times, related lessons/tools. |
| News | Hub: CollectionPage, ItemList, FAQ, Breadcrumb, canonical, hreflang. Detail: NewsArticle, Breadcrumb, FAQ, canonical, hreflang, source/time, `datePublished`, `dateModified` | Server-rendered canonical impact history, summary, source attribution, no-advice note, related coins/tools/lessons, impact reason and priority evidence. |
| Tools | SoftwareApplication or Article where useful, Breadcrumb, canonical, news-impact ItemList where available | Featured/ranked status, official URL, app links, iframe/fallback state, safety note, news impact history. |
| Academy | Course/Lesson/Quiz/FAQ strategy, canonical/hreflang | Outcomes, prerequisites, quiz state, Mentor loop, related entities. |
| Glossary/Learn | DefinedTerm, FAQ, Article, Breadcrumb | Definition, short answer, example, related links. |
| Certificates | EducationalOccupationalCredential where applicable | Verification status, credential meaning, privacy boundary. |

## Automation Hooks

Every future implementation should preserve these hooks:

- `news.ingest` target cadence: ten minutes where infrastructure permits.
- `news.entity_link`: map items to symbols, tools, lessons and glossary entities.
- `news.automation_decision`: materialize publish/review/reject status, reject reasons, idempotency key, impact scores and visible history evidence before a news item can affect public rankings. Current API exposes this as an `ephemeral_contract`; production persistence authority is append-only and hash-verified in the 0058 migration, the scheduled worker has an execution entrypoint, systemd schedule, operational run evidence and cache-freshness last-run report, and public server/landing reads use the persisted authority with seed fallback.
- `content.optimize`: generate metadata, AEO answer, schema draft and internal relations.
- `content.quality_gate`: block thin content, copied text, hype and financial-advice framing.
- `ranking.materialize`: publish cached coin/tool/news rankings with `updatedAt`.
- `sitemap.refresh`: update public indexes only after quality gate passes.
- `news.detail_route`: every public high-priority impact item must have a canonical TecPey detail route before it is used as visible ranking evidence.
- `growth.measure`: record privacy-safe route impressions, clicks and conversion paths.

## Deferred But Not Forgotten

- Full English detail parity for coin pages.
- Trading Arena market data provider abstraction beyond BTC/ETH.
- Saved chart layouts/drawings policy.
- Tool iframe allowlist and blocked-frame telemetry.
- Mentor AI operational-memory retrieval for repeated incidents, content rejections and support/debug patterns.
- Account bridge from Academy account to the final TecPey exchange account.
- Page-by-page screenshots and browser accessibility evidence.
