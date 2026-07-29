# Session and Device Authority

Status: **P0 security authority**  
Issue: **#183**  
Owner: **security-platform**

## Purpose

TecPey authentication factors prove identity, but only Session Authority may publish durable login authority. A route may prepare signed access and refresh tokens before the database transaction; it must never publish either cookie until the complete durable admission tuple commits.

## Authoritative admission tuple

A successful password, password + 2FA, or WebAuthn login commits the following in one PostgreSQL transaction:

1. one `known_devices` identity;
2. one `refresh_token_families` row bound to that device and principal;
3. one `refresh_tokens` row bound to the family/device;
4. one `user_sessions` access-JTI row bound to the same family/device;
5. one mandatory append-only `session.issue` event.

Any conflict or mandatory-evidence rejection rolls back the entire tuple. Cookies are emitted only after commit.

## Refresh rotation

`POST /api/auth/refresh` verifies signed claims, then Session Authority locks the old refresh row and family using `FOR UPDATE`.

A successful rotation atomically:

- revokes the old refresh token;
- inserts exactly one replacement refresh token;
- inserts the replacement access-session JTI;
- updates the known-device timestamp;
- appends `session.refresh.rotate` evidence.

Concurrent use of one old token can produce at most one successful replacement. Reuse or binding mismatch revokes the whole family and appends `session.refresh.reuse_detected` evidence.

## Session revocation policy

### Selected session

Revoking one modern access session revokes its bound refresh family and every access session in that family.

### Other sessions

“Revoke other sessions” retains the current access session and its current refresh family. Every other family and its access sessions are revoked.

### Logout

Logout first verifies the unified cookie through strict canonical revocation authority. It then revokes the current access session and its bound refresh family.

### Legacy unbound sessions

Sessions created before family binding cannot prove which refresh family belongs to the selected device. PostgreSQL migration `0036_session_legacy_unbound_fallback.sql` enforces the security-first compatibility rule: when one such session is revoked, every active refresh token/family for that principal is revoked in the same transaction.

## Known-device policy

Known-device reads fail with an unavailable response when PostgreSQL is unavailable; database outages never appear as an empty device list.

Rename commits with typed `device.rename` evidence. Removal deactivates the device, revokes its bound families/sessions, queues deny-cache publication, and commits `device.remove` evidence in one transaction.

## Redis deny-cache outbox

PostgreSQL is the durable revocation authority. Redis accelerates rejection and is treated as a repairable deny cache.

Every newly revoked access JTI is written to `session_revocation_outbox` in the same transaction as durable revocation. After commit, the route attempts publication:

- publication succeeds: response reports `revocationPending: false`;
- Redis is unavailable: durable revocation still succeeds and the response reports `revocationPending: true`;
- retry: run `npm run auth:revocations:repair` until it exits successfully.

The repair command exits non-zero while publication remains unavailable, making it suitable for a supervised timer/cron or operations runbook.

## Mandatory evidence

Actions:

- `session.issue`
- `session.refresh.rotate`
- `session.refresh.reuse_detected`
- `session.revoke`
- `session.revoke_all`
- `session.logout`
- `device.rename`
- `device.remove`

Resources:

- `auth_session`
- `refresh_family`
- `known_device`

Evidence never stores raw access/refresh tokens, cookies, JTI/family IDs, IP addresses, full user-agent strings, passwords, TOTP material, passkey material, or unrestricted request bodies. One-way, domain-separated fingerprints are used where correlation is required.

## Operational checks

Before release:

```bash
npm run db:migrate
npm run db:migrate
npm run auth:check
npm run test:auth-session
npm run api:security:check
npm run test:api-security-manifest
npm run build
```

The two migration executions prove idempotency. Final release evidence must be produced on one unchanged commit SHA.
