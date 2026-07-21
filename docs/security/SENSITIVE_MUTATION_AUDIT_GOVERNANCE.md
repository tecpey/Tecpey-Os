# Sensitive Mutation Audit Governance

Issue: #248  
Parent: #161  
Policy version: `sensitive-mutation-audit-governance-v1`

## Authority set

The canonical typed contract is:

```text
src/lib/security/sensitive-mutation-audit.ts
```

The canonical machine-readable classification is:

```text
docs/security/generated/sensitive-mutation-audit-domain-inventory.json
```

Protected CI requires exact equality between the TypeScript action/resource unions and the registry. An action or resource cannot be added to one side only.

Current registry size:

```text
59 actions
27 resources
```

## Usage classification

Usage state is derived from production source on every protected run:

- **active** — the exact typed value is referenced outside the shared authority in production/operational source;
- **reserved** — the value remains typed and classified but has no current production reference.

Reserved values are not silently removed. They retain owner, evidence class and sensitivity so future activation cannot occur without code, registry and CI evidence in the same reviewed change.

## Evidence modes

### Transaction-coupled mutation evidence

The mutation and `writeSensitiveMutationAuditTx()` execute on the same PostgreSQL client/transaction. Evidence failure rolls back ordinary mutation success.

Used for credential, privacy, financial and privileged mutations where the ledger is mandatory authority.

### Durable state/outbox evidence

Some domains combine the shared ledger with immutable domain rows, command receipts, outbox records or external-effect state machines. The domain row is authoritative for its specific transition while the shared audit record supplies bounded cross-domain evidence.

### Operational evidence

Scheduler, delivery and projection actions may record bounded operational facts. They must not contain raw payloads and must not be treated as user-facing analytics.

## Domain map

| Domain owner | Action families | Primary source authority | Focused evidence |
|---|---|---|---|
| `identity-security` | `api_key.*`, `credential.password.*`, `credential.two_factor.*`, `credential.webauthn.*` | `src/lib/security/api-keys.ts`, password route, 2FA/WebAuthn authorities | API-key, password, two-factor and WebAuthn transactional PostgreSQL tests; strict-session guards |
| `custody-platform` | `withdrawal.*` | Withdrawal authorization, admission, Admin, cancellation and evidence authorities | Withdrawal admission, Admin, cancellation, pre-broadcast, external-effect and settlement PostgreSQL tests |
| `exchange-platform` | `exchange.order.*` | Exchange order admission/evidence authorities | Exchange Authority workflow and order-admission PostgreSQL tests |
| `notifications` | `device.notification.*`, `notification.*` | device-token route, notification preferences/delivery/outbox authorities | notification persistence/runtime/producer/domain-outbox guards and tests |
| `ai-platform` | `mentor.conversations.*`, `mentor.profile.*` | mentor conversation migration route and profile recompute authority | Sensitive Mutation Audit route tests, PostgreSQL tests and AI trust/red-team gates |
| `risk-platform` | `risk.policy.*`, `risk.control.*`, `risk.service.*` | risk enforcement and service command/projection/external-effect authorities | risk enforcement guards, PostgreSQL tests and recovery evidence |
| `crm-platform` | `crm.lead.*` | CRM lead route/service, delivery worker and retention authority | CRM guard and PostgreSQL integration tests |
| `community-platform` | `academy.community.*` | Community profile/consent, challenge, reputation and private journal authorities | Community consent, challenge, reputation, journal, scheduler and host-evidence PostgreSQL/source-boundary tests |

## Actor and scope rules

Evidence actors and scope must come from verified server authority:

- canonical session or Admin control plane;
- service identity for reviewed workers;
- server-derived tenant/workspace/principal context;
- target ownership verified inside the same transaction where required.

Caller-controlled `actorId`, `userId`, `studentId`, `tenantId` or workspace authority is forbidden.

## Metadata rules

Metadata must be:

- bounded to 16 KiB encoded JSON;
- recursively free from forbidden secret/PII keys;
- structured and purpose-specific;
- composed of hashes/fingerprints, policy versions, bounded reason codes, counts and transition facts;
- free from raw credentials, tokens, cookies, authorization headers, destination addresses, private journal text, conversation content and unrestricted provider payloads.

A new metadata field must be reviewed against the resource sensitivity in the registry.

## Correlation and replay

Mandatory evidence uses stable correlation and request hashes where applicable.

The database uniqueness boundary:

```text
(tenant_id, action, correlation_id)
```

permits exact replay but rejects contradictory evidence under the same correlation.

## Historical data boundary

`sensitive_mutation_audit_events` is active mandatory evidence.

Historical `audit_events` is retained legacy data and is not proof of committed mutation. Its source writer and query helper are deleted.

Retention, access, export and legal-hold rules are defined in:

```text
docs/security/AUDIT_DATA_RETENTION_AND_ACCESS_POLICY.md
```

## Change procedure

Adding or changing an action/resource requires one reviewed change containing:

1. TypeScript union update;
2. registry entry with domain owner, evidence/data class and sensitivity;
3. production authority implementation;
4. metadata/redaction review;
5. transaction/outbox failure semantics;
6. focused negative and PostgreSQL evidence;
7. API Security Manifest delta when a route changes;
8. retention/privacy impact review;
9. exact-head protected workflow evidence.

Removing a value requires proof that no production source or historical interpretation depends on it. Reserved values should not be removed merely to make the union smaller.

## CI enforcement

`check-sensitive-audit-domain-inventory.mjs` verifies:

- exact union/registry equality;
- unique entries and exact keys;
- owner/evidence/data/sensitivity completeness;
- unknown governed action rejection;
- active/reserved source-derived classification;
- no raw audit-table access from application routes;
- no ordinary source deletion of governed audit tables;
- retention policy version and conservative duration boundary;
- historical data classification.

The guard runs before PostgreSQL/Redis tests in the protected Sensitive Mutation Audit workflow.

## Approval boundary

Security Platform owns the shared ledger and guard. Each domain owner remains accountable for necessity, semantics, metadata minimization and retention input.

Final retention duration requires Legal, Compliance and Privacy approval. This document does not invent that duration.

## Non-goals

- no schema migration;
- no public audit UI;
- no final legal retention duration;
- no archival/deletion implementation;
- no change to current mutation behavior;
- no claim that #161 is closed before stacked dependencies and final approvals merge.
