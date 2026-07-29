# Realtime Architecture — Phase 32

> Event bus, WebSocket delivery, market stats cache, and snapshot behaviour.

---

## Overview

```
Trading Engine (engine.ts)
  │
  │ emits (post-tx, same process)
  ▼
Event Bus (globalThis.tecpeyEventBus)
  ├─ trade:executed    → WsManager → clients subscribed to trades:MARKET
  │                    → ticker:MARKET refresh
  │                    → market-summary:MARKET refresh
  ├─ order:updated     → WsManager → user-orders:{userId}
  ├─ orderbook:changed → WsManager → orderbook:MARKET
  ├─ wallet:changed    → WsManager → wallet:{userId}
  └─ ticker:updated    → WsManager → ticker:MARKET
```

All components run in the same Node.js process. The `globalThis` namespace is the shared state boundary. Events flow synchronously within the JavaScript event loop (no IPC, no TCP).

---

## Event Bus (`src/lib/event-bus.ts`)

A typed `EventEmitter` singleton on `globalThis.tecpeyEventBus`.

### Events

| Event | Emitted when | Payload |
|-------|-------------|---------|
| `trade:executed` | Engine completes a fill | Trade details incl. buyer/seller userIds |
| `order:updated` | Order status changes (fill, cancel, accept) | orderId, userId, status, quantities |
| `orderbook:changed` | Book mutates after any order event | Full depth snapshot + sequence number |
| `ticker:updated` | Market stats computed | 24h stats fields |
| `wallet:changed` | Balance changes | userId, asset (signal only — no amounts) |

### Sequence Numbers

Each market has a monotonically increasing sequence counter (`globalThis.tecpeyObSeq`). The sequence increments on every `orderbook:changed` emission. Clients use gaps to detect missed updates and request a resync snapshot.

---

## WebSocket Manager (`src/lib/ws/ws-manager.ts`)

Manages all WebSocket connections in a single `WsManager` singleton on `globalThis.tecpeyWsManager`.

### Connection Lifecycle

```
Client connects to ws://host/ws
  → WsManager.handleConnection()
  → tryAuthFromRequest() — reads session cookie from HTTP upgrade headers
  → send { type: "connected" }

Client → { "type": "subscribe", "channel": "ticker", "market": "BTCUSDT" }
  → validate channel
  → auth check (user-* channels require session)
  → register to channel map: "ticker:BTCUSDT" → Set<connId>
  → send snapshot
  → send { type: "subscribed" }

Trade executes in engine.ts
  → bus.emit("trade:executed", payload)
  → WsManager listens → broadcasts to "trades:BTCUSDT"
  → broadcasts ticker refresh to "ticker:BTCUSDT"

Client disconnects
  → remove from all channel sets
  → remove from conns map
```

### Backpressure

Before sending to a client, the manager checks `ws.bufferedAmount`. If the pending buffer exceeds 1 MB, the message is dropped. Slow clients eventually get terminated via the heartbeat.

### Heartbeat

Every 30 seconds:
1. Server sends WebSocket `PING` frame (handled by `ws` library)
2. Server sends `{ "type": "ping" }` JSON message (for clients that don't handle raw PING)
3. If a client's `lastPong` is more than 45 seconds old, the connection is terminated

---

## Market Stats Cache (`src/lib/trading/market-stats-cache.ts`)

TTL-based in-memory cache per market (5-second TTL by default).

- `getCachedMarketStats(market)` — returns cached stats or refreshes from DB
- `invalidateStatsCache(market)` — called by engine after each trade; forces refresh on next read
- `buildTickerPayload(market)` — combines stats + order book top for ticker broadcasts

Cache entries are stored on `globalThis.tecpeyStatsCache` to survive Next.js hot-reload.

---

## Snapshot Behaviour

### Order Book Snapshot

Sent immediately on `subscribe` to `orderbook`:

```json
{
  "type": "snapshot",
  "channel": "orderbook",
  "market": "BTCUSDT",
  "seq": 42,
  "data": { "bids": [...], "asks": [...] }
}
```

Depth: 50 levels per side in WS snapshots (vs. configurable depth in REST).

### Incremental Updates

After every `orderbook:changed` event, the WS manager broadcasts a new full snapshot (not true incremental deltas). This is simpler and correct for the current single-process architecture. True delta streaming (only changed levels) is a Phase 33 optimization.

### Resync

Clients that detect a sequence gap should send:
```json
{ "type": "get_snapshot", "channel": "orderbook", "market": "BTCUSDT" }
```

The server responds with a fresh snapshot at the current sequence number.

---

## Custom Server (`server.ts`)

The WebSocket server requires a custom Node.js HTTP server. This replaces `next dev` / `next start` with `tsx server.ts`.

```typescript
const httpServer = createServer();
const app = next({ dev, httpServer });
// ... app.prepare()
httpServer.on("upgrade", (req, socket, head) => {
  if (url.startsWith("/ws")) wss.handleUpgrade(...);
  else socket.destroy();
});
```

### Environment Loading

`@next/env`'s `loadEnvConfig()` is called at the top of `server.ts` to load `.env.local` and `.env` before any imports. This ensures `DATABASE_URL`, `REDIS_URL`, etc. are available to all services.

---

## Performance Optimizations

| Optimization | Implementation |
|-------------|----------------|
| Reuse JSON serialization | `broadcast()` serializes once, sends same buffer to all subscribers |
| Lazy ticker refresh | Ticker is only refreshed when a trade executes (event-driven, not polled) |
| Stats cache TTL | 5-second cache prevents redundant DB queries for high-volume markets |
| Backpressure | Messages dropped for slow clients instead of queuing unbounded |
| Global singleton | WsManager and EventBus on `globalThis` survive HMR without re-initializing |

---

## Single-Instance Limitation

The current architecture uses in-process event emission. If the app is deployed across multiple Node.js instances (horizontal scaling), each instance has its own:
- In-memory order book
- Event bus
- WebSocket manager

Orders from instance A are matched on instance A but clients connected to instance B never see the updates.

**Phase 33 fix:** Redis pub/sub — engine publishes events to a Redis channel; all instances subscribe and rebroadcast to their local WS clients. This requires:
1. `REDIS_URL` set in env
2. The Redis pub/sub subscriber running in each instance's custom server
3. WsManager listening on the Redis subscriber instead of (or in addition to) the local event bus

---

## Security

- Auth channels require a valid session (cookie or token message)
- Max 100 subscriptions per connection
- Backpressure limit prevents memory exhaustion from slow clients
- Invalid JSON messages receive `error` response, connection stays open
- Unknown channels receive `error` response
- Upgrade requests to paths other than `/ws` are rejected with `socket.destroy()`
