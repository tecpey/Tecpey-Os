# WebAuthn / Passkeys — TecPey Credential Authority

TecPey implements the user WebAuthn credential boundary with Node.js cryptography, typed Redis ceremony envelopes and transaction-coupled PostgreSQL evidence.

## Supported algorithm

| Algorithm | COSE | Status |
|---|---:|---|
| ES256 / P-256 ECDSA | `-7` | Supported for registration and authentication |
| RS256 | `-257` | Not advertised or accepted until a verifier and permanent tests exist |

## Endpoints

| Method | Path | Authority | Purpose |
|---|---|---|---|
| POST | `/api/auth/webauthn/register/challenge` | Strict authenticated session | Issue registration challenge |
| POST | `/api/auth/webauthn/register/verify` | Strict authenticated session | Verify and transactionally register credential |
| POST | `/api/auth/webauthn/auth/challenge` | Public, discoverable-only | Issue non-enumerating authentication challenge |
| POST | `/api/auth/webauthn/auth/verify` | Public ceremony | Verify assertion and atomically advance credential counter |
| GET | `/api/auth/webauthn/credentials` | Strict authenticated session | List the current principal's credentials |
| PATCH | `/api/auth/webauthn/credentials/[id]` | Strict authenticated session | Transactionally rename owned credential |
| DELETE | `/api/auth/webauthn/credentials/[id]` | Strict authenticated session | Transactionally revoke owned credential |

## Registration contract

1. The current strict canonical session supplies the principal and actor.
2. PostgreSQL credential discovery must succeed before a challenge is issued; database unavailability returns a truthful `503` rather than an empty exclusion list.
3. Redis stores a versioned registration envelope with a five-minute TTL, `NX` collision protection and atomic consume-once behavior.
4. New registrations require:
   - a discoverable resident credential;
   - user presence and user verification;
   - ES256;
   - exact RP ID, origin, challenge and credential-ID consistency.
5. Credential insertion and mandatory append-only evidence share one PostgreSQL transaction.
6. `ON CONFLICT DO NOTHING` is paired with `RETURNING id`; no insertion means no success response. A global credential conflict is rejected without transferring ownership.

The registration evidence stores only bounded policy data and a domain-separated one-way credential fingerprint. It never stores the credential ID, public key, challenge, client data, attestation object, authenticator data, cookies or tokens.

## Authentication contract

Authentication challenge issuance is discoverable-only:

- request-controlled `userId` is not accepted as principal authority;
- `allowCredentials` is empty, so the authenticator selects the resident passkey;
- the credential owner is resolved only after a signed assertion reaches the server;
- the response does not expose another principal's credential IDs.

During verification:

1. The typed Redis authentication envelope is consumed exactly once.
2. The server verifies client-data type, exact challenge, origin, RP ID hash, user presence, user verification and ES256 signature.
3. PostgreSQL locks the active credential row with `FOR UPDATE`.
4. Counter decision, `counter`/`last_used_at` update and mandatory evidence commit atomically.
5. If either stored or received counter is nonzero, an equal or lower received counter is rejected as clone/replay suspected.
6. Counter rollback produces a durable typed `credential.webauthn.counter_rollback` outcome and does not advance state.
7. Correlation replay with changed evidence conflicts and rolls back the attempted state transition.

Passkeys whose authenticators legitimately keep both counters at zero remain usable; the one-time ceremony challenge still prevents assertion replay.

## Credential management

Rename and revoke operations:

- derive tenant, actor and owner from the server session;
- lock only the owned credential row;
- commit state and typed evidence in one transaction;
- distinguish absent credentials from database/evidence unavailability;
- store label fingerprints rather than credential names in mandatory evidence.

Credential list reads use strict revocation and return `503` on unavailable database authority rather than pretending the account has no credentials.

## Mandatory evidence actions

- `credential.webauthn.register`
- `credential.webauthn.authenticate`
- `credential.webauthn.counter_rollback`
- `credential.webauthn.rename`
- `credential.webauthn.revoke`

Resource authority: `credential_webauthn`.

## Database schema

`webauthn_credentials` currently has globally unique `credential_id`, per-user ownership, counter, label, AAGUID, transports, active state and timestamps.

The table does not yet contain the canonical tenant column/composite tenant-principal constraints required for full SaaS isolation. That residual is explicitly owned by #109 and #20; this credential slice does not claim to close platform-wide multi-tenancy.

## Residual session boundary

After credential verification and atomic counter evidence, `/api/auth/webauthn/auth/verify` still performs access-token signing, refresh-family issuance, session-registry admission and known-device updates. Their cross-resource atomicity and mandatory session/device evidence are the immediately following bounded #161 slice. Credential success cannot occur without credential evidence, but this document does not claim the downstream session program is complete.

## Permanent verification

The release gate includes:

- source guards preventing best-effort credential audit, request-controlled owner/tenant/actor authority, unlocked counter updates, unchecked registration conflicts and credential enumeration;
- PostgreSQL tests for rollback, duplicate conflicts, concurrent counters, clone-suspected evidence, replay conflicts and cross-principal management;
- Redis ceremony one-time/collision tests;
- API Security Manifest reviewed deltas;
- TypeScript, ESLint, full suite, production build and runtime smoke on one unchanged head.
