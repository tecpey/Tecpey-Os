# Legacy Audit Caller Classification

Issues: #240, #244, #246  
Parent: #161  
Original baseline: `62949ff5f290e56aaef0329523e67fc8434aff76`

## Status

**Source-level legacy audit channel removed. Historical data retained.**

TecPey sensitive mutation authority is no longer allowed to use the former best-effort `writeAudit()` source channel.

The following dormant source modules were deleted:

```text
src/lib/security/withdrawal-service.ts
src/lib/security/api-key-auth.ts
src/lib/security/audit-log.ts
```

No production-source `writeAudit()` implementation, import or caller remains.

## Mandatory mutation evidence

Security, credential, privacy, financial, custody and privileged mutations must use one of:

- `sensitive_mutation_audit_events` in the same PostgreSQL transaction;
- domain-specific immutable evidence admitted in the same transaction;
- a durable pre-effect command/outbox/state-machine record followed by reconciliation.

A mutation must not return ordinary success while mandatory evidence durability is unknown.

## Historical `audit_events` preservation

Deletion of the source writer does not delete or migrate the historical database table or rows named `audit_events`.

Historical rows:

- remain subject to retention, legal and privacy policy;
- are not mandatory mutation evidence;
- cannot prove a sensitive mutation committed;
- must not be updated or deleted merely because the old source API was removed;
- require a separate governed data-retention decision for archival or deletion.

The canonical migration plan and historical schema remain untouched by #246.

## Withdrawal legacy service removed

`src/lib/security/withdrawal-service.ts` was deleted by #244 after all active reads migrated to `withdrawal-read-authority-v1` and active mutation authorities were proven independent.

Removal eliminated four obsolete Withdrawal `writeAudit()` calls and superseded create/Admin/cancellation paths.

## Dormant signed API authentication removed

`src/lib/security/api-key-auth.ts` had no active route, service import or external source caller. It was deleted by #246.

Signed HMAC API-key request authentication is launch-disabled and not implemented for soft launch. It must not be inferred from the active API-key credential lifecycle.

Future activation requires the new P0 process defined in:

```text
docs/security/SIGNED_API_AUTH_LAUNCH_POLICY.md
```

## Deprecated audit writer removed

`src/lib/security/audit-log.ts` was deleted after:

- Withdrawal legacy callers were removed;
- the dormant signed API-key adapter was removed;
- `getAuditLog()` was proven to have no active source caller;
- active mandatory evidence was proven to use governed transaction/outbox authorities.

The deletion removes only source APIs. It does not erase historical database evidence.

## Active API-key credential authority

Account-owned API-key create/list/enable/disable/rotate/delete remains active through:

```text
src/lib/security/api-keys.ts
src/app/api/api-keys/route.ts
src/app/api/api-keys/[id]/route.ts
```

Credential mutations remain server-owned and transactionally coupled to `sensitive_mutation_audit_events`.

No active route accepts API-key headers as principal authentication.

## Permanent source guards

The Sensitive Mutation Audit guard fails when:

- any deleted legacy source path is recreated;
- production source imports, exports, dynamically imports or requires a deleted path;
- production source contains `writeAudit(`;
- production source references `validateSignedApiKeyRequest`, `hasApiKeyHeaders` or `getAuditLog`;
- an active route reads the former signed-auth headers;
- official current-state documents claim signed API authentication is production-ready;
- active API-key credential lifecycle loses transaction-coupled mandatory evidence;
- code attempts to drop or delete historical `audit_events` data as part of this source cleanup.

## Current legacy footprint

Production source legacy audit callers:

```text
0
```

Production signed API authentication routes:

```text
0
```

Deleted source modules:

```text
withdrawal-service.ts
api-key-auth.ts
audit-log.ts
```

Historical database table/rows:

```text
audit_events retained; non-authoritative for sensitive mutation proof
```

## Residual work under #161

After #246:

- source-level best-effort audit authority is removed;
- dormant signed API authentication is removed and launch-disabled;
- active API-key credential lifecycle remains transactionally evidenced;
- historical `audit_events` retention remains a separate data-governance concern;
- #161 remains open until all remaining domain-specific audit inventory and governance requirements satisfy its complete definition of done.
