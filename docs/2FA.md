# Two-Factor Authentication (TOTP) — Phase 35

> RFC 6238-compliant TOTP 2FA with AES-256-GCM secret storage and one-time backup codes.

---

## Overview

TecPey 2FA uses TOTP (Time-based One-Time Password, RFC 6238):

- **Algorithm:** HOTP (HMAC-SHA1) with 30-second time step
- **Code length:** 6 digits
- **Clock tolerance:** ±30 seconds (window ±1)
- **Compatible apps:** Google Authenticator, Authy, 1Password, Bitwarden, Microsoft Authenticator

---

## Secret Storage

TOTP secrets are **never stored in plaintext**. Storage flow:

```
generateTotpSecret() → raw_base32 (20 bytes / 160-bit entropy)
                          │
                          ▼
encryptTotpSecret(raw_base32)
  → AES-256-GCM(key=TECPEY_2FA_SECRET, iv=random_12_bytes, plaintext=raw_base32)
  → base64(iv + authTag + ciphertext)
                          │
                          ▼
                   stored in user_2fa.encrypted_secret
```

The raw secret is returned to the user **once** (during enrollment QR display) and never stored.

The `TECPEY_2FA_SECRET` environment variable must be at least 32 characters.

---

## Enrollment Flow

### Step 1: GET /api/auth/2fa/enroll

Generates a new TOTP secret and backup codes.

**Response:**
```json
{
  "ok": true,
  "otpAuthUri": "otpauth://totp/TecPey:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=TecPey&algorithm=SHA1&digits=6&period=30",
  "secret": "JBSWY3DPEHPK3PXP",
  "backupCodes": ["AB3CD4EF", "GH5IJ6KL", "..."]
}
```

The `otpAuthUri` should be rendered as a QR code on the client. The `secret` allows manual entry. **Both the secret and backup codes are shown once only** — the user must save them before confirming.

### Step 2: POST /api/auth/2fa/enroll

User scans the QR code in their authenticator app and submits the first code to confirm enrollment.

**Body:**
```json
{ "code": "123456" }
```

**Response:** `{ "ok": true, "enabled": true }`

2FA is NOT enabled until this confirmation step succeeds, preventing ghost enrollments.

---

## Backup Codes

10 backup codes are generated at enrollment (8 characters each, uppercase alphanumeric, no ambiguous chars like `0`/`O`/`1`/`I`).

Storage: `HMAC-SHA256(TECPEY_2FA_SECRET, code)` per code — hashed, not encrypted.

**Usage:** `POST /api/auth/2fa/backup`

```json
{ "code": "AB3CD4EF" }
```

Each code is **one-time use** — it is removed from the stored hashes on successful verification.

**Response:** `{ "ok": true, "verified": true, "remainingCodes": 9 }`

If a user runs out of backup codes, they must contact support (admin override path).

---

## Verification

### During re-prompt (risk escalation, sensitive action)

`POST /api/auth/2fa/verify`

```json
{ "code": "123456" }
```

Returns `{ "verified": true, "userId": "..." }`.

### During pre-auth flow

When the login flow requires 2FA before issuing a session:

1. Login endpoint stores a pre-auth token in Redis (`tecpey:preauth:{token}`, TTL=5 minutes)
2. Client calls `POST /api/auth/2fa/verify` with `{ "code": "...", "preAuthToken": "..." }`
3. Pre-auth token is consumed (deleted on first use) and userId is recovered
4. Session is issued

---

## Disable

`POST /api/auth/2fa/disable`

**Body:**
```json
{ "code": "123456" }
```

Requires current TOTP code.

**Admin override** (admin-only):
```json
{ "adminOverride": true }
```

---

## Schema

```sql
user_2fa (
  user_id              TEXT PRIMARY KEY,
  encrypted_secret     TEXT NOT NULL,           -- AES-256-GCM encrypted base32
  backup_code_hashes   TEXT[] NOT NULL,         -- HMAC-SHA256 hashed backup codes
  enabled              BOOLEAN NOT NULL,
  enabled_at           TIMESTAMPTZ,
  last_used_at         TIMESTAMPTZ
)
```

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| GET /api/auth/2fa/enroll | 10/min |
| POST /api/auth/2fa/enroll | 10/min |
| POST /api/auth/2fa/verify | 10/min |
| POST /api/auth/2fa/disable | 5/min |
| POST /api/auth/2fa/backup | 5/min |

---

## Security Properties

| Property | Implementation |
|----------|---------------|
| Secret never stored in plaintext | AES-256-GCM encryption at rest |
| Secret returned once only | Only in GET /enroll response; never retrievable after |
| Backup codes hashed | HMAC-SHA256 — not reversible |
| Backup codes one-time use | Removed from array on successful use |
| Clock tolerance | ±30s (window=1) — prevents time drift lockouts |
| Rate limited | 5–10 per minute per IP |
| Admin override | Logged to audit trail |
