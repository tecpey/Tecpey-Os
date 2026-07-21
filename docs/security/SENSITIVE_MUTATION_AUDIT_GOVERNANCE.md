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

Protected CI requires exact equality between `SensitiveMutationAuditAction`, `SensitiveMutationAuditResource` and the registry. An action or resource cannot be added to one side only.

Current registry size:

```text
59 actions
21 resources
```

## Usage classification

Usage state is derived from production source on every protected run:

- **active** — the exact typed value is referenced outside the shared authority in production or operational source;
- **reserved** — the value remains typed and classified but has no current production reference.

Reserved values are not silently removed. They retain domain ownership, evidence/data class and sensitivity so future activation requires code, registry and protected CI evidence in one reviewed change.

## Evidence modes

### Transaction-coupled mutation evidence

The mutation and `writeSensitiveMutationAuditTx()` execute on the same PostgreSQL client and transaction. Mandatory evidence failure rolls back ordinary mutation success.

### Durable state/outbox evidence

A domain may combine the shared ledger with immutable command receipts, domain events, state-machine transitions or external-effect records. The domain row is authoritative for its transition; the shared audit row supplies bounded cross-domain evidence.

### Operational evidence

Reviewed services may record bounded operational facts. Operational evidence must not contain raw payloads and is not user-facing analytics or a substitute for transaction-coupled mutation evidence.

## Domain map

| Domain owner | Exact action families | Primary authority | Evidence focus |
|---|---|---|---|
| `identity-security` | `api_key.*`, `credential.*`, `session.*`, `device.rename`, `device.remove` | API-key, account/password, 2FA, WebAuthn, session and known-device authorities | transaction rollback, strict identity, replay, revocation and credential minimization |
| `custody-platform` | `withdrawal.*` | authorization, admission, Admin transition, cancellation, execution, broadcast, confirmation and settlement authorities | financial ownership, state transitions, external effects and settlement evidence |
| `exchange-platform` | `exchange.order.*` | Exchange order admission and evidence authorities | order acceptance/finalization/rejection/cancellation evidence |
| `notifications` | `device_token.register` | device-token registration authority | privacy-minimized device identifier registration |
| `ai-platform` | `mentor_conversations.migrate`, `mentor_profile.recompute`, `mentor.preferences.update` | Mentor migration, profile and preference authorities | privacy, behavioral profile and preference evidence |
| `risk-platform` | `risk.event.*`, `risk.enforcement.*` | risk event and enforcement authorities | risk-decision provenance, application, clearing and expiry |
| `community-platform` | `community.profile.consent.update` | Community profile and scoring-consent authorities | revisioned default-private consent and principal isolation |

Only these seven owners have actions in the current typed contract. CRM, scheduler and other domain-specific evidence remain governed by their own authorities until a reviewed action/resource is added to the shared typed ledger.

## Actor and scope rules

Actors and scope must come from verified server authority:

- canonical user/student session or Admin control plane;
- reviewed service identity for workers;
- server-derived tenant, workspace and principal context;
- target ownership checked inside the same transaction where required.

Caller-controlled actor, user, student, tenant or workspace authority is forbidden.

## Metadata rules

Metadata must be:

- bounded to 16 KiB encoded JSON;
- recursively free from forbidden secret and PII keys;
- structured and purpose-specific;
- limited to hashes, fingerprints, policy versions, bounded reason codes, counts and transition facts;
- free from raw credentials, tokens, cookies, authorization headers, destination addresses, private journal text, conversation content and unrestricted provider payloads.

A new metadata field requires review against the resource sensitivity in the registry.

## Correlation and replay

Mandatory evidence uses stable correlation and request hashes where applicable. The uniqueness boundary:

```text
(tenant_id, action, correlation_id)
```

permits exact replay and rejects contradictory evidence under the same correlation.

## Historical data boundary

`sensitive_mutation_audit_events` is active append-only mandatory evidence.

Historical `audit_events` is retained legacy data and is not proof of committed mutation. Its source writer and query helper are deleted.

Retention, access, export and legal-hold rules are defined in:

```text
docs/security/AUDIT_DATA_RETENTION_AND_ACCESS_POLICY.md
```

## Change procedure

Adding or changing an action/resource requires one reviewed change containing:

1. typed union update;
2. exact registry entry with owner, evidence/data class and sensitivity;
3. production authority implementation;
4. metadata and redaction review;
5. transaction/outbox failure semantics;
6. focused negative and PostgreSQL evidence;
7. API Security Manifest delta when a route changes;
8. retention/privacy impact review;
9. exact-head protected workflow evidence.

Removing a value requires proof that no production source or historical interpretation depends on it. A reserved value is not removed merely to make the union smaller.

## CI enforcement

`check-sensitive-audit-domain-inventory.mjs` verifies:

- exact union/registry equality;
- unique entries and exact keys;
- owner/evidence/data/sensitivity completeness;
- unknown governed action rejection;
- source-derived active/reserved classification boundary;
- no raw audit-table access from application routes;
- no ordinary source deletion of governed audit tables;
- retention policy version and conservative duration boundary;
- historical data classification.

`check-retired-security-surface.mjs` scans every production directory under `src`, excluding only test/stub/fixture material, and rejects deleted audit/Withdrawal/signed-auth imports, dynamic imports, CommonJS loads, symbols and headers.

The guards run before PostgreSQL and Redis tests in the protected Sensitive Mutation Audit workflow.

## Approval boundary

Security Platform owns the shared ledger and guards. Each domain owner remains accountable for necessity, semantics, metadata minimization and retention input.

Final retention duration requires Legal, Compliance and Privacy approval. This document does not invent that duration.

## Non-goals

- no public audit UI;
- no final legal retention duration;
- no archival/deletion implementation;
- no activation of signed API authentication;
- no claim that parent #161 is complete before merge and final owner review.
