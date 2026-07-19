# Trading Arena Authoritative Execution V2

**Status:** Backend merge candidate; client cutover remains a separate gated change  
**Endpoint:** `/api/trading-arena/execution`  
**Authority:** PostgreSQL active-attempt aggregate  
**Related:** #26

## Purpose

This contract replaces browser-owned Arena execution with a server-authoritative educational trading simulation. The browser may render snapshots and submit commands; it never owns balances, fills, prices, positions, PnL, attempt state or Mentor events.

## Account boundary

- Initial capital: `$100,000` virtual.
- Attempts: exactly three per cycle.
- Execution is scoped to the authenticated student's active attempt.
- Attempt pass/fail/advance policy is intentionally outside this API until the governed product risk rules are implemented.
- No command may create a new attempt or reset an attempt.

## Durable aggregate

Each active attempt stores:

- schema version;
- cash and reserved balances;
- equity and holdings;
- open positions;
- pending limit orders;
- closed trades and realized PnL;
- total fees;
- last authoritative market snapshot;
- monotonic execution revision.

Financial values are decimal strings. JavaScript floating-point numbers are not accepted as command values and are not the storage authority.

## Commands

### `market_buy`

Required:

- `asset`: `BTC` or `ETH`;
- `quoteAmount`: positive decimal string.

Optional:

- `stopLoss`;
- `takeProfit`;
- `preTradePlan`;
- `emotionalState`.

The server supplies the market price and deterministic slippage.

### `limit_buy`

Required:

- `asset`;
- `quoteAmount`;
- `limitPrice`.

The quote amount moves from cash to reserved balance. The order fills only when an authoritative server market snapshot reaches the declared limit. Educational fills use the declared limit price to keep risk plans deterministic.

### `cancel_order`

Releases the exact reserved quote amount back to cash.

### `close_position`

The client identifies the owned position. The server supplies the exit price and fee.

### `refresh_market`

Applies a fresh server price snapshot, fills eligible limit orders, and executes stop-loss/take-profit rules. It is a persisted command because it can change financial state.

## Request envelope

Every mutation requires:

- authenticated Academy student profile;
- strict session-revocation check;
- valid same-origin CSRF boundary;
- `Idempotency-Key` header or equivalent body field;
- `expectedRevision`;
- one valid command.

## Idempotency

`(attempt_id, idempotency_key)` is unique.

- Same key and same canonical request hash: return the original stored response.
- Same key and different request hash: reject with `409 idempotency_key_reused`.
- A replay does not create another state revision, trade decision, learning event or Mentor update.

## Concurrency

- Transaction-scoped PostgreSQL advisory lock serializes one student's execution commands.
- The attempt row is read with `FOR UPDATE`.
- `expectedRevision` must match the stored revision.
- The final update also checks the prior revision.
- A stale client receives `409 revision_conflict` plus the current snapshot.

## Price authority

Production is fail-closed unless a permitted HTTPS feed is configured or the public Binance fallback is explicitly enabled.

The feed layer:

- rejects HTTP and obvious localhost/private IPv4 hosts;
- uses an outbound timeout;
- rejects redirects;
- accepts only BTC/USDT and ETH/USDT positive decimal prices;
- rejects snapshots older than 15 seconds;
- rejects timestamps more than 5 seconds in the future;
- maintains only a two-second disposable server cache.

The client cannot submit market prices, fill prices or exit prices.

## Risk and execution rules

Current backend protections:

- minimum quote amount: `10`;
- maximum single-command allocation: `20%` of current equity;
- warning Mentor flag above `5%`;
- maximum five open positions;
- maximum twenty pending orders;
- fixed configurable slippage in basis points, capped at 1%;
- fixed 0.1% opening and closing fee model;
- stop-loss below the entry/limit reference;
- take-profit above the entry/limit reference.

These are educational simulation controls, not investment advice or profit guarantees.

## Event and Mentor boundary

A successful non-replayed mutation writes in one PostgreSQL transaction:

1. the new attempt aggregate and revision;
2. the Arena execution event for that revision;
3. the command/idempotency result;
4. the normalized Arena trade-decision signal when applicable;
5. the Learning OS simulator decision event;
6. account cash projection.

After commit, meaningful non-market-refresh commands schedule a Mentor profile update.

## Failure behavior

- PostgreSQL unavailable: `503` and no client-side success.
- Price feed unavailable: financial commands fail closed; reads may return the persisted snapshot with `marketStatus=unavailable`.
- Stale revision: `409` with current state.
- Invalid or reused idempotency key: reject.
- Invalid aggregate/version: reject rather than silently accepting legacy browser state.
- Transaction failure: no partial state/event/command write.

## Deliberate non-goals of this slice

- UI migration from `src/lib/trading-arena.ts`;
- historical replay clock and replay datasets;
- subscriptions/billing and extension purchase;
- governed attempt pass/fail thresholds;
- market-maker simulation beyond the controlled price authority;
- Arena leagues, tournaments, rewards and prop allocation;
- deletion of the legacy browser engine before the UI cutover is verified.

## Client cutover gate

The UI migration is a separate protected PR. It must:

- hydrate only from `GET /api/trading-arena/execution`;
- submit commands with a fresh idempotency key and current revision;
- handle revision conflicts by replacing local display state with the server snapshot;
- show price-feed unavailable, pending, rejected and degraded states;
- never calculate authoritative fills, fees, balances, PnL or attempt outcomes;
- remove Trading Arena and Trading Journal browser-persistence baselines only after successful cross-device verification;
- retain the legacy engine only until the new path passes integration and rollback testing, then delete it in a dedicated cleanup PR.

## Evidence gate

This backend may merge only when:

- TypeScript and ESLint pass;
- persistence and Admin auth guards pass unchanged;
- all existing and Arena-specific tests pass;
- production build passes;
- no temporary workflow or diagnostic file differs from `main`;
- the branch is current with protected `main`;
- financial conservation and transaction boundaries receive manual review.
