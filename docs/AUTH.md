# Authentication Architecture — Phase 35

> Enterprise-grade authentication: jti revocation, refresh token rotation, TOTP 2FA, HMAC-signed API keys.

---

## Overview

TecPey uses a layered authentication model introduced progressively across phases:

| Layer | Mechanism | Phase |
|-------|-----------|-------|
| Unified session | HS256 JWT cookie (`tecpey_session`) | 22 |
| jti revocation | Redis `tecpey:revoked:jti:{jti}` | 34 |
| jti check on every request | `getCanonicalSession` + 30s cache | 35 |
| Refresh token rotation | `tecpey_refresh` cookie + `refresh_tokens` DB table | 35 |
| TOTP 2FA | RFC 6238 HOTP/TOTP + AES-256-GCM encrypted secret | 35 |
| HMAC-signed API keys | `X-TECPEY-SIGNATURE` header | 35 |

---

## Token Model (Phase 35)

### Access Token (`tecpey_session`)

| Property | Value |
|----------|-------|
| Algorithm | HS256 |
| TTL (new logins) | 4 hours |
| TTL (pre-Phase 35 tokens) | 30 days (backward compat — unchanged) |
| Claims | `role`, `v`, `jti`, `accountId`, `studentId`, `email` |
| Cookie flags | `HttpOnly`, `Secure` (prod), `SameSite=Lax`, `Path=/` |

### Refresh Token (`tecpey_refresh`)

| Property | Value |
|----------|-------|
| Algorithm | HS256 |
| Secret | `TECPEY_REFRESH_SECRET` (or `TECPEY_SESSION_SECRET` prefixed `refresh:`) |
| TTL | 30 days |
| Claims | `sub` (userId), `jti`, `fid` (family ID) |
| Cookie flags | `HttpOnly`, `Secure` (prod), `SameSite=Strict`, `Path=/api/auth/refresh` |
| Storage | `refresh_tokens` PostgreSQL table |

The refresh cookie `Path=/api/auth/refresh` means browsers only send it to the refresh endpoint — it never leaks to other API routes.

---

## Session Lifecycle

```
POST /api/academy-auth (login)
  │
  ├── signUnifiedSession()      → tecpey_session cookie (4h)
  ├── issueRefreshToken()       → tecpey_refresh cookie (30d)
  ├── registerSession()         → user_sessions DB row (fire-and-forget)
  └── writeAudit("login")

GET  /any-authenticated-route
  │
  └── getCanonicalSession()
        └── verifyUnifiedSession()    // signature + expiry
              └── isJtiRevoked()      // Redis check (30s cache)

POST /api/auth/refresh
  │
  ├── verifyRefreshToken()      // signature + DB lookup
  ├── revokeRefreshToken(old)   // rotate: revoke old
  ├── issueRefreshToken(new)    // new refresh token (same family)
  ├── signUnifiedSession()      // new access token
  └── registerSession()

DELETE /api/academy-auth (logout)
  │
  ├── revokeJti()               // Redis revocation (immediate)
  ├── revokeSession()           // DB mark as revoked
  ├── revokeRefreshToken()      // invalidate refresh token
  ├── clearUnifiedSessionCookie()
  ├── clearRefreshCookie()
  └── writeAudit("logout")
```

---

## jti Revocation

Every access token carries a `jti` (JWT ID, UUID v4). On revocation:

1. `revokeJti(jti, exp)` — writes `tecpey:revoked:jti:{jti}` to Redis with TTL = remaining token lifetime.
2. `getCanonicalSession()` checks `isJtiRevoked(jti)` on every authenticated request.
3. A 30-second in-memory cache per jti avoids Redis hammering on burst requests.

**Failure mode:** Redis unavailable → `isJtiRevoked` returns `false` (allow). The PostgreSQL session table provides a durable audit trail.

---

## Refresh Token Rotation

### Normal rotation

```
Client → POST /api/auth/refresh  (with tecpey_refresh cookie)
Server:
  1. Verify signature
  2. DB lookup — confirm not revoked, not expired
  3. Revoke old refresh token
  4. Issue new access + refresh token pair (same family_id)
  5. Return Set-Cookie headers
```

### Reuse detection (session hijacking)

If a previously rotated (already-revoked) refresh token is presented:
1. The DB lookup finds the token with `is_revoked = TRUE`.
2. **The entire token family is revoked** (`revokeFamily(familyId)`).
3. 401 returned — the user must re-login.

The `family_id` links all tokens in a session chain. Stealing a leaked refresh token and using it after the legitimate user has already rotated it triggers full session invalidation.

---

## 2FA — See `docs/2FA.md`

---

## Session Registration

Every login registers a row in `user_sessions`:

```sql
user_sessions (
  id TEXT PRIMARY KEY,    -- jti
  user_id TEXT,
  device_info TEXT,       -- truncated User-Agent (500 chars)
  ip TEXT,
  created_at, last_used_at, expires_at,
  is_revoked, revoked_at
)
```

List sessions: `GET /api/auth/sessions`
Revoke one: `DELETE /api/auth/sessions/{id}`
Revoke all: `DELETE /api/auth/sessions`

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TECPEY_SESSION_SECRET` | Yes | Signs access tokens (HS256) |
| `TECPEY_REFRESH_SECRET` | Recommended | Signs refresh tokens (defaults to `refresh:{SESSION_SECRET}`) |
| `TECPEY_2FA_SECRET` | Yes (for 2FA) | 32+ char AES-256-GCM key for TOTP secret encryption |
| `REDIS_URL` | Recommended | jti revocation + rate limiting |

---

## Backward Compatibility

- Existing `tecpey_session` cookies with 30-day TTL **continue to work** until natural expiry.
- `getCanonicalSession()` accepts both old (no `jti`) and new tokens; old tokens skip the revocation check.
- The dual-token model (access + refresh) applies only to new logins (Phase 35+).
- No forced re-login is required for existing users.
