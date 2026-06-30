# Horizontal Scaling Guide — Phase 33

> How to run multiple TecPey exchange instances without sticky sessions.

---

## Overview

Phase 33 introduces distributed real-time infrastructure using Redis Pub/Sub. Any number of server instances can run simultaneously. Each instance:

- Accepts WebSocket connections from any client
- Receives events from ALL instances (including itself) via Redis
- Broadcasts to its own local WebSocket clients

No sticky sessions, no load balancer affinity needed.

---

## Architecture

```
                    ┌─────────────────────────────────┐
                    │           Load Balancer          │
                    │  (round-robin, any algorithm)    │
                    └────────────┬────────────┬────────┘
                                 │            │
                    ┌────────────▼──┐    ┌────▼───────────┐
                    │  Instance A   │    │  Instance B     │
                    │ ─────────── │    │ ─────────────── │
                    │ Engine      │    │ Engine          │
                    │ EventBus    │    │ EventBus        │
                    │ WsManager   │    │ WsManager       │
                    └──────┬──────┘    └──────┬──────────┘
                           │                  │
                    ┌──────▼──────────────────▼──────┐
                    │            Redis                │
                    │  ─────────────────────────────  │
                    │  Order Book (Sorted Sets)       │
                    │  Pub/Sub (event distribution)   │
                    │  Node Registry (TTL keys)       │
                    └─────────────────────────────────┘
```

---

## Event Flow

1. **REST order placement:** Client hits Instance A's `POST /api/orders`
2. **Engine matching:** Instance A's engine matches the order, fills trades
3. **Local EventBus:** Engine emits `trade:executed`, `order:updated`, `orderbook:changed`, `wallet:changed`
4. **Redis PUBLISH:** `wireRedisPublisher` forwards events to Redis pub/sub channels
5. **Redis delivery:** All instances (A and B) receive the events via their subscriber clients
6. **WsManager broadcast:** Each instance broadcasts to its own local WebSocket clients

---

## Requirements

| Component | Minimum | Notes |
|-----------|---------|-------|
| Redis | 6.0+ | Single node, Sentinel, or Cluster |
| Instances | 2+ | Any number; stateless |
| Load balancer | Any | WebSocket upgrade pass-through required |

---

## Configuration

```env
# Required for multi-instance mode
REDIS_URL=redis://localhost:6379

# Multiple instances use the same REDIS_URL
# Each gets a unique nodeId automatically
```

### Nginx WebSocket pass-through

```nginx
upstream tecpey {
    server instance-a:3000;
    server instance-b:3000;
}

server {
    location / {
        proxy_pass http://tecpey;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## Matching Engine in Multi-Instance Deployments

**Important:** The current engine is in-process. Multiple instances each run their own engine with their own in-memory order book. This means:

- Order placements against the same market on different instances may compete
- Redis writes from `RedisOrderBookStore` provide durability but not cross-instance synchronization for the matching engine itself
- For true distributed matching, a single primary instance should own each market (routing by market symbol), or an external order router is needed

**Recommended topology for production:**
- 1 primary instance per market (handles order placement for that market)
- N read-only instances (serve WebSocket subscriptions, market data reads)
- All instances distribute events via Redis pub/sub

---

## Observability

`GET /api/ws/metrics` (admin) returns:

```json
{
  "available": true,
  "mode": "redis",
  "connectedClients": 42,
  "authenticatedClients": 38,
  "totalSubscriptions": 120,
  "droppedMessages": 0,
  "pubSub": {
    "connected": true,
    "nodeId": "a3b7c1d2",
    "published": 5400,
    "received": 5400,
    "dropped": 0,
    "reconnects": 0,
    "latencyMs": 1,
    "subscribedChannels": 5
  }
}
```

Count live nodes:
```bash
redis-cli KEYS "tecpey:node:*" | wc -l
```

---

## Failure Modes

| Scenario | Behaviour |
|----------|-----------|
| Redis pub/sub down | Events not distributed to other instances; local clients still receive events from local instance |
| Redis fully down | Order book falls back to in-memory; WsManager falls back to local EventBus |
| Instance crash | Remaining instances continue; node key expires in 60s |
| Network partition | Each partition operates independently; clients reconnect to available instances |

---

## Sequence Numbers and Delta OrderBook

Each market has a monotonic sequence number (`globalThis.tecpeyObSeq`). On multi-instance deployments:

- Sequence numbers are per-instance, not globally coordinated
- Clients detect gaps by comparing received `seq` to expected `seq`
- On gap: client sends `get_snapshot` → server sends fresh full snapshot
- After resync: delta mode resumes

For globally-coordinated sequence numbers (Phases 35+), a Redis INCR counter per market is the correct solution.

---

## Delta Order Book

Phase 33 sends incremental deltas instead of full 50-level snapshots after the first update:

```json
{
  "type": "delta",
  "channel": "orderbook",
  "market": "BTCUSDT",
  "seq": 43,
  "bids": [{ "price": "64999.00", "quantity": "0.5" }],
  "asks": [{ "price": "65001.00", "quantity": "0" }]
}
```

`quantity: "0"` = level removed. Only changed levels are included. This reduces WebSocket bandwidth by ~80–95% for active markets.
