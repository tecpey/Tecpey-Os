# API Key Management — Phase 35

> Production-grade API key system with Binance/Kraken-style HMAC-SHA256 request signing and CIDR IP whitelists.

---

## Overview

TecPey API keys allow programmatic access without sharing your session credentials:

- Keys are SHA-256 hashed — plaintext is returned once and never stored
- Keys can be scoped to specific permissions
- Optional CIDR IP whitelist restricts usage to known IPs/ranges
- Optional expiration date
- HMAC-SHA256 request signing (Phase 35)

---

## Key Format

```
tecpey_{8-char-prefix}_{48-char-random-body}
```

The prefix is also stored in the database for display/identification.

---

## Permissions

| Permission | Access |
|------------|--------|
| `read` | GET endpoints: markets, orders, trades, wallet balances, order book |
| `trade` | POST /api/orders, DELETE /api/orders/[id] |
| `withdraw` | POST /api/withdrawals (Phase 36+) |

Permissions are additive. Assign only what is needed.

---

## Endpoints

### List API Keys

```
GET /api/api-keys
Authorization: session cookie required
```

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
  "ipWhitelist": ["1.2.3.4", "192.168.0.0/24"],
  "expiresAt": "2027-01-01T00:00:00Z"
}
```

**Response (201):**
```json
{
  "ok": true,
  "apiKey": { "id": "uuid", "name": "Trading Bot", "keyPrefix": "aB3xYz7q", ... },
  "plaintext": "tecpey_aB3xYz7q_dGhJkLmNoPqRsTuV..."
}
```

Save the `plaintext` immediately — it will not be shown again.

### Update / Rotate API Key

```
PATCH /api/api-keys/{id}
```

Actions: `disable`, `enable`, `rotate`

### Delete API Key

```
DELETE /api/api-keys/{id}
```

---

## Signed Request Authentication (Phase 35)

Every API key request must be signed with HMAC-SHA256.

### Required headers

```
X-TECPEY-APIKEY:    tecpey_{prefix}_{body}
X-TECPEY-TIMESTAMP: {epoch_milliseconds}
X-TECPEY-SIGNATURE: {hex_signature}
```

### Canonical string

```
{METHOD}\n{PATH}\n{TIMESTAMP_MS}\n{SHA256(body)}
```

For requests with no body (GET, DELETE), use `SHA256("")`.

### Signature

```
HMAC-SHA256(apiKeyPlaintext, canonicalString).toHex()
```

**The signing key is the API key plaintext itself.** Never store it — use it only to compute signatures.

### Example (Node.js)

```javascript
const crypto = require("crypto");

const method = "POST";
const path = "/api/orders";
const timestamp = Date.now().toString();
const body = JSON.stringify({ market: "BTCUSDT", side: "buy", type: "limit", quantity: "0.01", price: "65000" });

const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
const canonical = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
const signature = crypto.createHmac("sha256", API_KEY_PLAINTEXT).update(canonical).digest("hex");

fetch("https://api.tecpey.com/api/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-TECPEY-APIKEY": API_KEY_PLAINTEXT,
    "X-TECPEY-TIMESTAMP": timestamp,
    "X-TECPEY-SIGNATURE": signature,
  },
  body,
});
```

### Validation rules

| Rule | Value |
|------|-------|
| Timestamp window | ±5 minutes |
| Replay protection | Redis nonce (5-min TTL) |
| Signature comparison | Timing-safe |

---

## CIDR IP Whitelist

`ipWhitelist` supports:

| Format | Example |
|--------|---------|
| Single IPv4 | `"1.2.3.4"` |
| IPv4 CIDR | `"192.168.0.0/24"` |
| Single IPv6 | `"::1"` |
| IPv6 CIDR | `"2001:db8::/32"` |

---

## Limits

- Max 20 active keys per user
- Key name: 100 chars max
- Expiration: optional ISO 8601 date

---

## Error Codes

| Code | Meaning |
|------|---------|
| `missing_headers` | One or more required headers absent |
| `timestamp_expired` | `|now - X-TECPEY-TIMESTAMP| > 5 minutes` |
| `invalid_signature` | HMAC mismatch |
| `replayed_request` | Nonce already used within 5-minute window |
| `invalid_format` | Key doesn't start with `tecpey_` |
| `key_not_found` | Hash not in database |
| `key_disabled` | Key is disabled |
| `key_expired` | Past expiration date |
| `insufficient_permissions` | Key lacks required permission |
| `ip_not_whitelisted` | Caller IP not in CIDR whitelist |
| `api_key_limit_reached` | Max 20 active keys per user |

---

## Security Recommendations

1. **Sign every request** — use the HMAC-SHA256 signing flow
2. **Set IP whitelist** — restrict to your server IPs or CIDRs
3. **Set expiration** — don't create permanent keys for bots
4. **Minimal permissions** — read-only bots don't need `trade`
5. **One key per application** — makes rotation and revocation clean
6. **Rotate periodically** — use the rotate endpoint quarterly
