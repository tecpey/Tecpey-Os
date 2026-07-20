# API Command Idempotency Contract

## Authority

`api_command_receipts` is the server-side source of truth for replay protection on governed API commands. Browser storage, request-local memory, Redis-only locks, and client-generated status are not authoritative.

Every generic receipt is scoped by the exact tuple:

- `tenant_id`
- `principal_type`
- `principal_id`
- `operation`
- `idempotency_key`

The canonical request hash is immutable inside that scope. Reusing the same key with a different canonical payload is a conflict and must not execute the command.

## Transactional commands

For database-owned effects, the command effect and terminal receipt are committed in the same PostgreSQL transaction. A rollback removes both. PostgreSQL advisory transaction locks serialize concurrent duplicate delivery, and the waiting request replays the completed result rather than executing the effect again.

Current governed transactional operations include:

- admin withdrawal state transitions;
- user withdrawal cancellation and exact ledger release;
- withdrawal authorization issuance;
- order cancellation and hold release.

Offline Sync retains its established tenant/student/client-event authority, which already provides transactional replay, conflict detection, isolation, stale recovery, and retention.

## Terminal and transient outcomes

Terminal outcomes in the `2xx`–`4xx` range may be persisted and replayed exactly, including deterministic domain failures such as `order_not_found` and `order_already_terminal`.

Transient infrastructure outcomes such as database unavailability, market-lock contention, dependency outages, and server errors are not completed as permanent receipts. They remain retryable.

## Retention

Completed generic command receipts are retained for 90 days by default. Cleanup is bounded and concurrency-safe:

```bash
npm run idempotency:retention
```

Optional operational limits:

- `API_COMMAND_RECEIPT_PURGE_BATCH_SIZE` — `1..5000`, default `1000`
- `API_COMMAND_RECEIPT_PURGE_MAX_BATCHES` — `1..100`, default `20`

Cleanup selects expired completed receipts in ordered batches using `FOR UPDATE SKIP LOCKED`. Processing receipts and unexpired terminal evidence are preserved. Storage failure exits non-zero.

## Required evidence

The focused PostgreSQL tests must prove:

- exact result replay;
- changed-payload conflict;
- concurrent duplicate serialization with one domain effect;
- cross-tenant and cross-principal isolation;
- atomic rollback of effect and receipt;
- completed-receipt immutability;
- expired-only retention cleanup;
- terminal order-cancel failure replay.

`npm run test:api-command-idempotency`, the API security manifest, Full Suite Diagnostics, Exchange Authority, and repository CI are merge gates.
