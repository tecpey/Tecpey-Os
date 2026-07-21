# Legacy Audit Caller Classification

Issue: #240  
Parent: #161  
Baseline: `62949ff5f290e56aaef0329523e67fc8434aff76`

## Status

**Containment and classification only.**

The active TecPey security and financial authorities use transaction-coupled evidence or durable outbox/state-machine records. The older `audit_events` writer is best-effort and cannot prove a mutation committed.

Every remaining production-source `writeAudit()` site is classified below. This inventory prevents new callers and does not migrate or delete historical `audit_events` rows.

## Channel definitions

### Mandatory mutation evidence

Security, credential, privacy, financial, custody and privileged mutations must use one of:

- `sensitive_mutation_audit_events` in the same PostgreSQL transaction;
- domain-specific immutable evidence admitted in the same transaction;
- a durable pre-effect command/outbox/state-machine record followed by reconciliation.

A mutation must not return ordinary success while mandatory evidence durability is unknown.

### Non-authoritative telemetry

Telemetry may support diagnostics but:

- may be dropped;
- may not satisfy a release gate;
- may not prove a mutation occurred;
- may not authorize a state transition;
- must not contain credentials, secrets, raw bodies, cookies or unbounded PII.

### Obsolete or duplicate legacy code

A superseded module with no active caller is not runtime authority. It must remain unimported and source-guarded until deletion or archival.

## Exact remaining caller inventory

| File / site | Classification | Runtime authority | Required containment |
|---|---|---:|---|
| `src/lib/security/api-key-auth.ts` — expired timestamp rejection | Non-authoritative security telemetry in a dormant adapter | No | One-way credential fingerprint; bounded rejection class; no raw key prefix or exact submitted timestamp |
| `src/lib/security/api-key-auth.ts` — invalid signature rejection | Non-authoritative security telemetry in a dormant adapter | No | One-way credential fingerprint; bounded method/path; no signature, body or credential material |
| `src/lib/security/withdrawal-service.ts` — security gate blocked | Obsolete/duplicate legacy withdrawal telemetry | No | Module must have no external caller; active routes must use canonical withdrawal admission authority |
| `src/lib/security/withdrawal-service.ts` — withdrawal created | Obsolete/duplicate legacy withdrawal telemetry | No | Cannot satisfy admission evidence; module must remain unreachable |
| `src/lib/security/withdrawal-service.ts` — compliance blocked | Obsolete/duplicate legacy withdrawal telemetry | No | Cannot satisfy compliance/pre-broadcast evidence; module must remain unreachable |
| `src/lib/security/audit-log.ts` — `writeAudit()` implementation | Deprecated best-effort writer | No | Explicit non-authoritative annotation; no new imports or callers |
| `src/lib/security/audit-log.ts` — `getAuditLog()` | Historical read-only compatibility helper | No | Must not be used as release evidence or mandatory mutation proof |

No remaining site is classified as mandatory evidence.

## Signed API-key adapter

`src/lib/security/api-key-auth.ts` currently has no repository caller outside its own definitions. It is not activated by the presence of headers alone.

Rejected-request telemetry uses:

```text
api_key_auth_rejected
legacy-signed-api-key-rejection-v1
```

Actor and resource identity are a SHA-256 fingerprint with a domain separator. The telemetry must not store:

- raw API key or prefix;
- submitted signature;
- request body or body hash tied to the credential;
- authorization/cookie headers;
- exact submitted timestamp;
- user ID inferred from an unverified credential.

Activation requires a separate reviewed route, nonce, authorization, tenant/principal and mandatory audit design.

## Legacy withdrawal service

`src/lib/security/withdrawal-service.ts` is superseded and `createWithdrawalRequest()` has no external repository caller. Active withdrawal routes use:

- canonical command and request hashes;
- server-owned price evidence;
- one-time TOTP authorization;
- transaction-coupled admission and reservation;
- durable admission outbox;
- pre-broadcast evidence;
- external-effect evidence and recovery.

The legacy service must not be imported by a route, worker or authority. Its `writeAudit()` calls are obsolete and cannot satisfy any withdrawal release gate.

## Legacy audit module

`src/lib/security/audit-log.ts` remains only for classified compatibility code and historical reads. Its writer deliberately does not propagate storage failure. Therefore:

```text
LEGACY_AUDIT_TELEMETRY_AUTHORITY = non-authoritative
```

The API name is retained temporarily to avoid combining classification with deletion of a large superseded module. A later bounded removal slice may delete the dormant adapters and then remove the writer entirely.

## Permanent source guard

The Sensitive Mutation Audit guard fails when:

- any new source file imports `audit-log.ts`;
- any new source file calls `writeAudit()`;
- any source file imports `api-key-auth.ts` or `withdrawal-service.ts`;
- any source outside those modules references their exported activation functions;
- signed API-key telemetry uses `api_key_created` or raw key prefixes;
- exact submitted timestamps, signatures or request bodies appear in rejection telemetry;
- the classification document or non-authoritative annotations disappear.

## Active authority boundaries

This classification does not change active behavior:

- API-key create/enable/disable/rotate/delete remains transactionally evidenced through `sensitive_mutation_audit_events`;
- withdrawal admission, cancellation, Admin transitions, pre-broadcast and external effects remain on their existing fail-closed authorities;
- no signed API-key route is activated;
- no legacy withdrawal path is activated.

## Residual work under #161

After this slice:

- the remaining best-effort sites are fully classified and source-contained;
- the deprecated writer still exists solely because the superseded withdrawal module has not yet been deleted;
- #161 remains open until legacy code removal and all other domain inventories satisfy its full definition of done.
