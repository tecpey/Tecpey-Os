# Security Architecture — Phase 34

> Enterprise security foundation: JWT hardening, session management, API keys, risk engine, audit trail.

---

## JWT Hardening

### jti (JWT ID)

Every new session token includes a `jti` claim (UUID v4). This enables individual token revocation without rotating the signing secret.

- **Before Phase 34:** No jti — tokens could not be individually revoked
- **Phase 34+:** jti generated on every `signUnifiedSession()` call; stored in Redis on revocation

### Revocation

**Revocation list:** `tecpey:revoked:jti:{jti}` → Redis key with TTL = remaining token lifetime

On revocation (logout, logout-all, admin kick):
1. Write jti to Redis with TTL
2. Mark `user_sessions` row as revoked in PostgreSQL

On session verification (route handlers that call `isJtiRevoked`):
1. `verifyUnifiedSession()` — validates signature + expiry (unchanged, edge-compatible)
2. `isJtiRevoked(jti)` — checks Redis revocation list

**Failure mode:** If Redis is unavailable, `isJtiRevoked` returns `false` (allow). The PostgreSQL session table provides a durable audit trail and can be replayed into Redis on recovery.

### Token extraction without verification

`extractJtiFromToken(token)` — base64url-decodes the JWT payload without signature verification. Used on logout path to extract jti without needing the signing key.

`extractExpFromToken(token)` — same pattern for expiration time.

---

## Session Management

### user_sessions table

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | jti from JWT |
| user_id | TEXT | Account ID |
| device_info | TEXT | Truncated User-Agent (500 chars) |
| ip | TEXT | Client IP (80 chars) |
| created_at | TIMESTAMPTZ | Login time |
| last_used_at | TIMESTAMPTZ | Updated on every authenticated request |
| expires_at | TIMESTAMPTZ | Matches JWT exp |
| is_revoked | BOOLEAN | Set to TRUE on logout |
| revoked_at | TIMESTAMPTZ | Revocation timestamp |

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/auth/sessions` | List active sessions (last 50) |
| DELETE | `/api/auth/sessions` | Logout all devices (keeps current session) |
| DELETE | `/api/auth/sessions/[id]` | Revoke a specific session |

Rate limits: 30/min for list; 5/min for logout-all; 20/min for single revoke.

### Session registration

Call `registerSession({ jti, userId, deviceInfo, ip, expiresAt })` after a successful login that calls `signUnifiedSession()`.

---

## API Key Management

### Key format

```
tecpey_{8-char-prefix}_{48-char-random}
```

Example: `tecpey_aB3xYz7q_dGhJkLmNoPqRsTuVwXyZa1B2c3D4e5F6g7H8i9J0k1L2m3N4`

### Storage

| Field | Value |
|-------|-------|
| key_prefix | First 8 chars (display only) |
| key_hash | SHA-256(plaintext_key) |

**Plaintext is returned once** (on creation or rotation) and **never stored**. This matches the GitHub PAT / Binance API key pattern.

### Permissions

| Permission | Description |
|------------|-------------|
| `read` | Market data, order history, wallet balance |
| `trade` | Place and cancel orders |
| `withdraw` | Initiate withdrawals (Phase 35+) |

Permissions are additive. A key with `["read", "trade"]` can do both.

### Lifecycle

| Action | Endpoint |
|--------|----------|
| Create | `POST /api/api-keys` |
| List | `GET /api/api-keys` |
| Disable | `PATCH /api/api-keys/[id]` `{ action: "disable" }` |
| Enable | `PATCH /api/api-keys/[id]` `{ action: "enable" }` |
| Rotate | `PATCH /api/api-keys/[id]` `{ action: "rotate" }` |
| Delete | `DELETE /api/api-keys/[id]` |

### IP whitelist

Optional `ipWhitelist: string[]` restricts key usage to listed IPs. `null` = allow all.

### Limits

- Max 20 active keys per user
- Key name: 100 chars max
- Expiration: optional ISO 8601 date

---

## Rate Limiting (Extended)

| Scope | Function | Use case |
|-------|----------|----------|
| Per-IP | `rateLimit(req, opts)` | Public endpoints, unauthenticated |
| Per-User | `rateLimitUser(req, { userId, ... })` | Authenticated private endpoints |
| Per-API-Key | `rateLimitApiKey({ keyId, ... })` | API key authenticated calls |

### Limits by endpoint category

| Category | Limit | Window |
|----------|-------|--------|
| Public REST (read) | 480/min | 60s |
| Private REST (orders) | 120/min | 60s |
| Order placement | 30/min | 60s |
| Order cancel | 30/min | 60s |
| Auth endpoints | 10/min | 60s |
| Session management | 30/min | 60s |
| Logout all | 5/min | 60s |
| API key create | 10/min | 60s |
| Admin | 30/min | 60s |
| WebSocket (subscriptions) | 100 max per connection | — |

---

## Audit Trail

### Design

- Append-only — no UPDATE/DELETE ever run against `audit_events`
- Fire-and-forget — `writeAudit()` is non-blocking; failures logged, not propagated
- All sensitive actions write an audit event

### Schema

```sql
audit_events (
  id            UUID PRIMARY KEY,
  actor_id      TEXT NOT NULL,        -- user/admin performing the action
  action        TEXT NOT NULL,        -- action type (see list below)
  resource_type TEXT,                 -- "order", "session", "api_key", etc.
  resource_id   TEXT,                 -- UUID of the affected resource
  ip            TEXT,                 -- client IP
  user_agent    TEXT,                 -- browser/client info
  metadata      JSONB,               -- action-specific context
  created_at    TIMESTAMPTZ
)
```

### Audited actions

| Action | Trigger |
|--------|---------|
| `login` | Successful login |
| `logout` | Single logout |
| `logout_all` | Revoke all sessions |
| `session_revoked` | Individual session revoke |
| `api_key_created` | New API key created |
| `api_key_rotated` | API key rotated |
| `api_key_disabled` | API key disabled |
| `api_key_deleted` | API key deleted |
| `order_placed` | Order submitted to engine |
| `order_cancelled` | Order cancelled |
| `wallet_deposit` | Deposit credited (Phase 35+) |
| `wallet_withdrawal` | Withdrawal initiated (Phase 35+) |
| `admin_action` | Admin performed action |
| `risk_event` | Risk engine signal |
| `password_changed` | Password update (Phase 35+) |
| `2fa_enabled` / `2fa_disabled` | 2FA state change (Phase 35+) |

---

## Risk Engine

See `docs/RISK_ENGINE.md` for full documentation.

---

## Compliance Interfaces

See `docs/COMPLIANCE.md` for provider interface specifications.
