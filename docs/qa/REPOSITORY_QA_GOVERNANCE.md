# TecPey Repository QA Governance

Status: **Active audit authority**  
Program issue: **#157**  
Initial evidence baseline: `6558d7be2c4ee98eb5baa633c9905f80b00672fe`

## Purpose

This document governs repository-wide quality assurance for TecPey OS. The objective is not to produce a one-time AI review or a large unstructured findings list. The objective is to create a repeatable engineering control that inventories every tracked file, inspects every eligible text line, records manual domain coverage, prevents regression and preserves an honest release stance.

A deterministic scanner can prove coverage and identify suspicious patterns. It cannot prove business correctness, financial conservation, authorization completeness, visual quality, privacy compliance or operational recoverability by itself. TecPey therefore uses four audit levels.

## Audit levels

### Level 0 — immutable inventory

Every Git-tracked file is recorded with:

- path and ownership domain;
- extension and binary/text classification;
- byte size and text line count;
- executable bit;
- SHA-256 content hash;
- exact Git commit under review.

An audit is invalid if a tracked file is absent from the inventory, a non-binary file cannot be decoded as UTF-8, or the reviewed commit changes after evidence collection.

### Level 1 — deterministic every-line inspection

Every line of each eligible tracked text file is processed by the repository scanner. Rules cover credentials, unsafe authority, durability, error handling, financial precision, SQL, request bounds, network cancellation, test integrity, accessibility, documentation claims and related risk classes.

Each finding must contain:

- exact path and line;
- rule identifier;
- P0–P3 severity;
- confidence;
- ownership domain;
- explanation and bounded excerpt;
- suppression status and exception evidence where applicable.

### Level 2 — human/domain review

Manual review is required for critical domains even when deterministic findings are empty. Reviewers must inspect code and tests together and record reviewed file batches, threat assumptions, residual risk and required follow-up issues.

Required domains:

1. authentication, sessions, CSRF, RBAC/ABAC, Admin and audit;
2. migrations, transactions, database constraints, source of truth and recovery;
3. Exchange orders, holds, matching, fees, ledger and reconciliation;
4. wallet, withdrawal, signing, chain providers and custody;
5. Academy progression, assessment, XP, certificates and account portability;
6. Trading Arena execution, market data, PnL, attempts, journal and replay;
7. Mentor AI input/output trust, memory, egress, consent and provider reliability;
8. CRM, PII, retention, notification and user-data rights;
9. tenant/principal isolation across database, cache, queue, storage and observability;
10. UI/UX, accessibility, RTL/LTR parity, responsiveness and design-system consistency;
11. CI/CD, dependencies, environment contracts, staging and incident operations;
12. governance/documentation consistency and release-claim integrity.

### Level 3 — adversarial/runtime proof

The audit program must progressively add or confirm evidence for:

- unauthorized and malformed requests;
- cross-user and cross-tenant isolation;
- database, Redis, provider and queue outages;
- replay, concurrency, duplicate events and stale revisions;
- ambiguous external results and deterministic recovery;
- Persian and English browser Golden Paths;
- production build/runtime smoke;
- backup/restore, rollback and incident-response drills.

## Severity model

| Severity | Meaning | Required disposition |
|---|---|---|
| **P0** | Immediate confidentiality, integrity, custody, financial or release blocker | Fix before merge or keep release blocked through an owned issue |
| **P1** | High-risk correctness, authorization, privacy, durability or operational defect | Fix before confident controlled launch; exception is normally prohibited |
| **P2** | Material maintainability, accessibility, quality or governance debt | Fix in the audit PR where bounded, otherwise issue-link with owner and deadline |
| **P3** | Low-risk cleanup or consistency issue | Triage and schedule without hiding it |
| **INFO** | Inventory/review information | No automatic remediation requirement |

## Exceptions

Exceptions live in `config/repository-qa-exceptions.json`. Every exception must be:

- exact to a path and rule;
- limited to a line when practical;
- assigned to an owner;
- linked to a GitHub issue;
- justified with a concrete reason;
- time-bounded through `expiresAt`.

Expired, incomplete or broad exceptions are P1 governance failures. Exceptions do not convert unsafe behavior into approved behavior; they only make residual risk explicit while the linked issue remains accountable.

## README and documentation integrity

The repository README is a public engineering contract. It must clearly distinguish:

- verified implemented capability;
- capability still under hardening;
- controlled-soft-launch scope;
- roadmap/strategic target;
- explicit financial, custody, compliance and operational NO-GO boundaries.

Unverified percentages, absolute security claims and aspirational features presented as complete are prohibited. Documentation must use the authoritative hierarchy defined under `docs/` and must be updated when a merged change alters release posture, architecture or source-of-truth ownership.

## Exact-head evidence

No audit result may be used for merge or release if the branch head changed after the evidence was generated. The final candidate must pass on one unchanged commit:

- repository line audit;
- environment and migration checks;
- TypeScript and ESLint;
- all permanent source/authority guards;
- focused negative and PostgreSQL/Redis tests;
- full automated test suite;
- production build and runtime smoke;
- all required independent GitHub workflows.

## Merge rule

The audit branch may contain tooling, reports, README corrections and bounded defect fixes. It must not contain unrelated feature development. The audit issue remains open until every tracked file is inventoried, every eligible line is scanned, domain-review coverage is recorded, all P0/P1 findings are resolved or explicitly blocking release, and the final exact-head evidence is green.
