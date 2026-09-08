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
- `BITYCLE_STREAM_TOKEN`: server-only Bitycle market WebSocket credential
- `BITYCLE_MARKET_SOURCE`: optional upstream source, defaults to `binance_spot`
- `BITYCLE_IRAN_SOURCES`: optional comma-separated local sources, max five

No Bitycle credential may be exposed through `NEXT_PUBLIC_*`, browser JavaScript, widget query parameters, logs, analytics or error responses.

### Realtime Arena feed

The TecPey custom Node runtime now has an optional server-to-server Bitycle market gateway. It connects to `wss://streamer.bitycle.com/ws/market_data` with `X-Bitycle-Token` and subscribes to BTCUSDT and ETHUSDT market-price messages from one configured source.

Target flow:

`Bitycle WS -> TecPey server-only gateway -> validated fresh snapshot -> Arena price authority`

Controls implemented in V1:
- only MP envelopes for BTCUSDT / ETHUSDT are accepted
- decimal prices must be positive and bounded
- source identifiers are validated
- both assets must come from the same source
- both assets must be fresh; stale/future-skewed snapshots are rejected
- the oldest accepted asset timestamp becomes snapshot time
- reconnect uses bounded exponential backoff
- token is held only server-side
- controlled runtime shutdown closes the upstream socket and reconnect timer
- the existing Arena HTTPS feed/cache remains fallback
- if no acceptable source exists, Arena keeps its existing fail-closed behavior

The chart, browser socket and Bitycle widget never become execution authority.

## Widget strategy

The `tecpey.ir` production domain is confirmed by the TecPey/Bitycle business relationship as whitelisted. `tecp.ir` should be requested separately for staging before widget evidence begins.

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
10. Ticker / Info: compact surfaces only where they avoid duplicate native TecPey UI.
11. News: only if routed through TecPey source governance, taxonomy, dedupe and localization controls.

Do not iframe the entire Markets product. Native TecPey UI remains the default for tables, navigation, coin detail composition, news, search, educational context and accessibility-sensitive flows.

Before widget staging evidence:
- `tecp.ir` whitelist confirmed
- CSP `frame-src` / `connect-src` implications reviewed
- FA RTL and EN LTR parity checked
- mobile/responsive behavior checked
- no credential or sensitive user data in public embed configuration
- graceful fallback exists when widget origin is unavailable

## Iran market intelligence

Bitycle supports Iranian exchange sources and IRT markets. TecPey exposes this governed comparison through the existing public Markets boundary at `/api/markets?source=iran`; no additional public route file is introduced for this capability.

The comparison avoids directly comparing a Toman number to a USDT number. For each local source:

`implied BTC/USDT = BTCIRT / USDTIRT`

`premium % = (local implied BTC/USDT / global BTCUSDT - 1) * 100`

Default local sources are `nobitex_spot`, `ramzinex_spot`, and `bit24_spot`. Configuration can override these with up to five validated source identifiers.

The response returns:
- global BTCUSDT reference and source
- local BTCIRT
- local USDTIRT
- implied local BTCUSDT
- premium/discount percent
- available/requested source counts
- explicit provenance

Because the price endpoint does not expose an exchange timestamp in the documented response, `observedAt` is explicitly labelled as TecPey fetch time rather than falsely claiming upstream event time.

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
- realtime MP parser/cache
- runtime lifecycle
- tests and audit-domain classification

Phase 2 — native Iran intelligence
- global/local comparison through `/api/markets?source=iran`
- source-labelled UI and degradation states
- premium/discount context
- no profit-guarantee language

Phase 3 — FullChart Arena integration
- `tecp.ir` whitelist
- widget/CSP contract
- TecPey-owned order/position overlays
- replay compatibility
- mobile/desktop QA

Phase 4 — broader market surfaces
- heatmap/trends/compare
- coin detail enrichment
- TA and sentiment context
- mentor market-context adapter

Phase 5 — governed news and replay
- source adapter
- taxonomy/dedupe/localization
- mentor/news quiz integration
- deterministic historical scenario evidence

## Non-negotiable production checks

Before enabling Bitycle-dependent production paths, obtain/record:
- Business API entitlement
- REST rate limits
- WebSocket connection/subscription limits
- widget/domain whitelist scope (`tecpey.ir`, `tecp.ir`)
- caching and redistribution rights
- historical-data retention rights
- SLA/status escalation path
- token rotation/revocation process
- expected behavior during upstream partial outage

No merge or deployment is authorized by this document. Keep the PR Draft until exact-head CI, security/audit evidence and provider-contract review are complete.
