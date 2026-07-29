# Audit Data Retention and Access Policy

Issue: #248  
Parent: #161  
Policy version: `audit-data-retention-access-v1`  
Status: **Current conservative authority — final duration pending Legal/Compliance approval**

## Purpose

This policy separates two data classes that must not be treated as equivalent:

1. active mandatory sensitive mutation evidence in `sensitive_mutation_audit_events`;
2. historical legacy rows in `audit_events`.

The policy defines current retention, access and export boundaries without inventing a jurisdictional duration before Legal, Compliance and Privacy owners approve one.

## 1. Mandatory sensitive mutation evidence

### Authority

```text
PostgreSQL: sensitive_mutation_audit_events
Source: src/lib/security/sensitive-mutation-audit.ts
Inventory: docs/security/generated/sensitive-mutation-audit-domain-inventory.json
```

### Purpose

The ledger proves that a governed credential, privacy, financial, Admin, risk, CRM, notification, Academy or Community mutation admitted required evidence in the same transaction or reviewed durable authority.

It is not an analytics event stream and must not be repurposed for behavioral profiling.

### Integrity

- append-only PostgreSQL triggers prohibit update and delete;
- `(tenant_id, action, correlation_id)` enforces replay/correlation integrity;
- metadata keys and total encoded size are bounded;
- raw credentials, tokens, conversation content, destination addresses, free-form review notes and similar secrets/PII are prohibited;
- storage failure must roll back the governed mutation when this ledger is mandatory authority.

### Current retention mode

```text
no automatic deletion
no automatic archival
legal/compliance retention schedule pending
```

This is a conservative hold, not a claim that indefinite retention is the final privacy policy.

A duration may be introduced only through a versioned policy change that records:

- jurisdiction and legal basis;
- purpose and data category;
- minimum and maximum retention period;
- Legal owner;
- Compliance/Privacy owner;
- approved archival/deletion mechanism;
- legal-hold override;
- restore and audit procedure;
- exact-head database and guard evidence.

### Access

There is no public or end-user audit API.

Operational access is restricted to approved Security, Compliance or Database Operations personnel under a ticketed purpose. Access must be:

- least privilege;
- time-bounded where infrastructure supports it;
- read-only unless an approved migration explicitly requires otherwise;
- recorded through database/platform access logs;
- limited to the minimum tenant, principal, action and time range required;
- reviewed after security, compliance or incident use.

Application routes must not expose raw metadata from this ledger without a separately approved redacted reporting authority.

## 2. Historical `audit_events`

### Status

```text
retained historical data
no active source writer
no active source query helper
not mandatory mutation evidence
```

The source-level best-effort writer was removed by Issue #246. Existing schema and rows are preserved.

### Interpretation boundary

A historical `audit_events` row must not be used to prove that a sensitive mutation committed because the former source writer could swallow storage failure and was not transaction-coupled.

Historical data may support limited incident reconstruction or legacy operational context only when its non-authoritative nature is stated.

### Current retention mode

```text
preservation hold pending Legal/Compliance schedule
no automatic deletion
no new application writes
no public/application reads
```

Source cleanup must not drop, truncate or delete the table or rows.

### Access

Access is limited to approved Security, Compliance, Privacy or Database Operations personnel for:

- incident investigation;
- legal or regulatory request;
- retention assessment;
- migration/export verification.

Any access must have a ticket/case identifier, named requestor, approved purpose, bounded query scope and recorded completion.

## 3. Export policy

Audit export is not a general product feature.

An approved export must:

- identify the legal/operational purpose and owner;
- select the minimum necessary columns and rows;
- exclude or redact secrets and unnecessary personal data;
- use encrypted transport and encrypted storage;
- have an explicit recipient and expiration/return requirement;
- preserve chain-of-custody information;
- record export time, filter scope and operator;
- honor legal holds;
- be deleted from temporary locations after the approved purpose ends.

Raw export to browser storage, support chat, email body or unapproved third-party analytics is forbidden.

## 4. Legal hold

A legal or incident hold suspends archival/deletion for the bounded records in scope.

A hold record must identify:

- authority/requestor;
- affected tenant/principal/action/time range;
- reason;
- start date;
- review date;
- release authority.

A hold does not grant broader read access than the underlying role permits.

## 5. Archival or deletion decision process

No archival or deletion implementation is authorized by this policy version.

A future change requires:

1. approved retention matrix by Legal, Compliance and Privacy;
2. data-owner review for each domain in the canonical inventory;
3. evidence that mandatory financial/security records remain legally sufficient;
4. an immutable archive or deletion receipt design;
5. legal-hold support;
6. bounded batch and failure recovery;
7. backup/restore implications;
8. negative tests against cross-tenant deletion;
9. migration and rollback/forward-fix plan;
10. exact-head protected workflow evidence.

Because `sensitive_mutation_audit_events` is currently database-enforced append-only, deletion requires an explicit governed database architecture change and cannot be introduced as an ordinary cleanup job.

## 6. Domain ownership

Domain owners are defined in the canonical inventory and are responsible for:

- evidence purpose and necessity;
- metadata minimization;
- classification accuracy;
- retention schedule input;
- incident/compliance interpretation;
- reviewing future new actions/resources.

Security Platform owns the shared ledger contract and guard, not the business meaning of every domain event.

## 7. Prohibited behavior

- using historical `audit_events` as proof of committed mutation;
- updating or deleting mandatory evidence through application code;
- adding unbounded free-form metadata;
- storing raw secrets, tokens, credentials, private journal text or provider payloads;
- public/user-facing raw audit endpoints;
- browser persistence of audit exports;
- automatic deletion before an approved retention matrix;
- changing retention duration without named Legal and Compliance/Privacy owners;
- activating a new action/resource without inventory and source evidence.

## 8. Review and approval

This policy must be reviewed before Gate 6 by:

- Chief Security Officer;
- Chief Compliance Officer;
- Privacy/Data Protection owner;
- Database/SRE owner;
- CTO or delegated architecture owner.

Until that review approves a duration matrix, the conservative no-automatic-deletion mode remains in force and must be recorded as an operational/privacy governance item rather than represented as final legal compliance.

## 9. CI enforcement

Protected CI verifies:

- action/resource unions match the canonical inventory exactly;
- every inventory entry has owner, evidence/data class and sensitivity;
- production source cannot introduce unknown typed actions/resources;
- governed audit tables are not dropped/truncated/deleted by source cleanup;
- official documents do not call historical `audit_events` mandatory authority;
- this policy remains versioned and explicitly pending Legal/Compliance duration approval.

## Non-goals

- no schema migration;
- no audit reporting API;
- no archival/deletion worker;
- no final jurisdictional duration;
- no change to current mutation behavior;
- no deletion of historical rows;
- no claim that parent #161 is closed before dependency merges and final review.
