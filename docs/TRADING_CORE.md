# TecPey Trading Core

Phase 28 — Trading Core Foundation (Enterprise Exchange Engine)

---

## Overview

The Trading Core is the domain model that every future exchange feature — Spot,
Margin, Futures, Proof-of-Trade — builds on. Phase 28 ships the foundation:
types, services, order book abstraction, matching engine interface, wallet
ledger, and REST API. No live matching is wired yet; that arrives in a future
phase once the execution pipeline is defined.

---

## Architecture

```
src/lib/trading/
├── types.ts           — Asset, Market, Order, Trade, WalletLedgerEntry, etc.
├── events.ts          — TradingEvent<T> envelope + factory
├── order-book.ts      — In-memory OrderBook class + global registry
├── matching-engine.ts — MatchingEngineInterface (interface only)
├── validation.ts      — Order, market, and asset validation
├── market-service.ts  — DB query layer: listAssets, getAsset, listMarkets, getMarket
├── order-service.ts   — DB query layer: createOrder, cancelOrder, listOrders
├── trade-service.ts   — DB query layer: listTrades, listUserTrades
└── ledger-service.ts  — postLedgerEntry, queryLedger

src/app/api/
├── markets/route.ts          GET /api/markets[?symbol=X]
├── assets/route.ts           GET /api/assets[?symbol=X]
├── orderbook/route.ts        GET /api/orderbook?symbol=X[&depth=N]
├── trades/route.ts           GET /api/trades?market=X  or  ?mine=1
├── orders/route.ts           GET /api/orders  |  POST /api/orders
└── orders/[id]/route.ts      DELETE /api/orders/:id
```

---

## Models

### Asset

| Field | Type | Description |
|---|---|---|
| `id` | string | Stable identifier (e.g. `btc`) |
| `symbol` | string | Trading symbol (e.g. `BTC`) |
| `name` | string | Display name |
| `precision` | number | Decimal places |
| `status` | `active\|maintenance\|suspended\|delisted` | Tradability |
| `depositEnabled` | boolean | |
| `withdrawEnabled` | boolean | |
| `minDeposit` | string (decimal) | Minimum deposit amount |
| `minWithdraw` | string (decimal) | Minimum withdrawal amount |
| `withdrawFee` | string (decimal) | Per-withdrawal fee |
| `displayOrder` | number | UI sort order |
| `metadata` | object | Arbitrary extension fields |

### Market

| Field | Type | Description |
|---|---|---|
| `symbol` | string | Trading pair symbol (e.g. `BTCUSDT`) |
| `baseAsset` | string | Base asset symbol |
| `quoteAsset` | string | Quote asset symbol |
| `status` | `active\|maintenance\|closed\|suspended` | |
| `tickSize` | string | Minimum price increment |
| `stepSize` | string | Minimum quantity increment |
| `minOrderValue` | string | Minimum order value in quote asset |
| `maxOrderValue` | string | Maximum order value (`0` = unlimited) |
| `pricePrecision` | number | Decimal places for price |
| `quantityPrecision` | number | Decimal places for quantity |
| `makerFee` | string | Maker fee rate (e.g. `0.001` = 0.1%) |
| `takerFee` | string | Taker fee rate |

### Order

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Server-assigned order ID |
| `userId` | string | Owner's user ID |
| `market` | string | Market symbol |
| `side` | `buy\|sell` | |
| `type` | `limit\|market\|ioc\|fok\|gtc\|stop_limit` | |
| `status` | `NEW\|PARTIALLY_FILLED\|FILLED\|CANCELLED\|EXPIRED\|REJECTED` | |
| `price` | string\|null | Limit price (null for market orders) |
| `stopPrice` | string\|null | Stop trigger price |
| `quantity` | string | Requested quantity |
| `filledQuantity` | string | Quantity already filled |
| `remainingQuantity` | string | Quantity still open |
| `avgFillPrice` | string\|null | Volume-weighted average fill price |
| `clientOrderId` | string\|null | Client-provided dedup key (max 64 chars) |
| `timeInForce` | `GTC\|IOC\|FOK` | |
| `expiresAt` | ISO 8601\|null | For timed orders |
| `createdAt` | ISO 8601 | |
| `updatedAt` | ISO 8601 | |

### Order Lifecycle

