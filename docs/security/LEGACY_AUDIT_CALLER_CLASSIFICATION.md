# Legacy Audit Caller Classification

Issue: #240  
Parent: #161  
Baseline: `62949ff5f290e56aaef0329523e67fc8434aff76`

## Status

**Containment and classification only.**

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

### Mixed compatibility module

`withdrawal-service.ts` currently combines:

- a bounded read-only compatibility surface used by active authorities and routes;
- superseded mutation functions that have no external caller;
- four best-effort telemetry calls inside those dormant mutations.

Only named imports of these read bindings are permitted:

```text
fetchWithdrawal
listPendingReviewWithdrawals
WithdrawalRecord
WithdrawalState
```

All mutation exports have no external caller and are source-guarded against activation.

## Exact remaining caller inventory

| File / site | Classification | Runtime mutation authority | Required containment |
|---|---|---:|---|
| `src/lib/security/api-key-auth.ts` — centralized rejected-request telemetry | Non-authoritative security telemetry in a dormant adapter | No | One-way credential fingerprint; bounded rejection class; no raw key prefix, signature, body or exact submitted timestamp |
| `src/lib/security/withdrawal-service.ts` — security gate blocked | Obsolete/duplicate legacy withdrawal telemetry | No | `createWithdrawalRequest()` must have no external caller |
| `src/lib/security/withdrawal-service.ts` — withdrawal created | Obsolete/duplicate legacy withdrawal telemetry | No | Cannot satisfy admission evidence; mutation remains unreachable |
| `src/lib/security/withdrawal-service.ts` — compliance blocked | Obsolete/duplicate legacy withdrawal telemetry | No | Cannot satisfy compliance/pre-broadcast evidence; mutation remains unreachable |
| `src/lib/security/withdrawal-service.ts` — legacy Admin action | Obsolete/duplicate legacy withdrawal telemetry | No | `adminActOnWithdrawal()` must have no external caller; canonical Admin authority remains active |
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

## Legacy withdrawal mutation surface

Active code currently imports only the bounded read-only compatibility surface from `withdrawal-service.ts`. The following legacy mutation exports have no external source caller:

```text
createWithdrawalRequest
adminActOnWithdrawal
cancelWithdrawal
```

Active withdrawal mutations instead use:

- canonical command and request hashes;
- server-owned price evidence;
- one-time TOTP authorization;
- transaction-coupled admission and reservation;
- durable admission outbox;
- canonical Admin action receipts;
- pre-broadcast evidence;
- external-effect evidence and recovery;
- idempotent cancellation with exact ledger release.

A future bounded cleanup should extract the read projection into its own authority and delete the superseded mutation surface. Until then, the source guard permits only the four listed read bindings and rejects mutation imports, calls, namespace imports, default imports, CommonJS loading and re-exports.

## Legacy audit module

`src/lib/security/audit-log.ts` remains only for classified compatibility code and historical reads. Its writer deliberately does not propagate storage failure. Therefore:

```text
LEGACY_AUDIT_TELEMETRY_AUTHORITY = non-authoritative
```

The API name is retained temporarily to avoid combining classification with deletion of the mixed legacy withdrawal module. A later bounded removal slice may extract the read authority, delete the dormant adapters and then remove the writer entirely.

## Permanent source guard

The Sensitive Mutation Audit guard fails when:

- any new source file imports `audit-log.ts`;
- any new source file calls `writeAudit()`;
- any source file imports or activates `api-key-auth.ts`;
- any withdrawal-service import requests a binding outside the exact read-only allowlist;
- any source outside the mixed module references its dormant mutation exports;
- a namespace, default, CommonJS or re-export path bypasses named-binding checks;
- signed API-key telemetry uses `api_key_created` or raw key prefixes;
- exact submitted timestamps, signatures or request bodies appear in rejection telemetry;
- the classification document or non-authoritative annotations disappear.

## Active authority boundaries

This classification does not change active behavior:

- API-key create/enable/disable/rotate/delete remains transactionally evidenced through `sensitive_mutation_audit_events`;
- withdrawal admission, cancellation, Admin transitions, pre-broadcast and external effects remain on their existing fail-closed authorities;
- active withdrawal reads retain their existing response contract;
- no signed API-key route is activated;
- no legacy withdrawal mutation path is activated.

## Residual work under #161

After this slice:

- the remaining best-effort sites are fully classified and source-contained;
- signed API-key rejection telemetry is privacy-safe and truthful;
- the deprecated writer still exists solely because the mixed withdrawal compatibility module has not yet been decomposed;
- #161 remains open until legacy code removal and all other domain inventories satisfy its full definition of done.
