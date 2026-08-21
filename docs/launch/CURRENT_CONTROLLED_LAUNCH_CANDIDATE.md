# Current Controlled Launch Candidate

**Status:** active candidate identity ledger, not Go approval  
**Decision:** NO-GO until accepted exact-candidate and remaining operational evidence is attached  
**Current candidate SHA:** `e4065675473170f62f0ed4dec8641f8d77722725`  
**Candidate source:** `main` after PR #523 exact-main launch-control hardening  
**Candidate selected at:** `2026-08-21T15:35:58Z`  
**Machine-readable ledger:** `docs/launch/generated/current-controlled-launch-candidate.json`  
**Runtime image digest evidence:** `docs/launch/generated/runtime-image-digest-evidence-20260812.json`  
**Exact-head workflow evidence:** `docs/launch/generated/exact-head-workflow-evidence-20260812.json`  
**Rollback/volume-restore evidence:** `docs/launch/generated/rollback-volume-restore-evidence-20260812.json`  
**Disabled-capability attestation evidence:** `docs/launch/generated/disabled-capability-attestation-evidence-20260812.json`  
**Incident readiness evidence request:** `docs/launch/generated/incident-readiness-evidence-request-20260812.json`  
**Accepted-risk owner sign-off evidence:** `docs/launch/generated/accepted-risk-signoff-evidence-20260812.json`  
**Go approval matrix evidence request:** `docs/launch/generated/go-approval-matrix-evidence-request-20260812.json`

This file is the source of truth for the next controlled soft-launch evidence collection. Older packets remain historical scaffolds unless this ledger explicitly lists them as active inputs.

## Why This Candidate Exists

PR #523 added the terminal promotion contract and governed exact-main evidence discovery. Its squash-merge commit on `main` is:

```text
e4065675473170f62f0ed4dec8641f8d77722725
```

Genuine exact-main evidence was then recollected for that exact SHA: schema-v2 workflow evidence includes all governed push workflows plus Scheduled Operational Recovery, Container Supply Chain produced and signed the immutable runtime image, and the exact-candidate rollback/volume-restore job served the candidate, restored PostgreSQL/Redis state and served the previous release after rollback.

This promotion accepts only the exact-candidate evidence represented by NOG-03, NOG-04 and NOG-06. It does not convert the overall decision to Go. Protected staging activation/environment evidence, protected-staging recovery reconciliation, incident readiness, accepted-risk owner sign-off and the Go approval matrix remain required.

## Superseded Draft Baselines

Historical candidate and draft baselines remain evidence history only. In particular, `9bd4ca5ec22e99e2d7deb192826ef8c018ee4913` is now the historical previously accepted candidate; its workflow URLs, image digests and rollback artifacts must not be relabelled as evidence for the current SHA.

| SHA | Previous role | Current status |
| --- | --- | --- |
| `03e77790630dac737a2d4cc4636b97e80de48ab3` | Runtime baseline in the first draft RC packet | Historical draft baseline only. |
| `a8d494f12618cc6b36c0eeae40a7b7b212754fbf` | Protected staging evidence target after PR #358 | Superseded. |
| `f64593e773642e33f5afc1c7baf9351de9e43500` | Support bundle workflow before hardening | Historical handoff baseline only. |
| `3ef67b816a4d3a0ab6c1f369aceb0063c641aedc` | Candidate after PR #367 | Superseded. |
| `7390afa2ba8509d0f46733b98d966928cb07b231` | Candidate after PR #373 | Superseded. |
| `2ab89cb920b2087aa83de23aaef9745ca6b873c9` | Candidate after PR #376 | Superseded. |
| `8a569aaa1ce7c99215a27acf86c078f4db0b494e` | Main after PR #377 | Superseded. |
| `db1f761d8fb543d1a3619ace901434b4636eeb4d` | Candidate after PR #378 | Superseded. |
| `866ff092828b15ef0e64c3508bf4904c6d22ba52` | Candidate after PR #380 | Superseded. |
| `70894e0430ed4796016c9a0952dde8de06bc788a` | Candidate after PR #382 | Superseded. |
| `55f2e92bb8238de17e0809fe54c389476517f57b` | Candidate after PR #388 | Superseded. |
| `5d68865dd56331e011829749ee970d097e9b14a4` | Candidate after PR #396 | Superseded. |
| `c2b5e58f23881635ebf507827158550a44d3f9b5` | Candidate after PR #433 | Superseded. |
| `92ccb8f18ac28232a2c1cb6cece09de52aa424f0` | Candidate after PR #435 | Superseded. |
| `389c1fed2682b73db7d46ab36a9e992cc9ba9a1d` | Mentor tenant-binding candidate line | Superseded. |
| `b55860d8444db9c1b1020f1240816a229b1a2944` | Concurrent authority hardening line | Superseded. |
| `5c933f2499fa84f7e71fcd3a1076ffe12cf3149e` | PR #441 tenant-binding line | Superseded. |
| `9bd4ca5ec22e99e2d7deb192826ef8c018ee4913` | Previously accepted exact candidate after PR #437 | Historical exact-candidate evidence only; superseded by the post-#523 candidate. |

