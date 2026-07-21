# Withdrawal Read Authority v1

Issue: #242  
Predecessor: #240 / Draft PR #241

## Purpose

Withdrawal reads are now isolated from the mixed legacy withdrawal service. The authority is read-only, server-only and explicit about the difference between:

- a successful read that found no record;
- a storage outage that prevents an authoritative answer.

This prevents database failure from being presented as a false `404` or a fabricated empty queue.

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
- timestamps retain the existing string representation.

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

## Migrated consumers

Seven active consumers use the dedicated authority:

1. user withdrawal collection route;
2. user withdrawal detail route;
3. Admin withdrawal collection route;
4. Admin withdrawal detail route;
5. withdrawal admission service;
6. idempotent withdrawal cancellation authority;
7. committed withdrawal replay authority.

No active source imports `withdrawal-service.ts` after this migration.

## Evidence

`withdrawal-admission-read-authority-postgres.test.ts` proves:

- owner isolation;
- successful not-found semantics;
- stable record mapping;
- principal-only history;
- pagination normalization;
- Admin queue state filtering;
- deterministic oldest-first review ordering.

`check-withdrawal-read-authority.mjs` proves:

- no mutation or browser authority is present in the read module;
- no `SELECT *` is used;
- all seven consumers bind to the new authority;
- routes distinguish outage from absence;
- no active import, export or CommonJS load of the mixed legacy module remains.

The guard runs through both the Withdrawal authority suite and the Sensitive Mutation Audit workflow.

## Deletion readiness

After this extraction, `withdrawal-service.ts` has no active external consumer. Its remaining mutation and helper surface is dormant and may be deleted in a separately reviewed commit after exact repository and CI evidence confirms no generated, script, migration or test dependency remains.

The legacy `audit-log.ts` writer must not be removed until the dormant signed API-key adapter and any historical query dependency are separately resolved.

## Non-goals

- no withdrawal policy or state-machine change;
- no change to reservation, compliance, Admin action, cancellation receipt, pre-broadcast or external-effect authorities;
- no activation of real withdrawals;
- no migration or deletion of historical rows;
- no claim that parent #161 is complete.
