# Redis Order Book — Phase 30 Foundation

> Architecture, key schema, PostgreSQL-authoritative recovery, and activation guide.

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

## Book Recovery (PostgreSQL-authoritative)

Recovery never reads the Redis projection. It runs through:

```typescript
// src/lib/trading/order-book-recovery.ts
export async function rebuildMarketBookFromAuthority(market: string): Promise<void>
```

It clears the in-memory and display books, **deletes** `tecpey:ob:{market}:bids`
and `tecpey:ob:{market}:asks`, then queries:

```sql
SELECT o.id, o.user_id, o.side, o.price, o.quantity, o.remaining_quantity, o.created_at
FROM orders o
JOIN exchange_order_commands command ON command.order_id = o.id
WHERE o.market = $1
  AND o.status IN ('NEW', 'PARTIALLY_FILLED')
  AND o.type = 'limit'
  AND o.price IS NOT NULL
  AND command.state = 'final'
  AND COALESCE((command.result->>'accepted')::boolean, FALSE) = TRUE
ORDER BY o.created_at ASC, o.id ASC
```

The command-finality join is what keeps an admitted-but-not-yet-accepted order
out of the book. If PostgreSQL is unavailable the function throws
`order_book_storage_unavailable` rather than serving a partial book.

> A historical `rebuildOrderBook()` helper warm-started from Redis and fell back
> to the database. It was removed. Redis writes here are fire-and-forget, so a
> failed cleanup leaves a cancelled order in the projection; a Redis-first
> rebuild would have resurrected it as live resting liquidity.

For the future Redis store, recovery must first clear the Redis projection and
repopulate it exclusively from the PostgreSQL-authoritative query above. Redis
may serve reads after that rebuild completes, but it must never be used as a
recovery source or trusted to warm-start the authoritative book.

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
   - Implement projection rebuilding that clears Redis and repopulates it only from the PostgreSQL-authoritative query.
   - Never read Redis as the source for recovery or warm-start authority.

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
