# Bitycle Market Intelligence Integration V1

Status: implementation started on `codex/bitycle-market-intelligence-v1`

## Product boundary

Bitycle is a market-data, charting and intelligence provider for TecPey. It is not the authority for TecPey user balances, Trading Arena execution, attempts, journal evidence, mentor scoring, league points or rewards.

TecPey remains authoritative for:
- Arena account and virtual capital
- order intent and execution state
- risk rules and challenge state
- journal/reflection evidence
- mentor evaluation and learning progression
- user identity, tenancy and audit evidence

Bitycle may provide:
- real-time and historical market prices
- OHLCV / candles
- coin metadata and market-cap intelligence
- cross-exchange comparison
- Iranian/Toman market intelligence
- exchange metadata and liquidity/spread context
- charts/widgets where a native TecPey implementation has lower product value
- news as a governed upstream source, never as a bypass around TecPey news authority

## Provider strategy

### Public markets

`/api/markets?source=public` prefers Bitycle when `BITYCLE_API_KEY` is configured. CoinGecko remains a bounded fallback so a Bitycle outage or credential problem does not blank the public Markets experience.

Configuration:
- `BITYCLE_API_KEY`: server-only Bitycle Business credential
- `BITYCLE_MARKET_SOURCE`: optional upstream source, defaults to `binance_spot`

The API key must never be exposed to browser JavaScript or widget configuration.

### Realtime Arena feed

Use a dedicated server-side gateway for Bitycle WebSocket market data. Browser clients should subscribe to a TecPey-owned stream, not hold the Bitycle token.

Target flow:

`Bitycle WS -> TecPey Market Feed Gateway -> normalized market events -> Arena market view`

Arena execution consumes a validated snapshot/event contract. The chart and price feed never become execution authority.

Required controls:
- monotonic event timestamps
- source + symbol + timeframe provenance
- stale-feed detection
- reconnect/backoff
- duplicate/out-of-order event rejection
- bounded in-memory buffering
- server-side token secrecy
- provider health telemetry
- deterministic fallback/replay behavior

## Widget strategy

The `tecpey.ir` production domain has been reported as whitelisted by Bitycle. Widget use remains allowlisted by product surface.

Preferred widgets:
1. Full Chart: Trading Arena, with TecPey orders/positions overlaid through the supported custom data/user integration model.
2. Advanced Chart: coin detail / market intelligence.
3. Mini Chart: compact market cards where native sparklines are not preferable.
4. Technical Analysis: contextual analysis panel, clearly educational and non-advisory.
5. Fear & Greed: market-context module and mentor context.
6. Treemap: market heatmap.
7. Compare: asset comparison.
8. Trends: discovery surface.
9. Overview: market overview where it materially improves information density.
10. News: only if routed through TecPey source governance, taxonomy, dedupe and localization controls.

Do not iframe the entire Markets product. Native TecPey UI remains the default for tables, navigation, coin detail composition, news, search, educational context and accessibility-sensitive flows.

## Whitelist environments

Production: `tecpey.ir` is reported whitelisted.

Staging uses a separate domain and must not be assumed to inherit the production whitelist. Until Bitycle confirms staging-domain access, staging validation should use API-backed/native surfaces or an explicitly whitelisted staging hostname.

## Iran market intelligence

Bitycle supports Iranian exchange sources and Toman/IRT markets. TecPey should build a native intelligence layer on top of normalized data:
- global BTC/USDT reference
- Iranian BTC/IRT reference
- normalized Toman/USD or Toman/USDT comparison basis
- local premium/discount
- spread and liquidity context
- cross-exchange deviation
- freshness timestamp and source labels

Arbitrage-like differences are informational/educational context only; TecPey must not imply guaranteed executable profit.

## News integration

Bitycle News must enter the existing TecPey news ingestion path as another upstream source. It must pass the same:
- source registry
- taxonomy extraction
- publication-time validation
- deduplication
- localization/summarization
- impact classification
- materialization resilience
- academy quiz integrity

No direct widget/news embed should bypass those controls on canonical TecPey news pages.

## Mentor context contract

The AI Mentor should receive normalized facts, never opaque widget state. Candidate context:
- symbol/source
- current price
- 24h change/high/low/volume
- spread/liquidity where available
- market regime / sentiment modules
- selected timeframe TA summary
- relevant governed news
- user's Arena position/risk/challenge state

Mentor language must remain educational and explain evidence, uncertainty and risk rather than issuing personalized buy/sell instructions.

## Replay / historical data

Historical OHLCV is a candidate source for Arena replay and backtesting exercises. Before production use, verify:
- supported granularities
- maximum historical lookback
- missing-candle semantics
- timestamp timezone/epoch contract
- redistribution/cache rights
- rate limits
- deterministic snapshot/versioning requirements

Historical sessions used for scored challenges must be frozen/versioned by TecPey so a provider correction cannot silently change past challenge outcomes.

## Rollout gates

Phase 1 — provider foundation
- Bitycle public market normalizer
- preferred-provider/fallback behavior
- provenance and freshness
- tests

Phase 2 — realtime gateway
- server-side Bitycle WS adapter
- normalized candle/ticker events
- stale/reconnect/out-of-order controls
- Arena read-only chart integration

Phase 3 — native market intelligence
- Iranian/global comparison
- heatmap/trends/compare
- coin detail enrichment
- mentor market-context adapter

Phase 4 — Full Chart Arena integration
- chart shell
- TecPey-owned order/position overlays
- replay compatibility
- mobile/desktop QA

Phase 5 — governed news and education enrichment
- source adapter
- taxonomy/dedupe/localization
- mentor/news quiz integration

## Non-negotiable production checks

Before enabling Bitycle-dependent production paths, obtain/record:
- Business API entitlement
- REST rate limits
- WebSocket connection/subscription limits
- widget/domain whitelist scope
- staging whitelist policy
- caching and redistribution rights
- historical-data retention rights
- SLA/status escalation path
- token rotation/revocation process
- expected behavior during upstream partial outage
