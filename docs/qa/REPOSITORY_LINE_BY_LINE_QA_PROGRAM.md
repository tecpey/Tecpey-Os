# TecPey Repository-Wide Line-by-Line QA Program

**Program issue:** [#156](https://github.com/tecpey/Tecpey-Os/issues/156)  
**Repository:** `tecpey/Tecpey-Os`  
**Initial audit base:** `6558d7be2c4ee98eb5baa633c9905f80b00672fe`  
**Status:** Active — no repository-wide completion claim is permitted until the manifest denominator is fully reconciled.

## 1. Purpose

This program establishes the evidence model and execution discipline for an exhaustive review of every tracked repository path. It exists to answer five questions with verifiable evidence:

1. What exactly is present in the repository?
2. Which files and lines carry product, security, financial, privacy or operational authority?
3. Which invariants are proven by code, schema, tests and runtime evidence?
4. Which defects or unknowns still block a safe release?
5. Can every completion claim be traced to a reviewed commit, finding, remediation and exact-head verification run?

Automated scanning is only one input. It does not replace semantic review, adversarial reasoning, integration tests, runtime verification or operational drills.

## 2. Audit denominator

The audit denominator is the complete output of `git ls-files` at the exact reviewed commit.

Every tracked path must appear once in the deterministic audit inventory with:

- repository-relative path;
- byte size;
- line count when textual;
- SHA-256 digest;
- textual, binary or generated classification;
- product or infrastructure domain;
- risk tier;
- assigned review batch;
- review status;
- finding count by severity;
- semantic review evidence reference;
- remediation issue or pull request when applicable;
- exact reviewed commit SHA.

A file may be marked **not line-reviewable** only when it is binary or mechanically generated. That classification still requires provenance, necessity, ownership and supply-chain review.

## 3. Severity model

### P0 — Release blocker

A credible path exists to unauthorized asset movement, custody compromise, authentication bypass, cross-tenant disclosure, irreversible data corruption, regulatory breach, secret exfiltration, false durable success or uncontrolled privileged action.

Required response:

- immediate release NO-GO;
- bounded remediation issue and branch;
- negative/adversarial tests;
- permanent authority guard where practical;
- exact-head CI, integration and runtime evidence;
- explicit residual-risk decision.

### P1 — Scale or high-confidence launch blocker

A serious correctness, privacy, availability, accessibility or maintainability defect can materially harm users or operations but does not currently expose an immediate catastrophic path.

Required response:

- named owner and remediation plan;
- focused regression tests;
- release decision recorded before affected capability is enabled.

### P2 — Material engineering debt

The issue increases defect probability, operational cost or future security risk. It must be recorded and prioritized but may not block a tightly controlled release when the affected path is disabled or bounded.

### P3 — Quality improvement

Clarity, consistency, documentation, minor performance or low-risk maintainability improvement.

## 4. Risk tiers for files

| Tier | Meaning | Typical paths |
|---|---|---|
| `critical` | Direct security, financial, custody, identity, tenant or release authority | API mutations, auth/session, trading, wallet, migrations, CI/release, runtime bootstrap |
| `high` | User data, privacy, AI egress, queues, admin, CRM, notifications, Academy/Arena authority | repositories, workers, domain services, provider boundaries |
| `medium` | Product behavior, UI state, localization, content integrity, non-critical scripts | pages, components, hooks, content loaders |
| `low` | Documentation, static assets and non-authoritative presentation | prose docs, brand assets, examples |

Risk tier determines review depth and required evidence; it never removes a file from the denominator.

## 5. Review batches

1. Root, CI, supply chain and runtime bootstrap
2. Database schema, migrations and persistence infrastructure
3. Authentication, authorization, tenant and Admin security
4. Academy and educational integrity
5. Trading Arena and behavioral evidence
6. Exchange, ledger and financial precision
7. Wallet, withdrawal and custody
8. Mentor AI, memory and provider governance
9. CRM, notifications, social and privacy
10. UI/UX, bilingual parity, accessibility and performance
11. Operations, deployment, observability and recovery
12. Tests, documentation, dead-code/provenance and final reconciliation

A review batch is complete only after every assigned file has a status and every confirmed finding is linked to remediation or explicit residual risk.

## 6. Line-review checklist

The reviewer must evaluate each applicable line in context against the following dimensions.

### Correctness

- types, nullability, bounds and state transitions;
- transaction boundaries and partial-failure behavior;
- duplicate, replay, retry, timeout and cancellation semantics;
- concurrency, locking and lost-update risk;
- deterministic arithmetic and locale/time handling;
- error propagation and truthful response semantics.

### Security and privacy

- trusted identity and tenant/principal derivation;
- authorization before data access or mutation;
- CSRF, SSRF, XSS, injection and unsafe redirect exposure;
- request body, response size, rate and resource limits;
- secret, PII and financial-data handling;
- cache, logs, metrics, traces and audit redaction;
- fail-open paths and unsafe fallback behavior.

### Financial integrity

- decimal-safe representation and rounding authority;
- conservation across orders, holds, fills, fees, balances and ledger;
- idempotency, revision and correlation keys;
- ambiguous provider/RPC outcomes;
- reconciliation and recovery evidence;
- custody/signing intent binding and release gates.

### Persistence and distributed systems

- database source of truth and cross-device recovery;
- schema constraints matching application assumptions;
- migration ordering, idempotency and rollback;
- Redis/queue namespace, durability and duplicate delivery;
- worker ownership, leases, retries and dead-letter behavior;
- no false success during dependency outage.

### Product, UI/UX and accessibility

- Persian RTL and English LTR parity;
- keyboard, focus, semantic HTML and screen-reader behavior;
- loading, empty, error, offline and ambiguous-command states;
- responsive behavior and touch targets;
- user trust, financial-safety language and non-deceptive status;
- no durable authority in browser storage.

### Maintainability and operations

- clear ownership and single authority;
- dead, duplicate or misleading code;
- configuration drift and scattered environment reads;
- observability, incident evidence and actionable errors;
- bounded resource use and performance regressions;
- documentation aligned with verified runtime behavior.

## 7. Automated evidence

The repository audit scripts must produce deterministic JSON and human-readable Markdown from the tracked tree. Initial automation includes:

- complete tracked-file inventory;
- byte, line and digest accounting;
- binary/generated classification;
- domain, risk and review-batch assignment;
- line-addressable pattern findings for known high-risk constructs;
- totals by domain, risk, extension and review batch.

Pattern matches are review leads, not automatic defect verdicts. A suppression is valid only when it is narrow, documented, issue-linked when material, and reviewed.

## 8. Semantic evidence format

Each reviewed file or coherent small group must record:

```text
Reviewed commit:
Batch:
Paths:
Text lines reviewed:
Reviewer:
Invariants evaluated:
Findings: P0 / P1 / P2 / P3
Remediation issues/PRs:
Tests and runtime evidence:
Residual risk:
Decision: accepted / remediation required / capability disabled
```

Critical files require direct evidence for negative paths, not only a statement that the source was read.

## 9. Pull request discipline

The audit program uses a draft coordination PR. Confirmed fixes that materially change domain behavior should be split into bounded remediation PRs.

No audit or remediation PR may merge until:

- required checks run on the exact current head;
- no newer commit exists after the verified workflows started;
- all required workflows are green;
- focused negative and integration tests actually ran;
- migrations were executed cleanly and idempotently when affected;
- production build and governed runtime smoke passed;
- temporary workflows, artifacts and diagnostics are absent from the tree;
- review threads and unresolved P0/P1 findings for the PR scope are reconciled.

## 10. README governance

`README.md` is a public engineering contract. It must:

- define TecPey accurately;
- distinguish implemented foundations, hardening work and roadmap;
- retain explicit real-money NO-GO language while P0 gates remain;
- never infer production readiness from code volume or a green build;
- point contributors to authoritative documentation and quality gates;
- remain bilingual where product identity or critical safety context requires it;
- be updated whenever merged evidence materially changes the engineering reality.

## 11. Completion report

The final report must contain:

- exact reviewed commit;
- total tracked files, textual files, binary/generated files and text lines;
- reviewed denominator and completion percentage calculated from that denominator;
- findings by severity, domain and root cause;
- merged remediations and permanent guards;
- open residual risks and disabled capabilities;
- test, migration, build, runtime, backup/restore and recovery evidence;
- executive recommendation: `GO`, `CONDITIONAL GO` or `NO-GO` for each major capability.

Until that report exists and the denominator is complete, the repository-wide line-by-line audit remains **OPEN**.