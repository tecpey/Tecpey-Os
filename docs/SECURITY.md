# Security Architecture — Phase 35

> Enterprise security: JWT hardening, refresh token rotation, TOTP 2FA, HMAC API keys, CIDR whitelists, risk enforcement.

---

## JWT Hardening

### jti (JWT ID)

Every new session token includes a `jti` claim (UUID v4). Enables individual token revocation.

**Phase 34:** jti generated, stored in Redis on revocation.
**Phase 35:** jti checked on **every authenticated request** via `getCanonicalSession()`.

### Revocation check

```
getCanonicalSession(req)
  └── verifyUnifiedSession(token)       // HS256 signature + expiry
        └── isJtiRevoked(jti)           // Redis O(1) lookup
              └── 30s in-memory cache   // avoids Redis hammering
```

**Cache:** per-jti, 30-second TTL, max 2,000 entries. Protects against burst Redis round-trips.
**Failure mode:** Redis unavailable → allow (graceful degrade).

### Token extraction without verification

`extractJtiFromToken(token)` — base64url-decode without verification. Used on logout.
`extractExpFromToken(token)` — same, for TTL calculation.

---

## Token Model

| Cookie | TTL | Path | SameSite |
|--------|-----|------|----------|
| `tecpey_session` (access) | 4h (new logins) | `/` | `Lax` |
| `tecpey_refresh` | 30d | `/api/auth/refresh` | `Strict` |

Existing 30-day `tecpey_session` cookies continue to work (backward compat).

---

## Refresh Token Rotation

See `docs/AUTH.md` for full lifecycle. Key security properties:

- **Family-based reuse detection** — stolen + replayed token triggers full session invalidation
- **PostgreSQL-backed** — multi-instance consistency without Redis dependency
- **Path-restricted cookie** — refresh cookie only sent to `/api/auth/refresh`
- **Atomic revocation** — old token revoked before new tokens are issued

---

## TOTP 2FA

See `docs/2FA.md`. Security properties:

- **AES-256-GCM** encrypted secret at rest
- **HMAC-SHA256** hashed backup codes (one-time use)
- **Pre-auth token pattern** for 2FA-required login flow (Redis, 5-min TTL)
- **Admin override** with audit trail

---

## HMAC-Signed API Key Requests

### Headers required

```
X-TECPEY-APIKEY:    tecpey_{prefix}_{body}
X-TECPEY-TIMESTAMP: 1735689600000          (epoch ms)
X-TECPEY-SIGNATURE: {hex}                  (HMAC-SHA256)
```

### Canonical string

```
METHOD\n
/path/to/endpoint\n
TIMESTAMP_MS\n
SHA256(requestBody or "")
```

### Signing key

The API key plaintext itself is the HMAC key — it is never stored server-side (only SHA-256 hash is stored). This means only the holder of the plaintext can produce valid signatures.

### Validation chain

1. **Timestamp window** — reject if `|now - timestamp| > 5 minutes`
2. **Signature** — HMAC-SHA256(rawKey, canonical) with timing-safe comparison
3. **Nonce** — Redis `tecpey:sig:nonce:{signature}` SET NX, TTL=5m (prevents replay)
4. **Key lookup** — SHA-256 hash lookup in `api_keys` table
5. **Permission** — required permission in key's permission set
6. **IP whitelist** — CIDR matching (if whitelist configured)

### Backward compatibility

Cookie session auth remains unchanged. API key auth is an alternative path — existing clients are unaffected.

---

## CIDR IP Whitelist

API keys support CIDR notation in `ip_whitelist`:

| Format | Example |
|--------|---------|
| Single IPv4 | `"1.2.3.4"` |
| IPv4 CIDR | `"192.168.0.0/24"` |
| Single IPv6 | `"::1"` |
| IPv6 CIDR | `"2001:db8::/32"` |

Implementation: `src/lib/security/cidr.ts` — zero dependencies, pure bitwise arithmetic.

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
| POST | `/api/auth/refresh` | Exchange refresh token for new access + refresh pair |

---

## API Key Management

See `docs/API_KEYS.md`.

---

## Risk Engine & Enforcement

### Risk levels (Phase 35)

| Level | Effect |
|-------|--------|
| `review` | Flag only — user can still trade (5-min auto-release) |
| `trade_blocked` | Order placement rejected (1-hour auto-release on high-severity) |
| `withdraw_blocked` | Withdrawal rejected |
| `all_blocked` | All authenticated actions rejected |

Stored in Redis `tecpey:risk:level:{userId}`. Auto-expiring (no manual intervention required for timed blocks).

**Enforcement is synchronous in the request path** but Redis-only — never adds a DB round-trip.
**Graceful degrade:** Redis unavailable → allow.

See `docs/RISK_ENGINE.md`.

---

## Security Headers

All responses include:

| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | camera, microphone, geolocation, payment disabled |
| `X-XSS-Protection` | `0` (browser auditor disabled per OWASP) |

CSP is applied via `proxy.ts` (nonce-based, per-request).

Cookies: `HttpOnly`, `Secure` (production), `SameSite=Lax` (access), `SameSite=Strict` (refresh).

---

## Rate Limiting

| Category | Limit | Window |
|----------|-------|--------|
| Login / signup | 10/min | 60s |
| Token refresh | 30/min | 60s |
| 2FA enroll | 10/min | 60s |
| 2FA verify | 10/min | 60s |
| 2FA disable | 5/min | 60s |
| 2FA backup code | 5/min | 60s |
| Session list | 30/min | 60s |
| Session revoke all | 5/min | 60s |
| Order placement | 30/min | 60s |
| API key create | 10/min | 60s |

---

## Audit Trail

All security events are written to `audit_events` (append-only, fire-and-forget).

| Action | Trigger |
|--------|---------|
| `login` | Successful login, token refresh |
| `logout` | Single logout, failed refresh |
| `logout_all` | Revoke all sessions |
| `session_revoked` | Individual session revoke |
| `2fa_enabled` | 2FA enrolled |
| `2fa_disabled` | 2FA disabled |
| `api_key_created` | New API key |
| `api_key_rotated` | API key rotated |
| `api_key_disabled` | API key disabled |
| `api_key_deleted` | API key deleted |
| `order_placed` | Order submitted |
| `order_cancelled` | Order cancelled |
| `risk_event` | Risk engine signal |

---

## Compliance Interfaces

See `docs/COMPLIANCE.md`.