```
          ┌──────────────────────────────────────────┐
          │              POST /api/orders             │
          └──────────────────┬───────────────────────┘
                             │
                    validation passes?
                      /           \
                   YES             NO
                    │               │
               status=NEW      status=REJECTED
                    │
          matching engine (future phase)
         /          |           \
   PARTIALLY     FILLED      CANCELLED
    _FILLED                  / EXPIRED
```

### Trade

| Field | Type | Description |
|---|---|---|
| `id` | UUID | |
| `market` | string | |
| `buyerOrderId` | UUID | |
| `sellerOrderId` | UUID | |
| `price` | string | Execution price |
| `quantity` | string | Filled quantity |
| `feeBuyer` | string | Fee charged to buyer |
| `feeSeller` | string | Fee charged to seller |
| `makerSide` | `buy\|sell` | Which side was passive (maker) |
| `executedAt` | ISO 8601 | |

---

## Wallet Ledger Philosophy

**Balances are never modified directly.**

Every financial operation — deposit, withdrawal, trade, fee, adjustment, hold,
release — produces an immutable ledger row. The wallet balance at any point in
time is derived by summing all ledger entries for a wallet+asset pair.

### Ledger Entry Types

| Type | Direction | Trigger |
|---|---|---|
| `deposit` | + | External deposit confirmed |
| `withdraw` | - | Withdrawal executed |
| `trade_debit` | - | Outgoing leg of a trade |
| `trade_credit` | + | Incoming leg of a trade |
| `fee` | - | Fee charged for an order |
| `adjustment` | ± | Manual admin correction |
| `hold` | reserve | Funds locked for an open order |
| `release` | unreserve | Held funds returned on cancel/expiry |

Holds and releases are paired: every `hold` on order creation is matched by a
`release` when the order closes (filled, cancelled, or expired). Fee entries
accompany every `trade_debit`/`trade_credit` pair.

---

## Order Book

The `OrderBook` class in `src/lib/trading/order-book.ts` is an in-memory
price-level aggregator. One instance per market is held in `globalThis` to
survive Next.js hot-reload.

### Methods

| Method | Description |
|---|---|
| `insert(side, price, qty)` | Add quantity at a price level |
| `cancel(side, price, qty)` | Remove quantity; returns false if level not found |
| `bestBid()` | Highest buy price level |
| `bestAsk()` | Lowest sell price level |
| `priceLevels(side, depth?)` | All levels for a side, sorted |
| `snapshot(depth?)` | Full depth snapshot for the API |
| `clear()` | Reset book (reconnect, test teardown) |

**Production note:** Replace `globalThis.tecpeyOrderBooks` with Redis Sorted
Sets or a C++ co-process when live trading is enabled. The `getOrderBook()`
factory is the sole access point, making the swap transparent to callers.

---

## Matching Engine Interface

`src/lib/trading/matching-engine.ts` defines `MatchingEngineInterface`:

```typescript
interface MatchingEngineInterface {
  placeOrder(order: Order): Promise<PlaceOrderResult>;
  cancelOrder(orderId: string, userId: string): Promise<CancelOrderResult>;
  match(market: string): Promise<MatchResult>;
  snapshot(market: string, depth?: number): Promise<OrderBookSnapshot>;
}
```

Phase 28 ships the interface only. A concrete implementation will be added in a
future phase when the execution pipeline is defined. The interface is designed
to be implementable by:

- An in-process JavaScript engine (simple, testable)
- A Redis-backed distributed engine
- A C++ co-process communicating over a Unix socket

---

## Trading Events

Every significant state change emits a typed `TradingEvent<T>`:

```typescript
{
  eventId: string;    // UUID, dedup key
  type: TradingEventType;
  timestamp: string;  // ISO 8601
  payload: { ... };   // type-specific
}
```

Event types: `OrderCreated`, `OrderAccepted`, `OrderRejected`, `OrderCancelled`,
`TradeExecuted`, `OrderExpired`, `LedgerPosted`.

Phase 28 logs events via the structured logger. A future phase will route them
to a Kafka or Redis Streams topic for downstream consumers (reporting, risk,
notification).

---

## API Endpoints

All endpoints use existing auth, rate-limiting, CSRF, and observability
infrastructure.

### `GET /api/markets`

Returns active markets.

Query params:
- `?symbol=BTCUSDT` — single market lookup

```json
{
  "ok": true,
  "markets": [ { "symbol": "BTCUSDT", "status": "active", ... } ],
  "count": 2
}
```

Rate limit: 240 req/min.

---

### `GET /api/assets`

Returns active assets.

Query params:
- `?symbol=BTC` — single asset lookup

