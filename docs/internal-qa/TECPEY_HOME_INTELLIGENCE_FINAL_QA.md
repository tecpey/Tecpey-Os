# TecPey Home Intelligence Final QA

## Scope
This patch upgrades the Persian and English home experience around three final improvements:

1. AI Mentor Memory spotlight
2. Crypto News Pro
3. Live Market Intelligence

## Implemented

### AI Mentor Memory
- Added a dedicated Mentor learning-memory panel on the home page.
- Shows progress, focus area and next recommended step.
- Copy is user-facing in both Persian and English.
- Clarifies that account connection can power persistent mentor memory without exposing private API keys.

### Crypto News Pro
- Added Breaking, Trending and Editor Picks sections on the full news page.
- Added Breaking badge on news cards.
- Added related lesson labels for each news item.
- Added trend score, editor-pick and market-impact metadata to the API response.
- Persian feed now uses Persian-first source filtering and rejects non-Persian titles.
- English feed uses global English sources.
- Fallback mode is fully localized.

### Live Market Intelligence
- Added a live market intelligence panel inside the news center.
- Shows BTC/ETH 24h movement when live market data is available.
- Adds a short risk-first brief and learning recommendation.
- Works in both FA and EN.

## Language / Copy QA
- Removed developer-facing/meta text from Learning Journey.
- Replaced Persian English-learning chain with fully Persian copy:
  یاد بگیر → تمرین کن → از مربی بپرس → شبیه‌سازی کن → فارغ‌التحصیل شو → امن معامله کن
- Rewrote AI Mentor description to speak directly to the user.
- Removed phrases like “صفحه اصلی جدید باید...” and “باعث بازگشت کاربر می‌شود”.

## Static Checks
- Added routes remain unchanged:
  - /
  - /en
  - /crypto-news
  - /en/crypto-news
  - /api/crypto-news
- API key is not stored in source.
- News API has fallback mode if external RSS sources fail.
- Persian page prevents raw English news titles from appearing in FA live mode.

## Terminal Test Required on Mac
Run:

```bash
npm install
npm run build
npm start
```

Then check:

```bash
curl -I http://localhost:3000/crypto-news
curl -I http://localhost:3000/en/crypto-news
curl "http://localhost:3000/api/crypto-news?locale=fa&limit=4"
curl "http://localhost:3000/api/crypto-news?locale=en&limit=4"
```

Expected:
- 200 OK for both pages
- JSON response for both API calls
- Persian response should contain Persian titles in FA live/fallback mode
- English response should contain English titles in EN live/fallback mode

## Note
Full `npm run build` was not executed in this environment because dependencies were not available after ZIP extraction. The patch is source-level and includes a terminal checklist for Mac verification.
