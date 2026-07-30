# Redis Integration — Phase 33

> Order book persistence, warm-start recovery, and multi-instance architecture.

---

## Status

Phase 33 adds Redis Pub/Sub for cross-instance event distribution. Redis is optional:
- No `REDIS_URL` → `InMemoryOrderBookStore` + local EventBus (single-instance)
- `REDIS_URL` set → `RedisOrderBookStore` + Redis Pub/Sub (multi-instance, production-ready)

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

### Rebuild is PostgreSQL-authoritative — never from Redis

The Redis order-book keys are a **write-only projection**. Nothing reads them
back into the matching book, and no warm-start reader exists.

Resting liquidity is reconstructed only by
`rebuildMarketBookFromAuthority(market)` (`src/lib/trading/order-book-recovery.ts`):

1. Clear the in-memory engine book and the display book.
2. `DEL tecpey:ob:{market}:bids` + `DEL tecpey:ob:{market}:asks` — the stale
   projection is purged, never trusted.
3. Rebuild from PostgreSQL, admitting only orders whose durable command is
   `state = 'final'` **and** `result->>'accepted' = true`.
4. Fail closed (`order_book_storage_unavailable`) if PostgreSQL is unavailable.

A historical `rebuildOrderBook()` helper tried Redis first and fell back to the
database. It was removed: because Redis writes are fire-and-forget, a failed
cleanup left a cancelled order in the projection, and a Redis-first rebuild
would have resurrected it as live resting liquidity.

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

## Redis Pub/Sub (Phase 33)

Phase 33 adds cross-instance event distribution via `src/lib/redis-pubsub.ts`.

### Architecture

```
Engine (any instance)
  └→ local EventBus
       └→ wireRedisPublisher → Redis PUBLISH tecpey:events:{type}
                                    │
                              Redis Pub/Sub
                             /               \
                     Instance A sub        Instance B sub
                           │                     │
                     WsManager.broadcast    WsManager.broadcast
                           │                     │
                    local WS clients       local WS clients
```

All instances subscribe AND publish. The publisher also receives its own events via Redis (round-trip adds ~1ms but eliminates sticky-session requirements entirely).

### Pub/Sub Channels

| Channel | Payload |
|---------|---------|
| `tecpey:events:trade` | `TradeExecutedPayload` |
| `tecpey:events:order` | `OrderUpdatedPayload` |
| `tecpey:events:orderbook` | `OrderBookChangedPayload` (50-level snapshot) |
| `tecpey:events:ticker` | `TickerUpdatedPayload` |
| `tecpey:events:wallet` | `WalletChangedPayload` |

### Envelope format

```json
{ "nodeId": "abc12345", "ts": 1751366400000, "payload": { ... } }
```

`nodeId` is a random 8-character UUID prefix unique per server process.

### Order book coalescing

Multiple `orderbook:changed` events within a 50ms window per market are coalesced into a single Redis PUBLISH. This handles large market orders that trigger multiple fills.

### Node Registry

Each instance registers itself at startup and refreshes every 30s:
```
SET tecpey:node:{nodeId} {...} EX 60
```
Count with `KEYS tecpey:node:*` (also available via `GET /api/ws/metrics`).

### WsManager mode

When `setupRedisSubscriptions()` is called:
- `mode` switches from `"local"` to `"redis"`
- WsManager broadcasts only from Redis subscriber events
- Local EventBus listeners remain active for non-WS concerns (stats cache invalidation)
- `GET /api/ws/metrics` reports both `mode` and full `pubSub` metrics

### Fallback (no Redis)

Without `REDIS_URL`, the server runs in `"local"` mode:
- WsManager subscribes directly to the local EventBus
- Single-instance only — events from other instances are not distributed
- Identical to Phase 32 behaviour

---

## Failure Modes

| Scenario | Behaviour |
|----------|-----------|
| Redis down at startup | `validate()` logs warning; in-memory continues |
| Redis down during trading | Writes fail silently (fire-and-forget); in-memory remains authoritative |
| Redis restart | No impact on matching; the book is rebuilt from PostgreSQL |
| Redis data corruption | Harmless — the projection is never read; `rebuildMarketBookFromAuthority()` purges and rebuilds it from PostgreSQL |
| `REDIS_URL` set but unreachable | PING fails, logged as warning in dev; in-memory fallback |

---

## Observability

Redis connectivity is validated at startup via `this.redis.ping()`. Errors are logged but non-fatal in development. In production, a persistent Redis failure should alert oncall (instrument via your monitoring stack).

Redis write errors are caught per-operation and logged as warnings. The in-memory state remains correct even if Redis writes fail.
