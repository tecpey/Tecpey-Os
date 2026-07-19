# Withdrawal Admission Authority

Status: P0 admission and confirmed-settlement controls implemented; custody execution remains disabled.

## Authoritative controls

Withdrawal admission accepts only a canonical server-validated command. Browser-provided USD valuation and browser assertions of completed 2FA are rejected. A dedicated same-origin endpoint verifies TOTP and issues a one-time PostgreSQL authorization bound to the user, canonical request hash, policy version, and accepted RFC 6238 time step.

USD valuation is produced during normal admission from direct-USD provider consensus. At least two distinct fresh providers must agree within the governed spread before the result is signed and persisted. Admission fails closed when consensus, signed pricing, Redis risk authority, PostgreSQL, or mandatory compliance evidence is unavailable or malformed. PostgreSQL independently recomputes and verifies price evidence at withdrawal insertion.

The admission transaction serializes requests per user, consumes the authorization, enforces durable 24-hour velocity, reserves exact `NUMERIC(38,18)` funds, appends immutable `hold` ledger evidence, persists policy and compliance evidence, and creates a durable outbox event. Idempotency is scoped by user and immutable request hash; committed response-loss replay is resolved from PostgreSQL without depending on current provider availability.

Cancellation and reject/block transitions release reserved funds exactly once and append immutable `release` evidence. Confirmation completion delegates to a dedicated settlement transaction that locks the authoritative withdrawal, consumes the exact held balance, appends one idempotent `withdraw` ledger entry, transitions to `completed`, and clears reservation metadata. Database triggers and constraints enforce terminal reservation metadata for completed, rejected, blocked, and cancelled states.

## Release boundary

This authority does not enable real signing or blockchain broadcast. `TECPEY_REAL_WITHDRAWALS_ENABLED=1` remains forbidden by production validation until custody issue #106 is closed with independently verified signing, key-management, worker, reconciliation, and incident-response gates.

## Permanent verification

- `npm run withdrawals:check`
- `npm run test:withdrawal-admission`
- multi-source price-consensus tests
- PostgreSQL admission, replay, price-evidence, reservation, admin-transition, and confirmed-settlement tests
- full `npm test`
- production build and runtime smoke

No withdrawal admission, pricing, confirmation, or settlement change may weaken these gates, bypass durable ledger authority, or interpret provider failure as approval.