## Candidate Identity Rules

- Every new launch evidence artifact must record this exact 40-character SHA.
- The deployed app checkout, workflow checkout, bundle manifest, `/api/health` commit and generated evidence JSON must all match this SHA.
- If a later PR changes runtime, deployment, security, bundle or launch-control behavior, this file and its generated JSON must be updated in a separate candidate-promotion PR before protected execution continues.
- Documentation-only evidence attachments may preserve this runtime candidate when they only record URLs, digests and dispositions for this exact SHA.
- Historical evidence packets may stay in the repository, but they must not be presented as current final evidence unless regenerated and accepted for this SHA.
- No support ZIP should be generated or sent to infrastructure/support until the remaining NO-GO evidence is accepted.

## Required Next Evidence

| Gate | Required before Go |
| --- | --- |
| Exact-head workflows | Accepted for NOG-04 in `docs/launch/generated/exact-head-workflow-evidence-20260812.json` using schema v2 for the exact current SHA, including Scheduled Operational Recovery. |
| Immutable runtime identity | Runtime image digest accepted for NOG-03 in `docs/launch/generated/runtime-image-digest-evidence-20260812.json`; this is identity evidence, not deployment Go approval. |
| Protected staging | NOG-01/NOG-02 evidence must still be collected on protected staging for this SHA. |
| Recovery and rollback | Rollback/volume-restore mechanics are accepted for NOG-06; protected staging recovery reconciliation remains required for NOG-05 and must pass `scripts/verify-protected-recovery-reconciliation-evidence.mjs`. |
| Incident readiness | Incident readiness remains open under NOG-07 until `docs/launch/generated/incident-readiness-evidence-request-20260812.json` is satisfied and the artifact passes `scripts/verify-incident-readiness-evidence.mjs`. |
| Disabled capability scope | Accepted launch-disabled scope for NOG-10/NOG-11/NOG-12 is preserved in the disabled-capability attestation for NOG-10/NOG-11/NOG-12. Accepted launch-disabled scope for NOG-10/NOG-11/NOG-12 is not activation evidence for Exchange, custody, enterprise, white-label or public rewards. |
| Accepted risks and approvals | Accepted-risk owner sign-off evidence for NOG-08 is still missing and must pass `scripts/verify-accepted-risk-signoff-evidence.mjs`. The Go approval matrix in `docs/launch/generated/go-approval-matrix-evidence-request-20260812.json` remains required for NOG-09 and must pass `scripts/verify-go-approval-matrix-evidence.mjs`. |

## Decision

This ledger narrows the launch-control line to one exact candidate. It does not move TecPey to Go.

The disabled-capability attestation for NOG-10/NOG-11/NOG-12 is accepted only because those capabilities remain launch-disabled or product-disabled.

The accepted-risk owner sign-off evidence for NOG-08 is still missing. This candidate does not approve a Go decision or close NOG-08.

**Current decision: NO-GO until this exact candidate has complete accepted protected staging, recovery reconciliation, incident, accepted-risk owner sign-off and approval evidence that passes `scripts/verify-go-approval-matrix-evidence.mjs`.**