Rate limit: 240 req/min.

---

### `GET /api/orderbook`

Returns the current depth snapshot for a market.

Query params:
- `symbol` — required
- `depth` — levels per side (1–100, default 20)

Rate limit: 480 req/min (high-frequency polling).

```json
{
  "ok": true,
  "snapshot": {
    "market": "BTCUSDT",
    "bids": [ { "price": "65000.00", "quantity": "0.12300000", "orderCount": 3 } ],
    "asks": [ { "price": "65001.00", "quantity": "0.08000000", "orderCount": 1 } ],
    "lastUpdateId": 42,
    "timestamp": "2026-06-30T..."
  }
}
```

---

### `GET /api/trades`

Returns recent public trades for a market, or the authenticated user's trade history.

Query params:
- `?market=BTCUSDT` — public trades (no auth required)
- `?mine=1` — authenticated user's trades (auth required)
- `?mine=1&market=BTCUSDT` — user's trades for a specific market
- `limit` — 1–200, default 50

Rate limit: 120 req/min.

---

### `GET /api/orders`

Returns the authenticated user's orders.

Auth: required.

Query params:
- `market` — filter by market
- `status` — filter by status
- `limit` — 1–200, default 50

Rate limit: 120 req/min.

---

### `POST /api/orders`

Place a new order. CSRF required.

Auth: required.

```json
{
  "market": "BTCUSDT",
  "side": "buy",
  "type": "limit",
  "quantity": "0.001",
  "price": "65000"
}
```

Returns `201` on success.

Rate limit: 30 req/min.

Validation enforces: market active, quantity step size, price tick size, min/max
order value.

---

### `DELETE /api/orders/:id`

Cancel an open order. CSRF required.

Auth: required. Users may only cancel their own orders.

Rate limit: 30 req/min.

---

## Database Schema

Migration `0004_trading_core.sql` (idempotent — all `CREATE TABLE IF NOT EXISTS`):

- `assets` — with seed rows for USDT, BTC, ETH
- `markets` — with seed rows for BTCUSDT, ETHUSDT
- `wallet_ledger` — append-only; indexed on `(wallet_id, asset, created_at)`
- `orders` — indexed on `(user_id)`, `(market, status)`
- `trades` — indexed on `(market, executed_at)`
- `order_events` — audit log, indexed on `(order_id)`

---

## Future Matching Engine Integration

When the matching engine is implemented, `POST /api/orders` will:

1. Validate order (already done)
2. Check available balance via wallet ledger (sum holds)
3. Post a `hold` ledger entry to reserve funds
4. Call `engine.placeOrder(order)` — returns immediately for GTC, or fills inline for IOC/FOK/Market
5. Receive `PlaceOrderResult.tradeIds` for any immediate fills
6. For each trade: post `trade_debit`, `trade_credit`, `fee` ledger entries
7. Update order status in DB
8. Emit `OrderAccepted` / `TradeExecuted` events

The interface is designed so this integration requires no changes to the
validation or service layer — only the orchestration in the order route.

---

## Remaining Gaps (Phase 28 intentional deferrals)

| Gap | Notes |
|---|---|
| Live matching engine | Interface shipped; implementation deferred |
| Balance check before order | Requires balance ledger aggregate query |
| WebSocket order book feed | Server-sent events or WS upgrade |
| Profit/loss reporting | Requires trade history aggregation |
| Margin & futures models | Separate domain, separate phase |
| Fee tier schedules | `makerFee`/`takerFee` per-user override |

---

## Phase 29 — In-Process Matching Engine

Phase 29 implemented `InProcessMatchingEngine` with:
- LIMIT and MARKET order types
- GTC / IOC / FOK time-in-force
- Price-time priority FIFO matching
- Immediate matching in `placeOrder()`
- Partial fills and VWAP avg_fill_price
- Trade row creation with maker/taker fee accounting
- Hold/release ledger entries
- `order_events` audit trail
- GTC order book insertion
- Cancel flow via `engine.cancelOrder()`

Phase 29 known gaps (all closed in Phase 30):
- No DB transaction around the match sequence (multiple `withDb` calls)
- Balance check and hold were two separate DB calls (TOCTOU race)
- In-memory book lost on process restart (no warm-start)
- `getAvailableBalance` was a full ledger aggregate query (slow)

---

## Phase 30 — Transactional Matching, Wallet Balances, Redis Foundation

### New files

