# TecPey Tool Growth Automation

TecPey can automatically publish educational pages for external crypto tools, but it must not automatically enable wallet connections, API-key ingestion, embedded trading, copy trading, signals, or order execution.

## Current Flow

1. Curated tool candidates live in `src/data/toolGrowthCandidates.ts`.
2. `npm run tools:growth:materialize` scores candidates and writes `src/data/generated/toolGrowthSnapshot.json`.
3. `src/lib/trading-tools-growth.ts` combines manually curated tools from `src/data/traderTools.json` with the published snapshot.
4. `/trading-tools`, `/en/trading-tools`, detail routes, landing growth radar, schemas, and sitemap entries read from `getRankedTraderTools()` and `getTraderToolSlugs()`.
5. `npm run tools:growth:check` blocks duplicate, incomplete, unsafe, or externally enabled automated output.

Optional deployment templates:

- `deploy/systemd/tecpey-tool-growth-materialization.service.in`
- `deploy/systemd/tecpey-tool-growth-materialization.timer`

## Policy Gates

- Automated status allowed: `published_content`.
- Publish capability allowed: `educational_directory` only.
- External capability allowed: `manual_review_required` only.
- Required: HTTPS official site, unique slug, unique domain, non-empty summaries, pros, limitations and tutorial steps.
- Forbidden for automatic publication: tools whose primary automation mode is `trade_execution`.
- Wallet connection, API-key and account-based tools can be listed only as educational pages with risk language and manual review gates.

## Content Rules

- Tool pages must say clearly that TecPey is not giving financial advice, trading signals, endorsement, or a permission to connect accounts.
- Every tool must include limitations and safe-use steps, not only marketing benefits.
- Favicon URLs are used only as lightweight external visual hints. Do not scrape marketplace images or unofficial logos into production.
- If TecPey later hosts official tool logos, add source evidence and keep a central manifest similar to coin visual assets.

## Next Live Source Integration

The next provider layer can read from approved sources such as search trends, internal tool-search telemetry, market-news relations, and editorial risk weights. Provider output must be stored as audit evidence, then passed through `materializeToolGrowthSnapshot`.

Automatic content publication is allowed after the gate. Product integration, API ingestion, wallet connection, iframe embedding, signal generation, or trading execution stays manual.
