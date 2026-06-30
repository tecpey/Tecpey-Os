# TecPey — API Reference

## Overview

All API routes live under `/api/`. They are Next.js App Router route handlers.

**Base URL:** `https://tecpey.ir/api`

---

## Authentication

Most endpoints require an active academy session cookie (`tecpey_academy_session`) set by the login flow.

Admin endpoints require either:
- The `x-tecpey-admin-token` header with the admin token, or
- The `tecpey_admin_session` cookie from a prior admin login

---

## CSRF Protection

All state-changing routes (`POST`, `PATCH`, `DELETE`) verify the `Origin` header matches `NEXT_PUBLIC_SITE_URL`.

Requests without a matching origin receive:
```json
{ "ok": false, "error": "forbidden" }
```
**Status:** `403`

---

## Academy Auth

### POST /api/academy/auth/register

Register a new academy student.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "minimum10chars",
  "displayName": "Student Name",
  "username": "username"
}
```

**Response (200):**
```json
{ "ok": true }
```

**Errors:**
| Code | Meaning |
|------|---------|
| `username_taken` | Username already registered |
| `invalid_email` | Email format invalid |
| `weak_password` | Password under 10 characters |
| `academy_auth_service_not_configured` | Server secret not set |

---

### POST /api/academy/auth/login

Authenticate an existing academy student.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Response (200):**
```json
{ "ok": true }
```

Sets `tecpey_academy_session` httpOnly cookie on success.

---

### POST /api/academy/auth/logout

End the academy session.

**Response (200):**
```json
{ "ok": true }
```

Clears the session cookie.

---

## Student Profile

### GET /api/academy-student-profile

Fetch the authenticated student's profile.

**Response (200):**
```json
{
  "profile": {
    "public_student_id": "abc123",
    "display_name": "Student Name",
    "username": "username",
    "avatar": "🧠",
    "streak_days": 5,
    "total_xp": 240,
    "completed_terms": 3,
    "overall_progress": 43,
    "earned_badges": ["Crypto Explorer", "Security Guardian"]
  }
}
```

**Response (401):** No active session.
```json
{ "profile": null }
```

---

### PATCH /api/academy-student-profile

Update the authenticated student's profile.

**Body (partial update):**
```json
{
  "displayName": "New Name",
  "avatar": "🔥"
}
```

**Response (200):**
```json
{ "ok": true }
```

---

## Term Progress

### POST /api/academy-term-progress

Record progress for a completed term quiz.

**Body:**
```json
{
  "termNumber": 1,
  "score": 8,
  "total": 10,
  "passed": true,
  "percent": 80
}
```

**Response (200):**
```json
{ "ok": true, "xp": 80 }
```

---

## Notifications

### GET /api/notifications

Fetch unread notifications for the authenticated student.

**Response (200):**
```json
{
  "notifications": [
    {
      "id": "notif_1",
      "type": "badge_earned",
      "message": "You earned the Security Guardian badge!",
      "read": false,
      "createdAt": "2026-06-26T10:00:00Z"
    }
  ]
}
```

### POST /api/notifications/read

Mark notifications as read.

**Body:**
```json
{ "ids": ["notif_1", "notif_2"] }
```

---

## Community

### GET /api/community/profile

Fetch the public community profile of the authenticated student.

### GET /api/community/hall-of-fame

Fetch the top learners leaderboard.

**Response (200):**
```json
{
  "learners": [
    {
      "publicStudentId": "abc123",
      "displayName": "Top Student",
      "level": "Advanced",
      "xp": 700,
      "completedTerms": 7
    }
  ]
}
```

---

## AI Mentor

### POST /api/mentor-conversations/[action]

Submit a message to the AI mentor. The mentor routes the message context-aware based on the student's current term and learning history.

**Body:**
```json
{
  "message": "What is the difference between Market Cap and FDV?",
  "context": { "currentTerm": 4 }
}
```

---

## Trading Arena

### POST /api/trading-arena

Submit a practice trade decision.

**Body:**
```json
{
  "symbol": "BTC",
  "side": "buy",
  "orderType": "market",
  "risk": 2,
  "size": 1000,
  "entryReason": "RSI oversold with support confirmation",
  "emotion": "Calm",
  "plan": "Exit at resistance, stop at swing low"
}
```

**Response (200):**
```json
{
  "ok": true,
  "mentorNote": "Risk is controlled. Document entry reason, invalidation and exit scenario clearly.",
  "disciplineScore": 85
}
```

---

## Trading API (Spot)

See `docs/SPOT_ENGINE.md` for engine architecture and `docs/TRADING_CORE.md` for data models.

### GET /api/markets

Returns active markets. Optional `?symbol=BTCUSDT` for single market.

Rate limit: 240 req/min.

### GET /api/markets/[market]/summary

Returns 24h statistics, order book top-of-book, and market configuration.

Rate limit: 120 req/min.

**Response:**
```json
{
  "ok": true,
  "market": { "symbol": "BTCUSDT", "status": "active", "makerFee": "0.001", ... },
  "stats": {
    "lastPrice": "65000.00", "openPrice24h": "63000.00", "highPrice24h": "66000.00",
    "lowPrice24h": "62500.00", "baseVolume24h": "12.5", "quoteVolume24h": "812500.00",
    "vwap24h": "65000.00", "priceChange24h": "2000.00", "priceChangePct24h": "3.1746",
    "tradeCount24h": 42, "updatedAt": "2026-06-30T..."
  },
  "orderBook": { "bestBid": {...}, "bestAsk": {...}, "bidCount": 5, "askCount": 5 }
}
```

---

### GET /api/orderbook

Returns depth snapshot. Query params: `symbol` (required), `depth` (1–100, default 20), `aggregate=N` (group by N decimal places).

Rate limit: 480 req/min.

---

### GET /api/trades

Returns trade history.

| Param | Description |
|-------|-------------|
| `market=BTCUSDT` | Public trade history for a market (no auth) |
| `mine=1` | User's own trades (auth required) |
| `limit` | Page size 1–200 |
| `before=<ISO>` | Cursor: trades before this timestamp |
| `from=<ISO>` | Date lower bound |
| `to=<ISO>` | Date upper bound |

Response includes `nextCursor` for pagination.

Rate limit: 120 req/min.

---

### GET /api/orders

Auth required. Returns the user's order history.

| Param | Description |
|-------|-------------|
| `market` | Filter by market |
| `status` | Filter by status |
| `side` | `buy` or `sell` |
| `type` | `limit`, `market`, etc. |
| `from=<ISO>` | Date lower bound |
| `to=<ISO>` | Date upper bound |
| `cursor=<ISO>` | Pagination cursor |
| `limit` | Page size 1–200 |

Response includes `nextCursor`.

Rate limit: 120 req/min.

---

### GET /api/orders/open

Auth required. Returns orders in `NEW` or `PARTIALLY_FILLED` status.

Optional: `?market=BTCUSDT`.

Rate limit: 120 req/min.

---

### POST /api/orders

Auth required. CSRF required. Place a new spot order.

```json
{
  "market": "BTCUSDT",
  "side": "buy",
  "type": "limit",
  "quantity": "0.001",
  "price": "65000",
  "timeInForce": "GTC"
}
```

Returns `201` with `{ order, tradeIds }` on success.

Order types: `limit`, `market`, `ioc`, `fok`, `gtc`. (`stop_limit` accepted but trigger not implemented.)

Rate limit: 30 req/min.

---

### DELETE /api/orders/[id]

Auth required. CSRF required. Cancel an open order.

Rate limit: 30 req/min.

---

### Trading Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `market_not_found` | 404 | Market symbol not found |
| `market_not_active` | 503 | Market is suspended |
| `invalid_quantity` | 422 | Quantity <= 0 or invalid |
| `quantity_step_size_violation` | 422 | Quantity not a multiple of stepSize |
| `price_required` | 400 | Price missing for limit order |
| `price_tick_size_violation` | 422 | Price not a multiple of tickSize |
| `order_value_too_small` | 422 | Order value below minimum |
| `order_value_too_large` | 422 | Order value above maximum |
| `insufficient_balance` | 422 | Not enough available balance |
| `order_not_accepted` | 422 | FOK failure or no liquidity |
| `order_not_found` | 404 | Order ID not found |

---

---

## WebSocket

```
ws://localhost:3000/ws      (development)
wss://tecpey.ir/ws          (production)
```

See `docs/WEBSOCKET.md` for the full protocol specification.

### Supported Channels

| Channel | Auth | Description |
|---------|------|-------------|
| `ticker` | No | Live 24h ticker + best bid/ask |
| `trades` | No | Public trade stream |
| `orderbook` | No | Full depth snapshot + incremental updates |
| `market-summary` | No | 24h market stats |
| `user-orders` | Yes | Order status changes |
| `user-trades` | Yes | User's filled trades |
| `wallet` | Yes | Balance change notifications |
| `notifications` | Yes | Platform notifications |

### GET /api/ws/metrics

Admin-only WebSocket observability endpoint.

Returns: `connectedClients`, `authenticatedClients`, `totalSubscriptions`, `subscriptionsByChannel`, `totalMsgsSent`, `uptimeMs`.

---

## Admin

All admin routes require `x-tecpey-admin-token` or an active admin session cookie.

### GET /api/command-center

Fetch platform-wide statistics for the admin dashboard.

### POST /api/command-center/campaign

Send a notification campaign to all students.

---

## Error Format

All API errors follow this format:

```json
{
  "ok": false,
  "error": "error_code_string"
}
```

Common error codes:

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `forbidden` | 403 | CSRF check failed |
| `unauthorized` | 401 | No valid session |
| `not_found` | 404 | Resource not found |
| `invalid_input` | 400 | Validation failed |
| `server_error` | 500 | Internal error |
| `admin_locked` | 503 | Admin not configured |
