# API Key Management — Phase 34

> Production-grade API key system for programmatic trading access.

---

## Overview

TecPey API keys allow programmatic access without sharing your session credentials. They follow the same security model as Binance and GitHub PATs:

- Keys are generated once and only displayed once
- Only a SHA-256 hash is stored in the database
- Keys can be scoped to specific permissions
- Optional IP whitelist restricts usage to known IPs
- Optional expiration date

---

## Key Format

```
tecpey_{8-char-prefix}_{48-char-random-body}
```

The prefix is also stored in the database for display/identification. The full plaintext is **never stored** — only `SHA-256(plaintext)`.

---

## Permissions

| Permission | Access |
|------------|--------|
| `read` | GET endpoints: markets, orders, trades, wallet balances, order book |
| `trade` | POST /api/orders, DELETE /api/orders/[id] |
| `withdraw` | POST /api/withdrawals (Phase 35+) |

Permissions are additive. Assign only what is needed.

---

## Endpoints

### List API Keys

```
GET /api/api-keys
Authorization: session cookie required
```

Returns all API keys (active and inactive). **Does not return key plaintext** — only prefix and metadata.

**Response:**
```json
{
  "ok": true,
  "keys": [
    {
      "id": "uuid",
      "name": "Trading Bot",
      "keyPrefix": "aB3xYz7q",
      "permissions": ["read", "trade"],
      "ipWhitelist": ["1.2.3.4"],
      "expiresAt": null,
      "lastUsedAt": "2026-06-30T...",
      "isActive": true,
      "createdAt": "2026-06-01T...",
      "updatedAt": "2026-06-30T..."
    }
  ]
}
```

---

### Create API Key

```
POST /api/api-keys
Authorization: session cookie required
```

**Body:**
```json
{
  "name": "Trading Bot",
  "permissions": ["read", "trade"],
  "ipWhitelist": ["1.2.3.4", "5.6.7.8"],
  "expiresAt": "2027-01-01T00:00:00Z"
}
```

`ipWhitelist` and `expiresAt` are optional.

**Response (201):**
```json
{
  "ok": true,
  "apiKey": { "id": "uuid", "name": "Trading Bot", "keyPrefix": "aB3xYz7q", ... },
  "plaintext": "tecpey_aB3xYz7q_dGhJkLmNoPqRsTuV..."
}
```

**Save the `plaintext` immediately — it will not be shown again.**

---

### Update API Key

```
PATCH /api/api-keys/{id}
Authorization: session cookie required
```

**Disable:**
```json
{ "action": "disable" }
```

**Enable:**
```json
{ "action": "enable" }
```

**Rotate (generates a new key):**
```json
{ "action": "rotate" }
```
Returns `{ "ok": true, "plaintext": "tecpey_..." }` — save the new plaintext immediately.

---

### Delete API Key

```
DELETE /api/api-keys/{id}
Authorization: session cookie required
```

Permanently removes the key. Cannot be undone.

---

## Using an API Key

Include the API key in the `X-API-Key` header:

```
GET /api/orders
X-API-Key: tecpey_aB3xYz7q_...
```

API key authentication is processed before session cookie authentication. If both are present, API key takes precedence.

**Phase 35 implementation:** Route handlers will call `validateApiKey(rawKey, requiredPermission, callerIp)` from `@/lib/security/api-keys`. For Phase 34, the validation function is implemented but not wired into route middleware.

---

## Security Recommendations

1. **Rotate keys periodically** — use the rotate endpoint
2. **Set IP whitelist** — restrict to your server IPs
3. **Set expiration** — don't create permanent keys for bots
4. **Minimal permissions** — read-only bots don't need `trade` permission
5. **One key per application** — makes rotation and revocation clean

---

## Error Codes

| Code | Meaning |
|------|---------|
| `invalid_format` | Key doesn't start with `tecpey_` |
| `key_not_found` | Hash not in database |
| `key_disabled` | Key is disabled |
| `key_expired` | Past expiration date |
| `insufficient_permissions` | Key lacks required permission |
| `ip_not_whitelisted` | Caller IP not in whitelist |
| `api_key_limit_reached` | Max 20 active keys per user |
