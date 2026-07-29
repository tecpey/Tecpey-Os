# TecPey SEO/GEO Growth Engine QA

## Scope
This patch converts TecPey from a mostly branded landing/academy product into an organic-growth architecture with indexable search-intent pages, structured data, sitemap coverage and stronger internal linking.

## Added
- `/learn` hub for high-intent educational SEO.
- `/learn/[slug]` pages for:
  - آموزش ارز دیجیتال از صفر
  - آموزش بیت‌کوین
  - آموزش تتر
  - شبیه‌ساز ترید
  - مدرک قابل استعلام
- `/price` programmatic price hub.
- `/price/[slug]` pages for top coin pages, connected to existing coin data and live market routes.
- `src/app/sitemap.ts` with academy, learn, price, coins, crypto and core brand pages.
- `src/app/robots.ts` with sitemap and API/private disallow rules.
- FAQPage, Article, Course and Dataset schema coverage for new pages.
- Footer internal links to price and learn hubs.
- Course schema enrichment on dynamic academy article pages.

## RedTeam Checks
- No developer-facing labels in new user-facing SEO/GEO pages.
- No MVP/prototype/demo/coming-soon copy in new SEO/GEO surfaces.
- Internal links from the new pages were scanned: 0 missing route targets.
- New routes use canonical metadata.
- New pages connect informational intent to academy, market board and student journey instead of isolated blog content.

## Strategic Outcome
TecPey now targets not only exchange keywords, but safer, lower-friction organic entry keywords:
- آموزش ارز دیجیتال
- آموزش بیت کوین
- آموزش تتر
- شبیه ساز ترید
- مدرک ارز دیجیتال قابل استعلام
- قیمت بیت کوین / تتر / اتریوم and other top assets

## Build Note
A full `npm run build` requires installing project dependencies. In this environment `node_modules` is absent, so TypeScript cannot resolve React/Next packages. The patch itself introduces no new dependencies.

Recommended production validation:

```bash
npm ci
npm run check
npm run build
```
