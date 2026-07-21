# Signed API Authentication Launch Policy

Issue: #246  
Parent: #161  
Status: **Launch-disabled / not implemented**

## Decision

TecPey does not expose signed HMAC API-key request authentication for soft launch.

The former dormant adapter at:

```text
src/lib/security/api-key-auth.ts
```

had no active route, service import or external source caller. It was deleted rather than treated as production-ready merely because one failure mode could be made fail-closed.

The deleted path is reserved. Ordinary feature work must not recreate it or expose signed API authentication without a new P0 architecture and security review.

## Distinct authorities

### API-key credential lifecycle — active

The following account-owned credential operations remain active:

- create;
- list;
- enable;
- disable;
- rotate;
- delete.

Authority:

```text
src/lib/security/api-keys.ts
src/app/api/api-keys/route.ts
src/app/api/api-keys/[id]/route.ts
```

Controls include:

- strict canonical session authority;
- CSRF at mutation routes;
- server-derived principal and tenant context;
- permission validation;
- cryptographic credential generation and one-way storage;
- revision/idempotency protections where applicable;
- transaction-coupled `sensitive_mutation_audit_events` evidence;
- secret-free audit metadata.

Credential lifecycle capability does not imply that any public route accepts an API key as request authentication.

### Signed API request authentication — disabled

No active route:

- reads `X-TECPEY-APIKEY`;
- reads `X-TECPEY-TIMESTAMP`;
- reads `X-TECPEY-SIGNATURE`;
- invokes a signed API-key request validator;
- grants a principal from an API-key header.

Redis availability therefore cannot create a replay-vulnerable production path: the authentication surface does not exist.

### Mandatory sensitive audit — active

Mandatory credential, financial, privacy and privileged mutation evidence uses:

```text
sensitive_mutation_audit_events
src/lib/security/sensitive-mutation-audit.ts
```

It is transaction-coupled or otherwise admitted through a reviewed durable state/outbox authority. Failure must prevent ordinary mutation success.

### Historical `audit_events` — retained data

The source-level best-effort writer and query helper were deleted. Existing database schema and rows named `audit_events` are not deleted or migrated by #246.

Historical rows:

- remain subject to retention and legal policy;
- are not mandatory mutation evidence;
- must not be used to infer that a sensitive mutation committed;
- must not be rewritten or deleted as part of source cleanup.

## SB-003 closure rule

SB-003 is closed for soft launch by **surface elimination**, not by claiming that the dormant adapter became production-ready.

Closure evidence requires:

1. no signed API authentication route exists;
2. the dormant adapter source is absent;
3. CI rejects recreation or reference of the deleted path;
4. CI rejects the old validator symbols and signed-auth headers in active route authority;
5. active API-key credential lifecycle tests and transactional audit evidence pass;
6. future signed-auth activation is governed by this policy.

## Future activation requirements

A future signed API authentication design requires a new P0 issue and explicit approval for:

- route and method inventory;
- tenant, workspace and principal derivation;
- credential lookup and rotation semantics;
- permission scopes and least privilege;
- canonical request construction;
- body hashing and bounded request parsing;
- nonce durability and atomic replay prevention;
- timestamp/clock-skew policy;
- rate limiting and abuse controls;
- idempotency for mutations;
- transaction-coupled mandatory evidence;
- secret redaction and observability;
- revocation propagation;
- degraded-mode and dependency-outage behavior;
- operational recovery and incident response;
- negative, concurrency and replay tests;
- API Security Manifest registration.

No existing credential automatically becomes valid for signed request authentication unless a migration and user-facing security decision explicitly authorizes it.

## Permanent source guards

Protected CI fails when:

- `src/lib/security/api-key-auth.ts` is recreated;
- `src/lib/security/audit-log.ts` is recreated;
- production source contains `writeAudit(`;
- production source imports or references either deleted module path;
- production source references `validateSignedApiKeyRequest` or `hasApiKeyHeaders`;
- a route reads the former signed-auth headers without a new governed authority;
- official current-state documents claim signed API authentication is production-ready;
- active API-key lifecycle loses transaction-coupled mandatory evidence.

## Non-goals

- no public API or SDK authentication implementation;
- no deletion or migration of historical `audit_events` rows;
- no change to account-owned API-key lifecycle semantics;
- no claim that all Developer Platform requirements are complete;
- no claim that parent #161 is fully complete.
