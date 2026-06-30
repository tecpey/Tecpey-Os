# WebSocket API — Phase 33

> Real-time market data, user streams, and order book updates over WebSocket.

---

## Connection

```
ws://localhost:3000/ws          (development)
wss://tecpey.ir/ws              (production)
```

The WebSocket server runs on the same port as the HTTP server (custom `server.ts`).

Start with WebSocket support:
```bash
npm run dev    # tsx server.ts (development)
npm run start  # tsx server.ts (production)
```

---

## Message Format

All messages are JSON objects.

### Client → Server

| Type | Description |
|------|-------------|
| `subscribe` | Subscribe to a channel |
| `unsubscribe` | Unsubscribe from a channel |
| `auth` | Authenticate with a session token |
| `ping` | Keepalive ping (server replies `pong`) |
| `get_snapshot` | Request a full snapshot for a channel |

**Subscribe:**
```json
{ "type": "subscribe", "channel": "ticker", "market": "BTCUSDT" }
{ "type": "subscribe", "channel": "user-orders" }
```

**Auth (if not sent via cookie):**
```json
{ "type": "auth", "token": "<session-token>" }
```

### Server → Client

| Type | Description |
|------|-------------|
| `connected` | Sent immediately on connect |
| `authenticated` | Auth success |
| `subscribed` | Subscription confirmed |
| `unsubscribed` | Unsubscription confirmed |
| `snapshot` | Full state snapshot (sent on subscribe) |
| `update` | Incremental data update |
| `ping` | Server heartbeat (reply with `pong`) |
| `pong` | Response to client ping |
| `error` | Error response |

---

## Authentication

Two methods:

**1. Cookie (recommended):** If the browser has a valid `tecpey_session` cookie, the WS server automatically authenticates on connect.

**2. Token message:** Send `{ "type": "auth", "token": "<session-token>" }` after connecting. The token is a valid session JWT.

Authenticated status is confirmed with:
```json
{ "type": "authenticated", "userId": "user123" }
```

---

## Channels

### Public Channels

These require no authentication.

#### `ticker` — Live Ticker

```json
{ "type": "subscribe", "channel": "ticker", "market": "BTCUSDT" }
```

**Snapshot (on subscribe):**
```json
{
  "type": "snapshot",
  "channel": "ticker",
  "market": "BTCUSDT",
  "data": {
    "market": "BTCUSDT",
    "lastPrice": "65000.00",
    "priceChange24h": "2000.00",
    "priceChangePct24h": "3.1746",
    "highPrice24h": "66000.00",
    "lowPrice24h": "62500.00",
    "baseVolume24h": "12.5",
    "quoteVolume24h": "812500.00",
    "vwap24h": "65000.00",
    "tradeCount24h": 42,
    "bestBid": "64999.00",
    "bestAsk": "65001.00"
  }
}
```

**Update (on every trade):** Same structure with `"type": "update"`.

---

#### `trades` — Live Trades

```json
{ "type": "subscribe", "channel": "trades", "market": "BTCUSDT" }
```

**Update (on every match):**
```json
{
  "type": "update",
  "channel": "trades",
  "market": "BTCUSDT",
  "data": {
    "tradeId": "uuid",
    "market": "BTCUSDT",
    "price": "65000.0000000000",
    "quantity": "0.001",
    "buyerOrderId": "uuid",
    "sellerOrderId": "uuid",
    "buyerUserId": "user1",
    "sellerUserId": "user2",
    "makerSide": "sell",
    "executedAt": "2026-06-30T..."
  }
}
```

---

#### `orderbook` — Order Book

```json
{ "type": "subscribe", "channel": "orderbook", "market": "BTCUSDT" }
```

**Snapshot (on subscribe):**
```json
{
  "type": "snapshot",
  "channel": "orderbook",
  "market": "BTCUSDT",
  "seq": 1,
  "data": {
    "market": "BTCUSDT",
    "bids": [{ "price": "64999.00", "quantity": "0.5", "orderCount": 3 }],
    "asks": [{ "price": "65001.00", "quantity": "0.2", "orderCount": 1 }],
    "lastUpdateId": 42,
    "timestamp": "..."
  }
}
```

**Update — full snapshot (first update after subscribe, or after resync):**
Same structure with `"type": "update"` and incremented `seq`.

**Update — incremental delta (Phase 33, subsequent updates):**
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
`quantity: "0"` means the level was removed. Only changed levels are included.

**Resync:** If you detect a gap in `seq` (e.g., received 43 after 41, never saw 42), request a fresh snapshot. The server resets its delta state so the next broadcast will be a full `update`:
```json
{ "type": "get_snapshot", "channel": "orderbook", "market": "BTCUSDT" }
```

---

#### `market-summary` — Market Summary

```json
{ "type": "subscribe", "channel": "market-summary", "market": "BTCUSDT" }
```

Returns and updates with full `MarketStats` including 24h stats. Updated on every trade.

---

### Authenticated Channels

These require a valid session. Auth errors return:
```json
{ "type": "error", "code": "auth_required", "message": "Authentication required for this channel" }
```

#### `user-orders` — Order Updates

```json
{ "type": "subscribe", "channel": "user-orders" }
```

**Update (on every order state change):**
```json
{
  "type": "update",
  "channel": "user-orders",
  "data": {
    "orderId": "uuid",
    "userId": "user123",
    "market": "BTCUSDT",
    "status": "FILLED",
    "filledQuantity": "0.001",
    "remainingQuantity": "0.0",
    "avgFillPrice": "65000.00"
  }
}
```

---

#### `user-trades` — User Trade History

```json
{ "type": "subscribe", "channel": "user-trades" }
```

Receives the same payload as public `trades` but only for trades where this user is buyer or seller.

---

#### `wallet` — Wallet Updates

```json
{ "type": "subscribe", "channel": "wallet" }
```

**Update (on balance change):**
```json
{
  "type": "update",
  "channel": "wallet",
  "data": { "userId": "user123", "asset": "USDT" }
}
```

The update signals that the balance changed for the given asset. The client should refetch balance via `GET /api/wallet/balance?asset=USDT`.

---

#### `notifications` — Notifications

```json
{ "type": "subscribe", "channel": "notifications" }
```

Currently receives platform notifications. Future phases will add trading alerts.

---

## Heartbeat

Server sends `{ "type": "ping" }` every 30 seconds. Client must reply with `{ "type": "pong" }` within 15 seconds or the connection is terminated.

WebSocket protocol-level `PING` frames are also sent. The `ws` client library responds to these automatically.

---

## Rate Limits

| Action | Limit |
|--------|-------|
| Subscriptions per connection | Max 100 |
| Backpressure threshold | 1 MB buffered |

---

## Reconnect Strategy

Clients should implement exponential backoff reconnect:
1. On disconnect, wait 1 second, attempt reconnect
2. On failure, wait 2s, 4s, 8s … up to 30s max
3. On reconnect, re-authenticate and re-subscribe all channels
4. For `orderbook`, request `get_snapshot` to resync after reconnect

---

## Observability

Admin endpoint:
```
GET /api/ws/metrics
Authorization: admin session
```

Returns:
```json
{
  "ok": true,
  "available": true,
  "connectedClients": 42,
  "authenticatedClients": 38,
  "totalSubscriptions": 156,
  "subscriptionsByChannel": { "ticker:BTCUSDT": 20, "orderbook:BTCUSDT": 15 },
  "totalMsgsSent": 98432,
  "uptimeMs": 3600000
}
```
