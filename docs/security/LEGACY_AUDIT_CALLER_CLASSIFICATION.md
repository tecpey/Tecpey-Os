# Legacy Audit Caller Classification

Issues: #240, #244  
Parent: #161  
Original baseline: `62949ff5f290e56aaef0329523e67fc8434aff76`

## Status

**Withdrawal legacy service removed; remaining legacy channel still quarantined.**

The active TecPey security and financial mutation authorities use transaction-coupled evidence or durable outbox/state-machine records. The older `audit_events` writer is best-effort and cannot prove a mutation committed.

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

## Withdrawal legacy service removed

`src/lib/security/withdrawal-service.ts` was deleted after the dedicated `withdrawal-read-authority-v1` migration proved that all active reads and mutations were independent from it.

The deletion removes:

- the superseded `createWithdrawalRequest()` mutation path;
- the superseded `adminActOnWithdrawal()` mutation path;
- the superseded `cancelWithdrawal()` mutation path;
- obsolete mixed read helpers;
- four best-effort Withdrawal `writeAudit()` calls.

No production-source `writeAudit()` site remains in Withdrawal.

Active Withdrawal behavior remains owned by:

- canonical command and request hashes;
- server-owned price evidence;
- one-time TOTP authorization;
- transaction-coupled admission and reservation;
- durable admission outbox;
- strict read projections;
- canonical Admin action receipts;
- idempotent cancellation with exact ledger release;
- pre-broadcast evidence;
- external-effect evidence and recovery;
- settlement and custody launch gates.

## Exact remaining caller inventory

| File / site | Classification | Runtime mutation authority | Required containment |
|---|---|---:|---|
| `src/lib/security/api-key-auth.ts` — centralized rejected-request telemetry | Non-authoritative security telemetry in a dormant adapter | No | One-way credential fingerprint; bounded rejection class; no raw key prefix, signature, body or exact submitted timestamp |
| `src/lib/security/audit-log.ts` — `writeAudit()` implementation | Deprecated best-effort writer | No | Explicit non-authoritative annotation; no new imports or callers |
| `src/lib/security/audit-log.ts` — `getAuditLog()` | Historical read-only compatibility helper | No | Must remain unreferenced by active source and must not be used as release evidence or mandatory mutation proof |

Signed API-key rejection telemetry is the only production caller of `writeAudit()`.

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

Activation requires a separate reviewed route, nonce, authorization, tenant/principal and mandatory audit design. Deletion requires separate proof that signed request authentication will not be activated through this adapter.

## Legacy audit module

`src/lib/security/audit-log.ts` remains only for the dormant signed API-key rejection telemetry channel and historical read compatibility. Its writer deliberately does not propagate storage failure. Therefore:

```text
LEGACY_AUDIT_TELEMETRY_AUTHORITY = non-authoritative
```

The writer cannot be removed until:

1. the signed API-key adapter is deleted or migrated to an approved telemetry/evidence design;
2. historical read compatibility is proven unnecessary or replaced;
3. no source caller remains;
4. historical `audit_events` rows are preserved according to retention policy.

## Permanent source guard

The Sensitive Mutation Audit guard fails when:

- `src/lib/security/withdrawal-service.ts` is recreated;
- any source references, imports, dynamically imports, requires or re-exports the deleted Withdrawal module path;
- any new source file imports `audit-log.ts`;
- any new source file calls `writeAudit()`;
- any source file imports or activates `api-key-auth.ts`;
- `getAuditLog()` gains an active source caller;
- signed API-key telemetry uses `api_key_created` or raw key prefixes;
- exact submitted timestamps, signatures or request bodies appear in rejection telemetry;
- the classification document or non-authoritative annotations disappear.

## Active authority boundaries

This classification and deletion do not change active behavior:

- API-key create/enable/disable/rotate/delete remains transactionally evidenced through `sensitive_mutation_audit_events`;
- Withdrawal admission, reads, cancellation, Admin transitions, pre-broadcast, external effects and settlement remain on their existing fail-closed authorities;
- no signed API-key route is activated;
- no legacy Withdrawal path exists.

## Residual work under #161

After this slice:

- the Withdrawal legacy service and its four best-effort audit calls are removed;
- signed API-key rejection telemetry is privacy-safe, truthful and the only production caller of the deprecated writer;
- the historical audit query helper remains unreferenced and non-authoritative;
- #161 remains open until the signed API-key adapter/audit writer disposition and all other domain inventories satisfy its full definition of done.
