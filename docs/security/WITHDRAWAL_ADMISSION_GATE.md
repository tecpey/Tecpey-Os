# Withdrawal Admission Authority

Status: P0 admission control implemented; custody execution remains disabled.

## Authoritative controls

Withdrawal admission accepts only a canonical server-validated command. Browser-provided USD valuation and browser assertions of completed 2FA are rejected. A dedicated same-origin endpoint verifies TOTP and issues a one-time PostgreSQL authorization bound to the user, canonical request hash, and accepted RFC 6238 time step.

USD valuation comes from a fresh HMAC-signed price snapshot persisted by server infrastructure. Admission fails closed when pricing, Redis risk authority, PostgreSQL, or mandatory compliance evidence is unavailable or malformed.

The admission transaction serializes requests per user, consumes the authorization, enforces durable 24-hour velocity, reserves exact decimal funds, appends immutable ledger evidence, persists policy and compliance evidence, and creates a durable outbox event. Idempotency is scoped by user and immutable request hash.

## Release boundary

This authority does not enable real signing or blockchain broadcast. `TECPEY_REAL_WITHDRAWALS_ENABLED=1` remains forbidden by production validation until custody issue #106 is closed with independently verified signing, key-management, worker, reconciliation, and incident-response gates.

## Permanent verification

- `npm run withdrawals:check`
- `npm run test:withdrawal-admission`
- full `npm test`
- production build and runtime smoke

No withdrawal admission change may weaken these gates or interpret provider failure as approval.
