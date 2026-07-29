# API Command Idempotency Review Checklist

PR #145 may leave draft status only when every item below is satisfied on the same owner-authored head.

## Scope and authority

- [x] all five governed replay gaps are remediated:
  - `POST /api/admin/withdrawals/[id]`
  - `DELETE /api/auth/withdraw/[id]`
  - `POST /api/auth/withdraw/authorize`
  - `POST /api/offline-sync`
  - `DELETE /api/orders/[id]`
- [x] generic receipts are scoped by tenant, principal type, principal ID, operation, and idempotency key;
- [x] canonical request hashes are immutable and changed-payload key reuse conflicts;
- [x] PostgreSQL advisory transaction locks serialize concurrent duplicate delivery;
- [x] database-owned effects and terminal receipts commit or roll back together;
- [x] Offline Sync retains its established tenant/student/client-event replay authority;
- [x] deterministic terminal `2xx`–`4xx` outcomes may be replayed exactly;
- [x] transient storage, dependency, lock, and server failures are not persisted as terminal receipts;
- [x] completed receipts are immutable;
- [x] completed receipts have a documented 90-day retention policy and bounded cleanup runner.

## Evidence

- [x] exact replay and changed-payload conflict are covered by PostgreSQL tests;
- [x] concurrent duplicate delivery proves one domain effect and one terminal receipt;
- [x] cross-tenant and cross-principal reuse is isolated;
- [x] rollback removes both the domain effect and command receipt;
- [x] completed receipt immutability is enforced by PostgreSQL;
- [x] retention deletes only expired terminal evidence;
- [x] terminal order-cancel `404` results are persisted and replayed;
- [x] withdrawal admin rejection replays without duplicating balance release, ledger rows, or admin actions;
- [x] withdrawal admission and API security guards enforce the new authority contracts.

## Manifest and repository state

- [x] `replayable_command_without_idempotency` is zero in the generated manifest;
- [x] the resolved #143 exception group is removed from the registry;
- [x] manifest body-parser detection no longer treats idempotency-key parsing as body consumption;
- [x] the committed snapshot contains 70 remaining findings: 48 body-size, 19 strict-revocation, and 3 durable-audit gaps;
- [x] temporary inspection and one-shot baseline workflows are absent from the final diff;
- [x] `main` remains unchanged until approved merge.

## Exact-head merge gates

- [ ] API Security Manifest passes on the final owner-authored head;
- [ ] Full Suite Diagnostics passes on that same head;
- [ ] Exchange Authority passes on that same head;
- [ ] repository CI, including migrations, TypeScript, focused PostgreSQL tests, full tests, build, and runtime smoke, passes on that same head;
- [ ] review threads are resolved and the exact head is mergeable.
