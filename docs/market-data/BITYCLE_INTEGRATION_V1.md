# Bitycle Market Intelligence Integration V1

Status: Draft implementation on `codex/bitycle-market-intelligence-v1`; no merge or deployment authorized by this document.

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
- Iranian/IRT market intelligence
- exchange metadata and liquidity/spread context
- charts/widgets where a native TecPey implementation has lower product value
- news as a governed upstream source, never as a bypass around TecPey news authority

## Provider strategy

### Public Markets

`/api/markets?source=public` prefers Bitycle when `BITYCLE_API_KEY` is configured. CoinGecko remains a bounded fallback so a Bitycle outage, stale response or credential problem does not blank the public Markets experience.

Configuration:
- `BITYCLE_API_KEY`: server-only Bitycle Business REST credential
- `BITYCLE_STREAM_TOKEN`: server-only Bitycle market WebSocket credential
- `BITYCLE_MARKET_SOURCE`: optional upstream source, defaults to `binance_spot`
- `BITYCLE_IRAN_SOURCES`: optional comma-separated local sources, max five
- `BITYCLE_WIDGETS_ENABLED`: server-only exact boolean string; widgets remain CSP-denied unless exactly `true` and the request hostname is a governed TecPey hostname

No Bitycle credential may be exposed through `NEXT_PUBLIC_*`, browser JavaScript, widget query parameters, logs, analytics, public provenance or error responses.

### Public market freshness authority

Bitycle `source_currency_info` is treated as metadata/enrichment, not sufficient price freshness authority by itself. Public Bitycle rows are promoted only when a matching `source_markets_frame?frame=24h` row exists with:
- the exact requested source
- matching market symbol
- positive price
- valid provider `updated_at`
- age no greater than two minutes
- future clock skew no greater than 30 seconds

The market-frame price/open/high/low and provider timestamp override enrichment values. If no fresh frame exists, that row is not returned as authoritative Bitycle market data.

CoinGecko fallback rows similarly require:
- positive price
- valid `last_updated`
- age no greater than five minutes
- future clock skew no greater than 30 seconds

This prevents a freshly fetched HTTP response from being mislabeled as fresh market data when its underlying provider timestamp is stale or impossible.

### Bounded upstream bodies

All external market JSON handled by `/api/markets` uses a bounded streaming reader. It rejects oversized declared `Content-Length`, oversized actual streamed/decompressed bodies, malformed JSON and empty bodies.

Current limits:
- Bitycle coin-info / market-frame responses: 8 MiB
- CoinGecko market responses: 2 MiB
- CoinGecko search responses: 512 KiB

Provider response size is therefore bounded even when the upstream uses chunked transfer or reports a misleading content length.

### CoinGecko fallback search

Fallback search is provider-authoritative rather than page-local. For non-empty search queries TecPey:
1. calls CoinGecko `/search` to obtain bounded, validated coin IDs;
2. keeps at most the product-supported 10 pages × 100 rows = 1,000 IDs;
3. selects only the IDs required for the requested page;
4. calls `/coins/markets` only for those IDs;
5. preserves search relevance ordering and deterministic page metadata.

Search IDs are cached for 60 seconds with a bounded 64-entry in-memory cache and single-flight request coalescing. A valid empty provider search returns an empty successful result; TecPey does not fabricate rows.

## Realtime Arena feed

The TecPey custom Node runtime has an optional server-to-server Bitycle market gateway. It connects to `wss://streamer.bitycle.com/ws/market_data` with `X-Bitycle-Token` and subscribes to BTCUSDT and ETHUSDT `subscribe_live_market` streams at the exact `1m` timeframe from one configured source.

Target flow:

`Bitycle WS -> TecPey server-only gateway -> validated provider-timestamp snapshot -> Arena price authority`

Controls implemented in V1:
- only supported BTCUSDT / ETHUSDT markets are accepted
- authoritative Arena points require `type: "md"` and exact `t: "1m"`
- close price is read from candle index 4
- provider `issued_at` is read from candle index 6 and becomes the authoritative timestamp
- MP envelopes may be parsed as receipt-time observations but can never become an Arena execution snapshot because they lack provider timestamp authority
- decimal prices must be positive and bounded
- source identifiers are validated
- both assets must come from the same source
- both provider timestamps must be fresh; stale/future-skewed snapshots are rejected
- out-of-order provider events cannot roll execution prices backward
- the oldest accepted asset timestamp becomes snapshot time
- WebSocket payloads are capped at 64 KiB and per-message compression is disabled
- an inactivity watchdog terminates a connected-but-silent socket
- reconnect uses bounded exponential backoff from 1s to 30s with jitter
- token is held only server-side
- controlled runtime shutdown closes socket/reconnect/watchdog resources
- the existing Arena HTTPS feed/cache remains fallback
- if no acceptable source exists, Arena keeps its existing fail-closed behavior

The chart, browser socket and Bitycle widget never become execution authority.

### Operational health

`/api/health` exposes secret-free Bitycle operational state:
- `disabled`: `BITYCLE_STREAM_TOKEN` is not configured; this optional provider does not degrade overall health
- `healthy`: transport is connected and a fresh authoritative BTC+ETH provider-timestamp snapshot is currently available
- `degraded`: the provider is configured but that condition is not met

A degraded optional Bitycle feed adds a health warning and makes the overall non-critical health state `degraded`, but does not make TecPey return 503. Arena retains its existing fallback/fail-closed authority.

