# Risk Engine — Phase 34

> Lightweight real-time risk detection. Emit events only — no enforcement in Phase 34.

---

## Architecture

```
Order placement request
  │
  ├── [ASYNC, fire-and-forget] checkOrderRisk()
  │     │
  │     ├── Redis INCR — frequency counter
  │     ├── Redis INCR — burst counter
  │     ├── Redis GET  — last known IP
  │     └── Redis GET  — dedup fingerprint
  │           │
  │           └── (if threshold exceeded) → INSERT risk_events + writeAudit()
  │
  └── [MAIN PATH] engine.placeOrder() — unaffected by risk engine
```

The risk engine runs entirely on the async path. It **never blocks or delays** order execution. Phase 35+ adds enforcement: on high-severity events, orders can be blocked or accounts flagged for review.

---

## Risk Checks

### 1. order_frequency_high (severity: medium)

**Threshold:** > 10 orders per minute per user per market.

**Detection:** Redis INCR key `tecpey:risk:freq:{userId}:{market}:{minBucket}` with TTL=70s. Bucket rotates each minute.

**Rationale:** Aggressive order placement typically indicates wash trading, spoofing, or a runaway bot. 10/min is generous for human traders and tight enough to catch automated abuse.

---

### 2. order_burst (severity: low)

**Threshold:** > 3 orders within 5 seconds per user.

**Detection:** Redis INCR key `tecpey:risk:burst:{userId}` with TTL=5s.

**Rationale:** Human traders rarely place 4 orders in 5 seconds. A bot that ignores the order frequency limit (e.g. across markets) would still be caught here.

---

### 3. ip_switch_detected (severity: low)

**Threshold:** IP changes within a 5-minute window.

**Detection:** Redis GET previous IP from `tecpey:risk:ip:{userId}` (TTL=300s), compare with current IP.

**Rationale:** IP switching during an active session can indicate session hijacking. Low severity alone; combine with other signals in Phase 35.

---

### 4. duplicate_request (severity: medium)

**Threshold:** Same order fingerprint submitted within 5 seconds.

**Fingerprint:** `{market}:{side}:{quantity}:{price}:{userId}` (SHA-256 in future; plain string in Phase 34)

**Detection:** Redis GET `tecpey:risk:dedup:{fingerprint}` (TTL=5s). On first submission, key is set.

**Rationale:** Prevents accidental double-click orders and detects replay attacks. Medium severity because legitimate users occasionally double-submit.

---

### 5. suspicious_api_behavior (severity: medium)

**Threshold:** > 50 API calls per minute per API key.

**Detection:** Redis INCR `tecpey:risk:apicall:{keyId}:{minBucket}` with TTL=70s.

**Rationale:** Legitimate trading bots rarely exceed 50 calls/min per key. Consistent over-calling suggests rate limit bypass attempts or a misconfigured bot.

---

## Risk Event Schema

```sql
risk_events (
  id          UUID PRIMARY KEY,
  user_id     TEXT NOT NULL,
  event_type  TEXT NOT NULL,     -- one of the 5 types above
  severity    TEXT NOT NULL,     -- low | medium | high
  market      TEXT,              -- relevant market if applicable
  ip          TEXT,              -- client IP at time of event
  metadata    JSONB,             -- event-specific context
  created_at  TIMESTAMPTZ
)
```

Indexed by `(user_id, created_at DESC)` and `(event_type, created_at DESC)` for efficient queries.

---

## API

### Get recent risk events (admin)

```
GET /api/ws/metrics → pubSub.metrics (connected nodes, event counts)
```

Direct query via `getRecentRiskEvents(userId, limit)` in admin tooling.

---

## Failure Modes

| Scenario | Behaviour |
|----------|-----------|
| Redis unavailable | All counters return 0 — no risk events emitted. Orders proceed normally. |
| PostgreSQL unavailable | Risk events lost for that window. Logged as error. Orders proceed. |
| Risk engine throws | Caught internally — order execution is unaffected. |

---

## Phase 35 Enforcement Roadmap

In Phase 35, the risk engine will grow enforcement capabilities:

| Severity | Action |
|----------|--------|
| `low` | Alert only (current Phase 34 behavior) |
| `medium` | Temporary order rate reduction for user |
| `high` | Account flagged for manual review; optional 2FA re-prompt |

Implementation: the engine checks a "user_risk_level" Redis key set by the risk engine. If level is `frozen`, order placement returns `account_under_review`.
