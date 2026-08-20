# TecPey Coin Growth Automation

TecPey can publish educational coin pages automatically, but it must not automatically enable trading, deposits, withdrawals, market making, or custody for a newly detected asset.

## Current Flow

1. Curated candidates live in `src/data/coinGrowthCandidates.ts`.
2. `npm run coins:growth:materialize` scores candidates and writes `src/data/generated/coinGrowthSnapshot.json`.
3. `src/data/coins.ts` combines `coreCoinPages` with the published snapshot.
4. Coin listing pages, detail pages, English pages, sitemap entries, market links, and visual assets read from the same `coinPages` source.
5. `npm run coins:growth:check` blocks duplicate, incomplete, exchange-enabled, or SEO/GEO/AEO-incomplete automated output.

Optional deployment templates:

- `deploy/systemd/tecpey-coin-growth-materialization.service.in`
- `deploy/systemd/tecpey-coin-growth-materialization.timer`

## Policy Gates

- Automated status allowed: `published_content`.
- Exchange capability allowed: `manual_review_required` only.
- Required: HTTPS official website, non-empty identity, use cases, risks, FAQs, unique slug, unique symbol.
- Required organic-growth package: canonical URL, Open Graph/Twitter contract, schema types, keywords, entity tags, internal links, AEO answer, LLM summary and no-advice/no-signal safety disclaimer.
- Rejected candidates remain in the snapshot with reason and score.

## Asset Rules

- Prefer `iconscout-3d` when the coin exists in the approved pack.
- Otherwise use approved open assets: `cryptocurrency-icons` (`CC0-1.0`) or `@iconify-json/token-branded` (`MIT`).
- If a project has no verified pack/open icon, add an official brand-kit asset under `public/images/tecpey/coin-packs/official` after source review.
- Until then, keep the TecPey vector fallback. Do not scrape random marketplace images into production.

## Next Live Source Integration

The next step is to add a provider snapshot layer that reads market/trending signals from approved sources such as CoinGecko, CoinMarketCap, internal market-board liquidity, and TecPey editorial/risk weights. That provider should produce candidates, then reuse the same `materializeCoinGrowthSnapshot` gate.

Live provider data must be stored as audit evidence before publication. Content publication can be automatic after passing the gate; exchange activation stays manual.