The health payload contains only status, configured/connected booleans, source identifier, timestamps, snapshot readiness and reconnect/disconnect counters. It never returns API keys or stream tokens.

## Provider provenance and locale parity

Market provider provenance is preserved across API -> `getCurrencies` -> UI rather than inferred from row contents. The shared FA/EN provenance surface shows:
- provider name
- validated upstream source when present
- quote currency
- upstream/fetched timestamp
- an explicit fallback-active badge when applicable

External provider links are selected from an internal allowlist for Bitycle and CoinGecko; a provider-supplied arbitrary URL is never rendered as a trusted link.

Both `/markets` and `/en/markets` mount the same Iran intelligence and provider-provenance components. Automated parity guards prevent one locale from silently losing these surfaces or English from regaining Persian copy.

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

### Widget CSP activation contract

Widget permission is fail-closed. The normal application policy remains `frame-src 'self'`.

`https://widget.bitycle.com` is added to `frame-src` only when both conditions are true:
1. `BITYCLE_WIDGETS_ENABLED=true` exactly; ambiguous values such as `1`, `yes`, `TRUE` or whitespace variants are rejected.
2. The request hostname is exactly one of `tecpey.ir`, `www.tecpey.ir`, `tecp.ir`, or `www.tecp.ir`.

A suffix lookalike such as `tecpey.ir.example.com`, localhost, or any unrelated host never receives the Bitycle frame permission. This flag grants only the exact widget frame origin; it does not expose REST/WebSocket credentials and does not widen `script-src` or `connect-src`.

Before widget staging evidence:
- `tecp.ir` whitelist confirmed by Bitycle
- exact widget embed/config contract received from Bitycle; do not invent undocumented query parameters
- `BITYCLE_WIDGETS_ENABLED=true` set only on the intended staging runtime
- resulting CSP verified to contain only `frame-src 'self' https://widget.bitycle.com`
- FA RTL and EN LTR parity checked
- mobile/responsive behavior checked
- no credential or sensitive user data in public embed configuration
- graceful fallback exists when widget origin is unavailable

## Iran market intelligence

Bitycle supports Iranian exchange sources and IRT markets. TecPey exposes this governed comparison through the existing public Markets boundary at `/api/markets?source=iran`; no additional public route file is introduced.

For each local source:

`implied BTC/USDT = BTCIRT / USDTIRT`

`premium % = (local implied BTC/USDT / global BTCUSDT - 1) * 100`

Default local sources are `nobitex_spot`, `ramzinex_spot`, and `bit24_spot`. Configuration can override these with up to five validated source identifiers.

The comparison uses only `source_markets_frame.updated_at` provider timestamps. A local comparison is accepted only when:
- global BTCUSDT is fresh
- local BTCIRT is fresh
- local USDTIRT is fresh
- each local frame belongs to the exact requested source
- the maximum timestamp skew across the three prices is at most 60 seconds

Invalid/stale individual local sources are omitted while valid sources remain available. Missing/invalid global reference or zero valid local sources returns 503 for the Iran panel.

The response returns:
- global BTCUSDT reference, source and provider timestamp
- local BTCIRT / USDTIRT
- implied local BTCUSDT
- premium/discount percent
- per-source oldest comparison timestamp and maximum skew
- available/requested source counts and maximum accepted skew
- explicit timestamp authority and provenance

The native FA/EN Markets UI shows source-labelled local cards, global reference price, source availability, provider timestamp/skew and an explicit educational/non-guarantee disclosure. A provider failure degrades only this panel; it does not blank the main Markets table.

Arbitrage-like differences are informational/educational context only. Fees, order-book depth, transfer constraints and slippage are not included, and TecPey must not imply guaranteed executable profit.

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

## Automated evidence in V1

The PR includes tests for:
- Bitycle coin-info normalization
- fresh/stale/future market-frame authority
- exact requested-source binding
- CoinGecko zero/stale/future rejection
- bounded provider response bodies
- Bitycle MD provider timestamp/timeframe parsing
- MP non-authority
- mixed source, stale snapshot and out-of-order rejection
- operational health policy
- Iran route calculation, partial degradation and source mismatch
- CoinGecko fallback search/pagination
- FA/EN market intelligence and provenance parity
- exact-host/exact-origin widget CSP gating

## Rollout gates

Phase 1 — provider foundation
- public provider normalization and authoritative timestamp validation
- preferred-provider/fallback behavior
- bounded provider bodies
- provider provenance
- realtime provider-timestamp gateway and runtime lifecycle
- operational health visibility
- tests/audit evidence

Phase 2 — native Iran intelligence
- global/local comparison through `/api/markets?source=iran`
- source-labelled FA/EN native UI and degradation states
- provider timestamp/skew disclosure
- premium/discount context
- no profit-guarantee language

Phase 3 — FullChart Arena integration
- `tecp.ir` whitelist
- hostname-bound, exact-origin widget CSP gate
- exact Bitycle FullChart embed/config contract
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
- exact FullChart embed/configuration contract
- caching and redistribution rights
- historical-data retention rights
- SLA/status escalation path
- token rotation/revocation process
- expected behavior during upstream partial outage

Staging must separately prove the real Bitycle REST endpoints, supported Iranian market symbols and WebSocket subscription using staging-held credentials. Unit/CI evidence proves TecPey behavior against the documented provider contract; it is not a substitute for real provider entitlement/connectivity evidence.

No merge or deployment is authorized by this document. Keep the PR Draft until exact-head CI, security/audit evidence and provider-contract review are complete.
