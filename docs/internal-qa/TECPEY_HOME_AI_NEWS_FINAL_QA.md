# TecPey Home AI + Dynamic Crypto News Final QA

## Scope
- Persian Home upgraded with AI Mentor positioning, learning method, and dynamic crypto news section.
- English Home upgraded with matching AI Mentor positioning, learning method, and dynamic crypto news section.
- Added dynamic crypto news API: `/api/crypto-news`.
- Added full news routes: `/crypto-news` and `/en/crypto-news`.
- Added safe fallback news mode so the site remains functional if external RSS feeds are unavailable.
- Added news links to sitemap.

## New Home Experience
- AI Mentor spotlight: positioned as TecPey's signature advantage.
- CTA paths: Ask AI Mentor, Open Academy, News Center.
- Learning method section: Learn → Practice → Ask → Simulate → Graduate → Trade Safely.
- Crypto News Center: live/fallback feed, source, timestamp, sentiment, impact meter, educational summary.
- News → Academy → AI Mentor bridge: every news card reinforces risk-aware learning instead of hype.

## Dynamic News Sources
Runtime RSS aggregator attempts trusted crypto sources:
- CoinDesk
- Cointelegraph
- Decrypt
- The Block
- ArzDigital

If feeds fail, TecPey-safe fallback content is served.

## Technical QA
- TypeScript: PASS (`npx tsc --noEmit`)
- Route QA: PASS (`node scripts/qa-route-check.mjs`) — 118 pages indexed
- Static QA: PASS (`node scripts/qa-production-static.mjs`) — 118 routes, 205 sitemap URLs, 0 issues
- Broken links: 0 by static QA
- Missing assets: 0 by static QA
- API keys: no API key stored in ZIP

## Build Note
A full `npm run build` attempt in this sandbox reached optimized production build stage but timed out due environment runtime limits. TypeScript, route QA, and static production QA all passed. Please run final build on Mac/server:

```bash
npm install
npm run build
npm start
```

## Important Test Routes
```bash
curl -I http://localhost:3000/
curl -I http://localhost:3000/en
curl -I http://localhost:3000/crypto-news
curl -I http://localhost:3000/en/crypto-news
curl -I http://localhost:3000/api/crypto-news?locale=fa
curl -I http://localhost:3000/api/crypto-news?locale=en
```

Expected page routes: `200 OK`.
Expected API routes: JSON response with `items` array and `mode` as `live` or `fallback`.

## QA Verdict
This patch turns the Home pages from a standard exchange landing into a stronger AI-powered crypto learning, news, and trading ecosystem entry point. The new news center should improve daily return value, SEO freshness, and Academy/Mentor discovery without weakening the existing landing structure.
