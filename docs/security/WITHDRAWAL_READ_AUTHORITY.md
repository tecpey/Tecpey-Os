# Withdrawal Read Authority v1

Issues: #242, #244  
Predecessors: #240 / Draft PR #241, #242 / stacked Draft PR #243

## Purpose

Withdrawal reads are isolated in a dedicated server-only authority. The authority is explicit about the difference between:

- a successful read that found no record;
- a storage outage that prevents an authoritative answer.

This prevents database failure from being presented as a false `404` or a fabricated empty queue.

The superseded mixed `withdrawal-service.ts` module was deleted after all active consumers migrated and exact-head CI proved the active mutation and external-effect authorities were independent from it.

## Authority

```text
src/lib/security/withdrawal-read-authority.ts
withdrawal-read-authority-v1
```

The module owns only:

- `WithdrawalState`;
- `WithdrawalRecord`;
- `readWithdrawal(withdrawalId, optionalOwnerUserId)`;
- `listUserWithdrawalsStrict(userId, limit, offset)`;
- `listPendingReviewWithdrawalsStrict(limit, offset)`.

It does not own mutation, compliance, risk, notification, custody, audit, outbox or external-effect decisions.

## Projection contract

The SQL projection names every returned column. `SELECT *` is prohibited so new database columns cannot silently enter API responses.

Numeric values are read as text from PostgreSQL before controlled mapping. The existing external record shape is preserved:

- asset amount remains a decimal string;
- `amountUsd` remains a number for compatibility with the existing API contract;
- compliance metadata defaults to an empty object only when the stored JSON column is null;
- PostgreSQL timestamps are normalized through `Date#toISOString()`;
- malformed timestamp projection data fails closed instead of leaking an ambiguous representation.

## Identity isolation

User-owned detail reads execute:

```sql
WHERE id = $1 AND user_id = $2
```

A record owned by another principal returns:

```text
{ ok: true, withdrawal: null }
```

It is never returned and the read authority does not accept identity from browser persistence.

Admin unscoped reads remain protected by the existing Admin authorization boundary in the route. The read authority itself does not grant Admin permission.

## Strict outage semantics

Detail result:

```text
{ ok: true, withdrawal: WithdrawalRecord | null }
{ ok: false, reason: withdrawal_storage_unavailable }
```

List result:

```text
{ ok: true, withdrawals: WithdrawalRecord[] }
{ ok: false, reason: withdrawal_storage_unavailable }
```

Routes map storage failure to `503`. A genuine absent record remains `404`.

## Pagination

The authority applies its own bounds even when a route already validates query parameters:

- user history: `1..100`, default `20`;
- Admin review queue: `1..200`, default `50`;
- offsets are non-negative safe integers.

Ordering is deterministic:

- user history: newest first, then ID descending;
- Admin review queue: oldest first, then ID ascending.

## Active consumers

Seven active consumers use the dedicated authority:

1. user withdrawal collection route;
2. user withdrawal detail route;
3. Admin withdrawal collection route;
4. Admin withdrawal detail route;
5. withdrawal admission service;
6. idempotent withdrawal cancellation authority;
7. committed withdrawal replay authority.

No active source depends on the deleted `withdrawal-service.ts` path.

## Legacy service removal

Issue #244 removes the dormant module after the migration proved it had no active consumer. The deletion removes:

- superseded create, Admin-action and cancellation mutations;
- obsolete mixed read helpers;
- old risk/compliance orchestration helpers;
- four non-authoritative Withdrawal `writeAudit()` calls.

This does not remove historical database rows and does not change any active Withdrawal route or state-machine authority.

The following active authorities remain unchanged:

- canonical request and idempotency authority;
- one-time TOTP authorization;
- server-owned price evidence;
- risk and compliance decisions;
- exact wallet reservation and release;
- Admin transition receipts;
- admission outbox;
- pre-broadcast evidence;
- external-effect evidence and recovery;
- settlement and custody launch gates.

## Evidence

`withdrawal-admission-read-authority-postgres.integration.ts` proves:

- owner isolation;
- successful not-found semantics;
- stable decimal and ISO timestamp mapping;
- principal-only history;
- pagination normalization;
- Admin queue state filtering;
- deterministic oldest-first review ordering.

It is intentionally excluded from the generic `*.test.ts` suite. The focused `test:withdrawal-read-authority` command executes it with the `react-server` condition required by the `server-only` authority.

`check-withdrawal-read-authority.mjs` proves:

- no mutation or browser authority is present in the read module;
- no `SELECT *` or timestamp text-cast drift is used;
- all seven consumers bind to the new authority;
- routes distinguish outage from absence;
- focused server-only PostgreSQL evidence remains wired;
- the deleted legacy service file remains absent;
- no source import, export, dynamic import or CommonJS reference can recreate its dependency.

`check-legacy-audit-caller-quarantine.mjs` independently proves:

- no Withdrawal-domain `writeAudit()` caller remains;
- the deleted module cannot be recreated;
- signed API-key rejection telemetry is the only production caller of the deprecated writer.

Both guards run through protected Withdrawal and Sensitive Mutation Audit workflows.

## Reserved forbidden path

`src/lib/security/withdrawal-service.ts` is permanently reserved as a forbidden legacy path. Future Withdrawal capabilities must extend a named single-purpose authority—read, admission, authorization, Admin transition, cancellation, pre-broadcast, external effect or settlement—rather than recreate a mixed orchestration service.

Reintroducing the deleted path requires an explicit architecture decision, a new P0 review and corresponding guard migration; ordinary feature work must fail CI if it recreates or references the path.

## Residual legacy audit boundary

The legacy `audit-log.ts` writer must not be removed until the dormant signed API-key adapter and historical read compatibility are separately resolved. It remains explicitly non-authoritative and cannot prove a sensitive mutation committed.

## Non-goals

- no withdrawal policy or state-machine change;
- no change to reservation, compliance, Admin action, cancellation receipt, pre-broadcast, external-effect or settlement authorities;
- no activation of real withdrawals;
- no migration or deletion of historical rows;
- no deletion of the signed API-key adapter or `audit-log.ts` in this slice;
- no claim that parent #161 is complete.
