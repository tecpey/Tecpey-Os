# TecPey Canonical Decision Log

**Status:** Authoritative index  
**Document class:** Authoritative  
**Owner:** TecPey executive and architecture governance  
**Current historical registry:** [`docs/DECISION_LOG.md`](../DECISION_LOG.md)  
**Governance:** [`TECPEY_DOCUMENTATION_GOVERNANCE.md`](./TECPEY_DOCUMENTATION_GOVERNANCE.md)

## 1. Purpose

This file is the stable canonical entry point for difficult-to-reverse TecPey decisions. It prevents decision authority from being scattered across roadmaps, chat prompts, phase reports, README text and implementation notes.

The existing detailed registry remains in [`docs/DECISION_LOG.md`](../DECISION_LOG.md) while entries are reviewed and migrated into the governed format defined below. That historical registry remains binding for accepted decisions unless an entry is explicitly superseded here or by a later accepted decision.

This index is not a changelog, backlog, meeting log or implementation status report.

## 2. Decision authority rules

- Accepted decisions constrain product, architecture and implementation until formally superseded.
- Material changes create a new decision entry; accepted historical rationale is not silently rewritten.
- Runtime code cannot silently override a product or security decision. A conflict must be resolved through an explicit decision and migration plan.
- A decision may authorize direction, but it does not by itself prove implementation or production readiness.
- Release blockers and residual risk remain governed by implementation/release evidence even when the long-term direction is accepted.

## 3. Required entry format

```markdown
# TPD-YYYY-NNN — Decision title

Status: Proposed | Accepted | Superseded | Rejected | Deprecated
Date:
Owners:
Decision class: Product | Architecture | Security | Data | AI | Financial | Custody | Compliance | Operations | Governance
Supersedes:
Superseded by:

## Decision

## Scope

## Context and problem

## Invariants

## Alternatives considered

## Rationale

## Consequences and trade-offs

## Security, privacy and financial impact

## Implementation and migration requirements

## Verification and release implications

## Revisit conditions

## Related issues, PRs and documents
```

Accepted entries require an owner, date, clear scope and related evidence. Proposed entries do not become authority merely because they are present in the file.

## 4. Permanent accepted decision index

The following decisions are already established in the historical registry and platform governance. Their detailed rationale remains in [`docs/DECISION_LOG.md`](../DECISION_LOG.md) until migration is complete.

| Legacy ID | Decision | Status | Canonical consequence |
|---|---|---|---|
| DEC-001 | TecPey is a Digital Financial Education & Trading Operating System, not merely an exchange | Accepted | Product and architecture decisions must preserve the education-first operating-system identity |
| DEC-002 | Education is the primary entry point and permanent foundation | Accepted | Acquisition and safety design must not lead with speculative trading incentives |
| DEC-003 | Brand promise: «تک‌پی، نقطه امن ورود به بازار رمزارز» | Accepted | Marketing, UI, AI and operations must not imply guaranteed profit or unsafe urgency |
| DEC-004 | Foundational Academy access remains free | Accepted | Monetization may apply to advanced services without blocking core educational access |
| DEC-005 | Trading Arena is a first-class strategic pillar | Accepted | Arena receives the same product and engineering seriousness as Academy and Mentor |
| DEC-006 | Arena uses serious constrained virtual capital rather than unlimited demo funds | Accepted | Simulation must encourage risk discipline and resist gaming |

The historical file contains additional decisions beyond the table above. They remain subject to review and migration; omission from this summary does not automatically revoke an accepted historical entry.

## 5. Platform invariants requiring decision-level treatment

The following established constraints must not be weakened by ordinary implementation changes:

### Education first

Academy, Trading Arena and Mentor AI form a single competence and trust loop. Exchange volume is not the primary success metric.

### Server-authoritative persistence

Durable account, progress, history, consent, Arena, Exchange, wallet, CRM and Mentor state belongs to platform databases and backend services. Browser storage is never the durable source of truth.

### Financial and privileged fail-closed behavior

Missing authorization, tenant context, persistence, provider, market data, replay protection or mandatory evidence cannot silently produce ordinary success.

### Evidence-defined completion

A feature is not production-ready because its UI exists, its code compiles or a general test suite is green. Required domain, negative, integration, runtime, recovery and release evidence must exist on the exact approved revision.

### Multi-tenant and white-label truthfulness

Multi-tenant and white-label capability is a strategic target. It may not be marketed as complete until isolation is proven across data, identity, cache, queues, storage, providers, AI, observability and operations.

### Governed AI

TecPey owns AI policy, context permission, memory, provider routing, audit and user experience. External models are untrusted providers and may not receive authentication/custody secrets or unapproved user data.

### Custody gating

The existence of wallet and withdrawal code does not authorize unrestricted real-money custody. Approved key protection, transaction-intent binding, dual control, chain certification, reconciliation and recovery evidence are mandatory.

## 6. Migration policy for the historical registry

Migration from `docs/DECISION_LOG.md` must be incremental and evidence-preserving:

1. review one legacy entry and all referenced sources;
2. assign a stable `TPD-YYYY-NNN` identifier;
3. preserve original rationale and date uncertainty honestly;
4. add current owners, scope and implementation/release implications;
5. record supersession relationships;
6. link the migrated entry back to the legacy ID;
7. do not delete the historical registry until every entry is reconciled and Git history remains clear.

## 7. New decisions during migration

New difficult-to-reverse decisions must be added directly in the governed format under this file or a linked decision record in `docs/governance/decisions/`. They must not be added only to the legacy registry.

A dedicated decision file may be used when an entry is large. The index must include its identifier, title, status, owner and link.

## 8. Current decision register

| ID | Title | Status | Owner | Record |
|---|---|---|---|---|
| LEGACY-REGISTRY | Historical TecPey OS decisions | Accepted / under migration | Executive governance | [`docs/DECISION_LOG.md`](../DECISION_LOG.md) |
| TPD-2026-001 | Documentation authority and non-duplication governance | Accepted | Executive and engineering governance | [`TECPEY_DOCUMENTATION_GOVERNANCE.md`](./TECPEY_DOCUMENTATION_GOVERNANCE.md) |
| TPD-2026-002 | Repository-wide exact-head line-review evidence program | Accepted for execution | Engineering governance | [`../qa/REPOSITORY_LINE_BY_LINE_QA_PROGRAM.md`](../qa/REPOSITORY_LINE_BY_LINE_QA_PROGRAM.md) |

## 9. Review conditions

Review this index when:

- a difficult-to-reverse product or architecture decision is proposed;
- a permanent invariant changes;
- an accepted decision conflicts with implementation;
- a launch gate is weakened or removed;
- a vendor becomes an authority for identity, custody, compliance or AI;
- the historical registry is migrated or superseded;
- the required-reading hierarchy changes.

No new decision is complete until its consequences, verification requirements and related documentation are reconciled.