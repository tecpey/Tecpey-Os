# Redis Integration — Phase 32

> Order book persistence, warm-start recovery, and multi-instance architecture.

---

## Status

Phase 32 ships a complete `RedisOrderBookStore` using ioredis. Redis is optional:
- No `REDIS_URL` → `InMemoryOrderBookStore` (single-instance, no persistence)
- `REDIS_URL` set → `RedisOrderBookStore` (persistent, multi-instance ready)

---

## Architecture

```
getOrderBookStore()
  │
  ├── REDIS_URL absent  →  InMemoryOrderBookStore
  └── REDIS_URL set     →  RedisOrderBookStore
                              │
                              ├── Read path:  in-memory (synchronous, O(1))
                              └── Write path: async fire-and-forget to Redis Sorted Sets
```

### Why in-memory read path?

The `OrderBookStore` interface (`getLevels`, `getFOKVolume`, `snapshot`) is synchronous — it must return results without awaiting. Redis operations are inherently async. The solution: maintain an in-memory copy that is always consistent with Redis, using Redis for durability and future cross-instance sync.

---

## Key Schema

| Key | Type | Description |
|-----|------|-------------|
| `tecpey:ob:{MARKET}:bids` | Sorted Set | Bids. Score = price (ascending), member = JSON EngineOrder |
| `tecpey:ob:{MARKET}:asks` | Sorted Set | Asks. Score = price (ascending), member = JSON EngineOrder |
| `tecpey:order:{orderId}` | Hash | Fields: market, side, priceKey, remaining, member |

**Bid retrieval:** `ZRANGE … REV` (highest score = highest bid first)
**Ask retrieval:** `ZRANGE …` (lowest score = lowest ask first)

---

## Operations

### insert(market, entry)
1. In-memory: add to bid/ask Map + index
2. Redis (async): `ZADD tecpey:ob:{market}:bids|asks {price} {json}` + `HMSET tecpey:order:{id} ...`

### findAndRemove(orderId)
1. In-memory: look up in index, splice from level array
2. Redis (async): `ZREM` the member + `DEL tecpey:order:{id}`

### updateMakerRemaining(orderId, newRemaining)
1. In-memory: update `entry.remaining` (or remove if 0)
2. Redis (async): `ZREM` old member + `ZADD` new member (for partial fill), or `DEL` (for full fill)

### Warm-start from Redis

On engine startup, `rebuildOrderBook(market)` tries Redis first:
1. `ZRANGE tecpey:ob:{market}:bids 0 -1` + `ZRANGE tecpey:ob:{market}:asks 0 -1`
2. For each member, parse JSON EngineOrder, insert into in-memory store + display book
3. If Redis returns 0 orders, fall back to DB query (same as Phase 30)

---

## Configuration

```
REDIS_URL=redis://localhost:6379
REDIS_URL=redis://user:password@host:6379/0
REDIS_URL=rediss://host:6380   # TLS
```

**ioredis options (set in `createRedisClient()`):**
- `maxRetriesPerRequest: 3` — fail fast on transient errors
- `enableReadyCheck: true` — wait for READY before serving
- `lazyConnect: false` — connect immediately at startup

---

## Activation

Redis is already installed and implemented. To activate:

1. Start Redis:
   ```bash
   redis-server                          # local dev
   docker run -p 6379:6379 redis:7       # Docker
   ```

2. Set env variable:
   ```
   REDIS_URL=redis://localhost:6379
   ```

3. Start the server:
   ```bash
   npm run dev
   ```

The factory will detect `REDIS_URL` and automatically use `RedisOrderBookStore`.

---

## Multi-Instance Synchronization (Phase 33)

The current Redis store provides durability and warm-start but NOT cross-instance matching synchronization. Each instance still maintains its own in-memory book:

```
Instance A — engine → fill → update Redis ✓
Instance B — reads Redis on warm-start ✓
Instance B — engine → tries to fill → sees stale in-memory book ✗
```

**Phase 33 fix: Redis pub/sub**

When an instance modifies the order book:
1. Publish a `PUBLISH tecpey:ob:events {market}:{change}` message to Redis
2. All instances subscribe to `tecpey:ob:events`
3. On receiving a message, other instances update their in-memory book

This enables true multi-instance matching with Redis as the coordination layer.

---

## Failure Modes

| Scenario | Behaviour |
|----------|-----------|
| Redis down at startup | `validate()` logs warning; in-memory continues |
| Redis down during trading | Writes fail silently (fire-and-forget); in-memory remains authoritative |
| Redis restart | Order book must be rebuilt from DB (warm-start) |
| Redis data corruption | `rebuildOrderBook()` from DB overwrites Redis data |
| `REDIS_URL` set but unreachable | PING fails, logged as warning in dev; in-memory fallback |

---

## Observability

Redis connectivity is validated at startup via `this.redis.ping()`. Errors are logged but non-fatal in development. In production, a persistent Redis failure should alert oncall (instrument via your monitoring stack).

Redis write errors are caught per-operation and logged as warnings. The in-memory state remains correct even if Redis writes fail.
