# Redis Order Book — Phase 30 Foundation

> Architecture, key schema, warm-start recovery, and activation guide.

---

## Status: Foundation

Phase 30 ships the `OrderBookStore` abstraction and `InMemoryOrderBookStore`. Redis support is stubbed — the interface and key schema are defined but `ioredis` is not yet installed. The Redis implementation is activated in a future phase.

---

## Architecture

```
getOrderBookStore()
  │
  ├── REDIS_URL not set  →  InMemoryOrderBookStore  (production fallback: NONE — fail loudly)
  └── REDIS_URL set      →  RedisOrderBookStore     (future phase, requires ioredis)
```

In Phase 30:

- **Non-production + REDIS_URL absent**: `InMemoryOrderBookStore` — in-process sorted Maps, warm-start from DB.
- **Non-production + REDIS_URL set**: `RedisOrderBookStore` — logs a warning and falls back to in-memory (ioredis not installed yet).
- **Production + REDIS_URL set**: throws at startup — ioredis must be installed.
- **Production + REDIS_URL absent**: `InMemoryOrderBookStore` — acceptable for single-instance deployments, documented limitation.

---

## OrderBookStore Interface

```typescript
interface OrderBookStore {
  insert(market: string, entry: EngineOrder): void;
  findAndRemove(orderId: string): EngineOrder | null;
  getLevels(market: string, side: OrderSide): PriceLevelEntry[];
  getFOKVolume(market: string, takerSide: OrderSide, limitPrice: number): number;
  updateMakerRemaining(orderId: string, newRemaining: number): void;
  snapshot(market: string, depth?: number): OrderBookSnapshot;
  validate(): void;
}
```

`getLevels(market, "buy")` returns bids sorted descending (best bid first).
`getLevels(market, "sell")` returns asks sorted ascending (best ask first).

---

## Redis Key Schema (future implementation)

When ioredis is installed and `REDIS_URL` is configured:

| Key | Type | Description |
|-----|------|-------------|
| `tecpey:ob:{MARKET}:bids` | Sorted Set | Bid levels. Score = price. Member = JSON-encoded EngineOrder. |
| `tecpey:ob:{MARKET}:asks` | Sorted Set | Ask levels. Score = price. Member = JSON-encoded EngineOrder. |
| `tecpey:order:{orderId}` | Hash | Fields: `market`, `side`, `priceKey`, `remaining`, `originalQty`, `userId`, `ts`. Used for O(1) cancel lookup. |

### Operations mapping

| Engine operation | Redis command |
|-----------------|---------------|
| `insert(market, entry)` | `ZADD tecpey:ob:{market}:{side}s {price} {json}` + `HSET tecpey:order:{id} ...` |
| `findAndRemove(orderId)` | `HGETALL tecpey:order:{id}` → determine key → `ZREM` + `HDEL` |
| `getLevels(market, "sell")` | `ZRANGE tecpey:ob:{market}:asks 0 -1 WITHSCORES` (ascending) |
| `getLevels(market, "buy")` | `ZRANGE tecpey:ob:{market}:bids 0 -1 WITHSCORES REV` (descending) |
| `updateMakerRemaining(orderId, 0)` | `HGETALL tecpey:order:{id}` → `ZREM` + `HDEL` |
| `updateMakerRemaining(orderId, n)` | `ZREM` + `ZADD` (replace) + `HSET remaining n` |
| `snapshot(market, depth)` | `ZRANGE … LIMIT 0 depth WITHSCORES` (both sides) |

### Atomicity for Redis ops

Use `MULTI` / `EXEC` (Redis transaction) for compound operations like insert (ZADD + HSET). This prevents partial state if the process dies mid-operation.

---

## Warm-start Recovery

On first order request for a market, if the in-memory book is empty, `rebuildOrderBook(market)` runs automatically:

```typescript
// src/lib/trading/order-book-store.ts
export async function rebuildOrderBook(market: string): Promise<void>
```

It queries:
```sql
SELECT id, user_id, side, type, price, quantity, remaining_quantity, created_at
FROM orders
WHERE market = $1 AND status IN ('NEW', 'PARTIALLY_FILLED') AND type = 'limit'
ORDER BY created_at ASC
```

For each open limit order, it inserts an `EngineOrder` into the store and a price level into the display `OrderBook`. This restores full matching state after a process restart without replaying the full event log.

For the Redis store, warm-start should populate Redis Sorted Sets from the same query, then serve subsequent requests from Redis (not from DB).

---

## Activating Redis (future phase)

1. Install the client:
   ```bash
   npm install ioredis
   npm install --save-dev @types/ioredis
   ```

2. Set the environment variable:
   ```
   REDIS_URL=redis://localhost:6379
   ```

3. Implement `RedisOrderBookStore` in `src/lib/trading/order-book-store.ts`:
   - Replace the `extends InMemoryOrderBookStore` stub with full Redis commands.
   - Add `MULTI/EXEC` around compound key operations.
   - Implement warm-start population of Redis Sorted Sets from DB.

4. Call `validate()` at application startup to confirm the connection before serving orders.

---

## Single-Instance vs Multi-Instance

| Scenario | Phase 30 |
|----------|----------|
| Single Node.js process | Works — in-memory book is authoritative. |
| Multiple instances (horizontal scale) | NOT supported — each instance has its own in-memory book; orders across instances cannot match each other. Redis is required for multi-instance support. |

Multi-instance matching requires Redis as the shared order book and either:
- Sticky sessions (all orders for a market routed to the same instance), or
- A Redis-backed matching engine with distributed locking per market.

This is a Phase 32+ concern.
