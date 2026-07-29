# Spot Trading Engine — Phase 31

> Complete spot trading capability: market statistics, open orders, enhanced filtering, trade history pagination, and orderbook aggregation.

---

## What Phase 31 Added

| Item | Status |
|------|--------|
| `GET /api/markets/[market]/summary` | NEW — 24h statistics + order book snapshot |
| `GET /api/orders/open` | NEW — open orders (NEW/PARTIALLY_FILLED) |
| `GET /api/orders` — side, type, date, cursor | ENHANCED |
| `GET /api/trades` — before cursor, from/to range | ENHANCED |
| `GET /api/orderbook` — `?aggregate=N` | ENHANCED |
| `market-stats-service.ts` | NEW — single-query 24h aggregation |
| `listOpenOrders()` in order-service | NEW |
| `listTrades` / `listUserTrades` — pagination | ENHANCED |
| `OrderFilled`, `OrderPartiallyFilled` events | NEW — correct audit trail |
| Migration 0006 — spot trading indexes | NEW |

---

## Market Statistics

`src/lib/trading/market-stats-service.ts` computes 24-hour rolling statistics in a single SQL query:

```sql
SELECT
  COUNT(*)                    AS trade_count,
  SUM(quantity)               AS base_volume_24h,
  SUM(quantity * price)       AS quote_volume_24h,
  MAX(price)                  AS high_24h,
  MIN(price)                  AS low_24h,
  SUM(q * p) / SUM(q)        AS vwap_24h,
  <subquery: first trade in 24h window>  AS open_24h,
  <subquery: most recent trade>          AS last_price
FROM trades
WHERE market = $1 AND executed_at >= NOW() - INTERVAL '24 hours'
```

Price change = `last_price - open_24h`. Price change % = `(change / open_24h) * 100`.

VWAP is always over the 24h window. If no trades exist in 24h, all aggregates return zero or null.

---

## Order Lifecycle — Full

```
POST /api/orders
  → validate (market active, tick size, step size, min value)
  → compute hold amount
  → withTx: createOrderTx + holdFundsTx
  → engine.placeOrder()
     → computeFills() — pure, reads in-memory book
     → withTx:
         for each fill:
           createTradeTx
           releaseFundsTx (maker+taker)
           debitFundsTx (taker)
           creditFundsTx (taker)
           chargeFeeTx (maker+taker)
           updateOrderFillTx (maker)
           appendOrderEventTx → "TradeExecuted"
         final status:
           FILLED        → appendOrderEventTx → "OrderFilled"
           PARTIALLY_FILLED (GTC) → appendOrderEventTx → "OrderPartiallyFilled"
           zero fill (GTC)  → appendOrderEventTx → "OrderAccepted"
           zero/partial (IOC/FOK) → appendOrderEventTx → "OrderExpired"
     → post-tx: update in-memory book
```

---

## Audit Events

All events are written to `order_events` (DB) and emitted via `createTradingEvent` (in-process).

| Event | When emitted |
|-------|-------------|
| `OrderCreated` | On `createOrder` / `createOrderTx` |
| `OrderAccepted` | GTC order placed with zero fills (resting in book) |
| `OrderPartiallyFilled` | GTC order partially matched; remainder resting in book |
| `OrderFilled` | Order completely filled |
| `TradeExecuted` | Once per fill (may be multiple per order) |
| `OrderExpired` | IOC/FOK remainder discarded, or market order with no liquidity |
| `OrderCancelled` | User or system cancel |
| `OrderRejected` | FOK failure / validation failure after order creation |

---

## Open Orders API

```
GET /api/orders/open
Authorization: required (session cookie)

?market=BTCUSDT  — optional

Response:
{
  "ok": true,
  "orders": [ { "status": "NEW" | "PARTIALLY_FILLED", ... } ],
  "count": 2
}
```

Implemented in `src/app/api/orders/open/route.ts`.

---

## Enhanced Order Filtering

`GET /api/orders` now accepts:

| Param | Type | Description |
|-------|------|-------------|
| `market` | string | Filter by market |
| `status` | string | Filter by order status |
| `side` | `buy\|sell` | Filter by order side |
| `type` | string | Filter by order type |
| `from` | ISO 8601 | Lower bound on `created_at` |
| `to` | ISO 8601 | Upper bound on `created_at` |
| `cursor` | ISO 8601 | Pagination cursor (`created_at < cursor`) |
| `limit` | number | Page size (1–200, default 50) |

Response includes `nextCursor` = `createdAt` of the last item (null if no more pages).

---

## Trade History Pagination

`GET /api/trades` now accepts:

| Param | Type | Description |
|-------|------|-------------|
| `before` | ISO 8601 | Cursor: only trades before this timestamp |
| `from` | ISO 8601 | Lower bound on `executed_at` |
| `to` | ISO 8601 | Upper bound on `executed_at` |
| `limit` | number | Page size (1–200, default 50) |

Response includes `nextCursor` = `executedAt` of last item.

---

## Orderbook Aggregation

`GET /api/orderbook` now accepts `?aggregate=N` where N is the number of decimal places to round prices to:

- `aggregate=0` — round to integer (1 USDT per bucket)
- `aggregate=2` — round to 0.01 (useful for BTC at $65k)
- No `aggregate` param — return raw price levels (default)

Bid prices are rounded **down** (floor); ask prices are rounded **up** (ceil). Quantities are summed within each bucket.

---

## Market Summary API

```
GET /api/markets/BTCUSDT/summary

Response:
{
  "ok": true,
  "market": { "symbol": "BTCUSDT", "status": "active", "makerFee": "0.001", ... },
  "stats": {
    "lastPrice": "65000.00",
    "openPrice24h": "63000.00",
    "closePrice": "65000.00",
    "highPrice24h": "66000.00",
    "lowPrice24h": "62500.00",
    "baseVolume24h": "12.5",
    "quoteVolume24h": "812500.00",
    "vwap24h": "65000.00",
    "priceChange24h": "2000.00",
    "priceChangePct24h": "3.1746",
    "tradeCount24h": 42,
    "updatedAt": "2026-06-30T..."
  },
  "orderBook": {
    "bestBid": { "price": "64999.00", "quantity": "0.1" },
    "bestAsk": { "price": "65001.00", "quantity": "0.08" },
    "bidCount": 5,
    "askCount": 5
  }
}
```

---

## Database Indexes (Migration 0006)

| Index | Covers |
|-------|--------|
| `idx_orders_user_status` | `orders(user_id, status, created_at DESC)` — open orders query |
| `idx_trades_buyer` | `trades(buyer_order_id, executed_at DESC)` — user trade history |
| `idx_trades_seller` | `trades(seller_order_id, executed_at DESC)` — user trade history |
| `idx_trades_market_time` | `trades(market, executed_at DESC)` — market stats 24h window |

---

## Validation

`validatePlaceOrderRequest` enforces:
- Market active
- Quantity > 0 and is a multiple of `stepSize`
- Price > 0 (for limit/stop_limit) and is a multiple of `tickSize`
- Order value within `[minOrderValue, maxOrderValue]`
- Stop price present for stop_limit

`stop_limit` type is accepted by validation but the matching engine treats it as a limit order (stop trigger is not implemented — out of scope for Phase 31).

---

## Not Implemented (Out of Scope)

- Margin / Futures / Options / Leverage
- Stop order trigger logic
- OCO orders
- WebSocket / SSE feeds
- Real deposit / withdrawal rails
- KYC provider integration
- Redis pub/sub
- Multi-instance matching (Redis required)
