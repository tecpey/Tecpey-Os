# WebAuthn / Passkeys — TecPey Phase 36

Zero-dependency native FIDO2 implementation. No `@simplewebauthn` or similar; all crypto via Node.js built-ins.

## Supported Algorithms

| Algorithm | OID | Support |
|-----------|-----|---------|
| ES256 (P-256 ECDSA) | -7 | Full |
| RS256 (RSA-PKCS1-v1_5) | -257 | Accepted at registration; not yet verified (rare path) |

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/webauthn/register/challenge` | Required | Get registration challenge |
| POST | `/api/auth/webauthn/register/verify` | Required | Verify + store new credential |
| POST | `/api/auth/webauthn/auth/challenge` | Optional | Get authentication challenge |
| POST | `/api/auth/webauthn/auth/verify` | None | Verify assertion + issue session |
| GET | `/api/auth/webauthn/credentials` | Required | List registered credentials |
| PATCH | `/api/auth/webauthn/credentials/[id]` | Required | Rename credential |
| DELETE | `/api/auth/webauthn/credentials/[id]` | Required | Revoke credential |

## Registration Flow

```
Client                                   Server
  │                                        │
  ├── POST /register/challenge ──────────►│
  │                                        ├─ generateChallenge() → 32 random bytes base64url
  │                                        ├─ storeWebAuthnChallenge(challenge, userId) → Redis TTL 300s
  │                                        ├─ listCredentials(userId) → excludeCredentials
  │◄─────────────── {challenge, rp, user, pubKeyCredParams, excludeCredentials} ──┤
  │                                        │
  ├── navigator.credentials.create() ─────►│ (browser ↔ authenticator)
  │                                        │
  ├── POST /register/verify ────────────►│
  │   {response: {attestationObject,       │
  │     clientDataJSON}, deviceName}       ├─ verifyWebAuthnRegistration()
  │                                        │   ├─ parse clientDataJSON: type=create, origin✓, challenge consumed
  │                                        │   ├─ parse attestationObject CBOR → authData
  │                                        │   ├─ verify: rpIdHash, UP flag set
  │                                        │   ├─ extract credentialId + COSE ES256 key
  │                                        │   └─ INSERT webauthn_credentials
  │◄──────────── {credentialId, aaguid} ──┤
```

## Authentication Flow

```
Client                                   Server
  │                                        │
  ├── POST /auth/challenge ─────────────►│
  │   {userId?}                            ├─ generateChallenge()
  │                                        ├─ storeWebAuthnChallenge(challenge, userId ?? "anon")
  │                                        ├─ allowCredentials from DB (or [] for resident keys)
  │◄──── {challenge, allowCredentials} ──┤
  │                                        │
  ├── navigator.credentials.get() ─────────►│ (browser ↔ authenticator)
  │                                        │
  ├── POST /auth/verify ────────────────►│
  │   {userId?, response}                  ├─ verifyWebAuthnAuthentication()
  │                                        │   ├─ parse clientDataJSON: type=get, origin✓, challenge consumed
  │                                        │   ├─ verify rpIdHash, UP+UV flags
  │                                        │   ├─ verify signCount > stored (replay prevention)
  │                                        │   ├─ reconstruct SPKI DER from stored COSE key
  │                                        │   ├─ verify ECDSA signature: SHA-256(authData ∥ SHA-256(clientDataJSON))
  │                                        │   └─ UPDATE counter, last_used_at
  │                                        ├─ Fetch user from DB
  │                                        ├─ signUnifiedSession() → access token (4h)
  │                                        ├─ issueRefreshToken() → refresh token (30d)
  │◄─── {authenticated: true} + cookies ─┤
```

## Cryptographic Details

### COSE ES256 Key Parsing

The authenticator returns a COSE key map (CBOR format). We extract:
- `-2` → X coordinate (32 bytes)
- `-3` → Y coordinate (32 bytes)

### P-256 SPKI DER Construction

```
3059          SEQUENCE
  3013        SEQUENCE (algorithm identifier)
    0607 2a8648ce3d020106  OID 1.2.840.10045.2.1 (ecPublicKey)
    0608 2a8648ce3d030107  OID 1.2.840.10045.3.1.7 (P-256)
  0342 00 04  BIT STRING (uncompressed point prefix 0x04)
    <X 32 bytes>
    <Y 32 bytes>
```

Prefix (27 bytes): `3059301306072a8648ce3d020106082a8648ce3d03010703420004`

### Signature Verification

```
verificationData = authData ∥ SHA-256(clientDataJSON)
verify: ECDSA-P256-SHA256(publicKey, verificationData, signature)
```

Uses Node.js `crypto.createVerify('SHA256').verify({ key: spkiDer, format: 'der', type: 'spki' })`.

## Database Schema

```sql
CREATE TABLE webauthn_credentials (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,  -- base64url
  public_key    TEXT NOT NULL,         -- base64url CBOR COSE key bytes
  counter       INTEGER NOT NULL DEFAULT 0,
  device_name   TEXT NOT NULL DEFAULT 'Authenticator',
  aaguid        TEXT,
  transports    TEXT[] NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ
);
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SITE_URL` | Yes | Used to derive `rpId` (e.g. `https://tecpey.com` → `rpId: "tecpey.com"`) |
| `WEBAUTHN_RP_ID` | No | Override the Relying Party ID (default: derived from NEXT_PUBLIC_SITE_URL hostname) |

## Security Properties

- **Challenge freshness**: Redis TTL 300s; consumed atomically (GET+DEL pipeline) — no replay
- **Counter monotonicity**: `counter > stored_counter` enforced; clone detection
- **Credential exclusion**: `excludeCredentials` prevents double-registration
- **UV flag**: `userVerification: "required"` on authentication
- **Origin binding**: `clientDataJSON.origin` must match server origin exactly
