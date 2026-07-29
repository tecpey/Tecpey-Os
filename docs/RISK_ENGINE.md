# Risk Engine — Phase 35

> Lightweight real-time risk detection with enforcement. Emit events + set enforcement levels.

---

## Architecture

```
Order placement request
  │
  ├── [SYNC] enforceTradeAllowed(userId)       ← NEW Phase 35
  │       └── Redis GET tecpey:risk:level:{userId}
  │             → if trade_blocked / all_blocked: return 403
  │
  ├── [ASYNC, fire-and-forget] checkOrderRisk()
  │       │
  │       ├── Redis INCR — frequency counter
  │       ├── Redis INCR — burst counter
  │       ├── Redis GET  — last known IP
  │       └── Redis GET  — dedup fingerprint
  │               │
  │               └── (if threshold exceeded) → INSERT risk_events
  │                     + writeAudit()
  │                     + setRiskLevel() if high severity ← NEW Phase 35
  │
  └── [MAIN PATH] engine.placeOrder() — unaffected by risk engine
```

---

## Risk Checks

### 1. order_frequency_high (severity: medium)

**Threshold:** > 10 orders per minute per user per market.

**Redis key:** `tecpey:risk:freq:{userId}:{market}:{minBucket}` TTL=70s

### 2. order_burst (severity: low)

**Threshold:** > 3 orders within 5 seconds per user.

**Redis key:** `tecpey:risk:burst:{userId}` TTL=5s

### 3. ip_switch_detected (severity: low)

**Threshold:** IP changes within a 5-minute window.

**Redis key:** `tecpey:risk:ip:{userId}` TTL=300s

### 4. duplicate_request (severity: medium)

**Threshold:** Same order fingerprint within 5 seconds.

**Redis key:** `tecpey:risk:dedup:{fingerprint}` TTL=5s

**Phase 35 enforcement:** Sets `review` level for 5 minutes.

### 5. suspicious_api_behavior (severity: medium)

**Threshold:** > 50 API calls per minute per API key.

**Redis key:** `tecpey:risk:apicall:{keyId}:{minBucket}` TTL=70s

---

## Enforcement Levels (Phase 35)

Risk enforcement levels are stored in Redis `tecpey:risk:level:{userId}`.

| Level | Effect | Auto-release |
|-------|--------|-------------|
| `review` | Flag only — actions allowed, warning may be returned | 5 minutes |
| `trade_blocked` | Order placement rejected (HTTP 403 `account_trade_restricted`) | 1 hour |
| `withdraw_blocked` | Withdrawal rejected | 24 hours |
| `all_blocked` | All authenticated actions rejected | Manual |

### Who sets enforcement levels?

- **Risk engine:** `high` severity events → `trade_blocked` (1-hour TTL)
- **Risk engine:** `duplicate_request` medium → `review` (5-min TTL)
- **Admin:** Can set any level manually via `setRiskLevel(userId, level, ttl)`
- **Auto-release:** Redis TTL — no manual intervention needed for timed blocks

### Who checks enforcement levels?

- `POST /api/orders` → `enforceTradeAllowed(userId)` (synchronous, Redis-only)
- Future: `POST /api/withdrawals` → `enforceWithdrawAllowed(userId)`

### Performance

The enforcement check is a single Redis GET on the hot path. No DB round-trip. Adds < 1ms under normal load.

**Graceful degrade:** Redis unavailable → allow (risk engine is advisory, not the last line of defense).

---

## Risk Event Schema

```sql
risk_events (
  id          UUID PRIMARY KEY,
  user_id     TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
  market      TEXT,
  ip          TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ
)
```

---

## Admin API

```typescript
import { setRiskLevel, clearRiskLevel, getRiskLevel } from "@/lib/security/risk-enforcement";

// Flag a user for manual review
await setRiskLevel(userId, "review", 86400); // 24-hour

// Block trading
await setRiskLevel(userId, "trade_blocked", 3600); // 1-hour

// Release a block
await clearRiskLevel(userId);

// Get current level
const level = await getRiskLevel(userId); // "trade_blocked" | null
```

---

## Failure Modes

| Scenario | Behaviour |
|----------|-----------|
| Redis unavailable | All risk counters return 0 — no events. Enforcement checks return null (allow). |
| PostgreSQL unavailable | Risk events lost for that window. Logged. Orders proceed. |
| Risk engine throws | Caught internally — order execution unaffected. |

---

## Phase 36 Roadmap

| Feature | Description |
|---------|-------------|
| ML-based anomaly detection | Baseline order pattern per user; flag deviations |
| Cross-market wash trade detection | Coordinated self-trade across markets |
| Velocity checks | Net position movement rate limits |
| Admin dashboard | Real-time risk event feed + enforcement controls |