| File | Description |
|------|-------------|
| `wallet-balance-service.ts` | Atomic hold/release/debit/credit/fee via single SQL statements on `wallet_balances` |
| `order-book-store.ts` | `OrderBookStore` interface, `InMemoryOrderBookStore`, `RedisOrderBookStore` stub, warm-start `rebuildOrderBook()` |

### wallet_balances table (migration 0005)

Stores a fast, O(1) snapshot of each user's balance per asset. The `wallet_ledger` table continues to be the authoritative audit trail; both are updated in the same transaction.

The `CHECK (available_balance >= 0)` and `CHECK (held_balance >= 0)` constraints give Postgres-level enforcement — a failing UPDATE is rejected at the DB layer regardless of application logic.

### Atomic order placement

The route now wraps order creation + hold in a single `withTx` call:

```
withTx:
  createOrderTx(client, ...)   — INSERT INTO orders
  holdFundsTx(client, ...)     — UPDATE wallet_balances … WHERE available >= holdAmount
  → COMMIT (or ROLLBACK if hold fails)
```

This eliminates the orphaned-order-with-no-hold window from Phase 29.

### Transactional matching

The engine's `placeOrder` separates matching into three phases:

1. **Pre-tx** (pure): `computeFills()` reads the in-memory book and builds `FillRecord[]` — zero DB calls.
2. **Single tx** (`withTx`): executes all fills atomically — trade rows, wallet balance updates, order status updates, audit events.
3. **Post-tx**: updates the in-memory `OrderBookStore` and display `OrderBook`.

Any DB failure rolls back the entire fill sequence — no partial trades.

### Warm-start recovery

`rebuildOrderBook(market)` rebuilds the in-memory engine book from `orders WHERE status IN ('NEW', 'PARTIALLY_FILLED')` on process restart. Called automatically when `getEngineBook` detects an empty book.

### Redis abstraction

`getOrderBookStore()` selects:
- `InMemoryOrderBookStore` — when `REDIS_URL` is not set
- `RedisOrderBookStore` stub — when `REDIS_URL` is set (warns in dev, throws in prod until ioredis is installed)

See `docs/REDIS_ORDER_BOOK.md` for the full key schema and activation guide.

### Open gaps (Phase 31+)

| Gap | Notes |
|-----|-------|
| Full single transaction (order+hold+match) | Phase 30 uses two transactions; gap is documented |
| Redis-backed book (multi-instance) | Stub only; requires `npm install ioredis` |
| WebSocket order book feed | Deferred |
| Real deposit / withdrawal rails | Out of scope |
| KYC integration | Out of scope |
| Stop-limit trigger logic, Margin, Futures | Out of scope |
| KYC limits | External compliance check, not in core |

---

## Phase 31 — Spot Trading Complete

### New endpoints

| Route | Description |
|-------|-------------|
| `GET /api/markets/[market]/summary` | 24h statistics + order book snapshot |
| `GET /api/orders/open` | Open orders only (NEW/PARTIALLY_FILLED) |

### Enhanced endpoints

| Route | Added |
|-------|-------|
| `GET /api/orders` | `side`, `type`, `from`, `to`, `cursor` params; `nextCursor` in response |
| `GET /api/trades` | `before`, `from`, `to` cursor/range; `nextCursor` in response |
| `GET /api/orderbook` | `aggregate=N` — price bucket aggregation |

### New files

| File | Description |
|------|-------------|
| `src/lib/trading/market-stats-service.ts` | Single-query 24h market statistics |
| `src/app/api/markets/[market]/summary/route.ts` | Market summary route |
| `src/app/api/orders/open/route.ts` | Open orders route |
| `docs/SPOT_ENGINE.md` | Spot engine reference |

### Audit events

`OrderFilled` and `OrderPartiallyFilled` added to `TradingEventType`. Engine now emits:
- `OrderFilled` — when incoming order completely fills
- `OrderPartiallyFilled` — when GTC order partially fills and remains in book
- `OrderAccepted` — when GTC order has zero fills and rests in book (unchanged)

### Database

Migration 0006 adds indexes for open orders, user trade history (UNION path), and 24h market stats window. See `docs/SPOT_ENGINE.md` for full index table.

### Open gaps (Phase 32+)

| Gap | Notes |
|-----|-------|
| Full single transaction (order+hold+match) | Two-transaction gap from Phase 30 remains |
| Redis-backed order book | Stub; requires `npm install ioredis` |
| WebSocket / SSE feeds | Out of scope |
| Stop-limit trigger | Type accepted; trigger not implemented |
