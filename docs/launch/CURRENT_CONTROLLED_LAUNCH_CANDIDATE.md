# Current Controlled Launch Candidate

**Status:** active candidate identity ledger, not Go approval  
**Decision:** NO-GO until accepted protected-staging and remaining operational evidence is attached  
**Current candidate SHA:** `1c2172144f5a5fbe3037a262c67cb9799585c1b2`  
**Candidate source:** `main` after PR #525 security/runtime authority hardening  
**Candidate selected at:** `2026-08-21T18:42:52Z`  
**Machine-readable ledger:** `docs/launch/generated/current-controlled-launch-candidate.json`  
**Runtime image digest evidence:** `docs/launch/generated/runtime-image-digest-evidence-20260812.json`  
**Exact-head workflow evidence:** `docs/launch/generated/exact-head-workflow-evidence-20260812.json`  
**Rollback/volume-restore evidence:** `docs/launch/generated/rollback-volume-restore-evidence-20260812.json`  
**Disabled-capability attestation evidence:** `docs/launch/generated/disabled-capability-attestation-evidence-20260812.json`  
**Incident readiness evidence request:** `docs/launch/generated/incident-readiness-evidence-request-20260812.json`  
**Accepted-risk owner sign-off evidence:** `docs/launch/generated/accepted-risk-signoff-evidence-20260812.json`  
**Go approval matrix evidence request:** `docs/launch/generated/go-approval-matrix-evidence-request-20260812.json`

This file is the source of truth for all new controlled soft-launch evidence collection.

## Why this candidate exists

PR #525 advanced runtime/security authority after the post-#523 candidate. The exact `main` release identity now selected is:

```text
1c2172144f5a5fbe3037a262c67cb9799585c1b2
```

Genuine exact-main evidence was recollected for this SHA. Schema-v2 workflow evidence contains the nine governed runs, including Scheduled Operational Recovery. Container Supply Chain published and Cosign-verified the immutable runtime digest. The exact-candidate rollback job served the candidate, restored PostgreSQL/Redis recovery state and then served the previous release.

NOG-03, NOG-04 and NOG-06 are accepted only for those exact-candidate properties. They do not make the launch GO.

## Historical evidence boundary

`9bd4ca5ec22e99e2d7deb192826ef8c018ee4913` remains historical accepted evidence. `e4065675473170f62f0ed4dec8641f8d77722725` was the post-#523 candidate used by stale PR #524 and is superseded after PR #525. Neither candidate's run URLs, digests or artifacts may be relabelled as evidence for the current SHA.

## Candidate identity rules

- Every new launch evidence artifact must record this exact 40-character SHA.
- The deployed app checkout, workflow checkout, bundle manifest, `/api/health` commit and generated evidence JSON must all match this SHA.
- If a later PR changes runtime, deployment, security, bundle or launch-control behavior, a new candidate-promotion cycle is required before protected execution continues.
- Documentation-only evidence attachments may preserve this runtime candidate when they only record URLs, digests and dispositions for this exact SHA.
- Historical evidence stays historical unless genuinely regenerated and accepted for this SHA.
- No support ZIP should be sent as launch-ready until remaining NO-GO evidence is accepted.

## Required next evidence

| Gate | Required before Go |
| --- | --- |
| Exact-head workflows | NOG-04 accepted via schema-v2 exact-head evidence for the current SHA. |
| Immutable runtime identity | NOG-03 accepted via signed immutable runtime digest for the current SHA. |
| Protected staging | NOG-01/NOG-02 must be executed on protected staging for this SHA. |
| Recovery and rollback | NOG-06 mechanics are accepted; protected staging domain recovery reconciliation remains open under NOG-05 and must pass `scripts/verify-protected-recovery-reconciliation-evidence.mjs`. |
| Incident readiness | NOG-07 remains open until `docs/launch/generated/incident-readiness-evidence-request-20260812.json` is satisfied and `scripts/verify-incident-readiness-evidence.mjs` passes. |
| Disabled capability scope | NOG-10/NOG-11/NOG-12 remain accepted only while real-money Exchange, custody/deposits/withdrawals, enterprise, white-label and public rewards stay disabled. |
| Accepted risks | Accepted-risk owner sign-off evidence for NOG-08 is still missing; `docs/launch/generated/accepted-risk-signoff-evidence-20260812.json` and `scripts/verify-accepted-risk-signoff-evidence.mjs` remain authoritative. |
| Final approvals | The Go approval matrix in `docs/launch/generated/go-approval-matrix-evidence-request-20260812.json` remains required for NOG-09 and must pass `scripts/verify-go-approval-matrix-evidence.mjs`. |

## Decision

This exact candidate permits protected evidence collection after the promotion gates pass. It does not move TecPey to Go. Go remains blocked by protected staging, recovery reconciliation, incident readiness, accepted-risk owner sign-off and approvals.

**Current decision: NO-GO until remaining operational evidence and the Go approval matrix are accepted for this exact candidate.**
