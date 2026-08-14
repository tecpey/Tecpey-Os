# Current Controlled Launch Candidate

**Status:** active candidate identity ledger, not Go approval  
**Decision:** NO-GO until accepted exact-candidate evidence is attached  
**Current candidate SHA:** `389c1fed2682b73db7d46ab36a9e992cc9ba9a1d`
**Candidate source:** `main` after PR #434 on top of PR #435
**Candidate selected at:** `2026-08-14T13:56:09Z`
**Machine-readable ledger:** `docs/launch/generated/current-controlled-launch-candidate.json`
**Runtime image digest evidence:** `docs/launch/generated/runtime-image-digest-evidence-20260812.json`
**Exact-head workflow evidence:** `docs/launch/generated/exact-head-workflow-evidence-20260812.json`
**Rollback/volume-restore evidence:** `docs/launch/generated/rollback-volume-restore-evidence-20260812.json`
**Disabled-capability attestation evidence:** `docs/launch/generated/disabled-capability-attestation-evidence-20260812.json`
**Incident readiness evidence request:** `docs/launch/generated/incident-readiness-evidence-request-20260812.json`
**Accepted-risk owner sign-off evidence:** `docs/launch/generated/accepted-risk-signoff-evidence-20260812.json`
**Go approval matrix evidence request:** `docs/launch/generated/go-approval-matrix-evidence-request-20260812.json`

This file is the source of truth for the next controlled soft-launch evidence
collection. Older 2026-08-10 packets remain historical draft scaffolds unless
this ledger explicitly lists them as active inputs.

## Why This Candidate Exists

PR #391 through PR #435 materially changed the launch-control line after the
previous candidate. After the PR #435 promotion, PR #434 also landed on `main`
with Mentor conversation and insight tenant-binding fixes. The current main now
includes immutable runtime-image digest evidence, exact-head workflow evidence,
rollback and volume-restore evidence, gated disabled-capability evidence,
accepted-risk signoff verification, News Intelligence Graph wiring, News
Provider Readiness authority, support install rehearsal hardening, PR #433
auth-provider review decision authority, PR #435's strict readiness audit plus
candidate-evidence promotion, and PR #434's Mentor tenant-binding security fix.
Because these changes affect launch evidence, source bundle handoff, news
materialization safety and the final protected-staging target, all new evidence
collection must use the SHA that contains them:

```text
389c1fed2682b73db7d46ab36a9e992cc9ba9a1d
```

Using the prior PR #435 or PR #433 candidate for new staging/support evidence
would make the final evidence packet stale before execution.

## Superseded Draft Baselines

| SHA | Previous role | Current status |
| --- | --- | --- |
| `03e77790630dac737a2d4cc4636b97e80de48ab3` | Runtime baseline in the first draft RC packet | Historical draft baseline only; not the current evidence target. |
| `a8d494f12618cc6b36c0eeae40a7b7b212754fbf` | Protected staging evidence target after PR #358 | Superseded by this ledger for all new protected staging collection. |
| `f64593e773642e33f5afc1c7baf9351de9e43500` | Support bundle workflow before hardening | Historical handoff baseline only; do not generate support bundles from it. |
| `3ef67b816a4d3a0ab6c1f369aceb0063c641aedc` | Current controlled-launch candidate after PR #367 support bundle hardening | Superseded by PR #373 for all new exact-candidate evidence collection. |
| `7390afa2ba8509d0f46733b98d966928cb07b231` | Current controlled-launch candidate after PR #373 tenant-isolation proof coverage | Superseded by PR #376 for all new protected staging and exact-candidate evidence collection. |
| `2ab89cb920b2087aa83de23aaef9745ca6b873c9` | Current controlled-launch candidate after PR #376 protected staging env evidence automation | Superseded by PR #378 for all new exact-head workflow and protected staging evidence collection. |
| `8a569aaa1ce7c99215a27acf86c078f4db0b494e` | Main after PR #377 staging evidence ledger promotion | Superseded by PR #378 for exact-head Full Suite evidence collection. |
| `db1f761d8fb543d1a3619ace901434b4636eeb4d` | Current controlled-launch candidate after PR #378 exact-head Full Suite evidence collection | Superseded by PR #380 for all new exact-head workflow and protected staging evidence collection. |
| `866ff092828b15ef0e64c3508bf4904c6d22ba52` | Current controlled-launch candidate after PR #380 exact-head Full Suite hardening | Superseded by PR #382 for all new product-truth, protected staging and exact-candidate evidence collection. |
| `70894e0430ed4796016c9a0952dde8de06bc788a` | Current controlled-launch candidate after PR #382 product-truth route guarding | Superseded by PR #388 for all new Academy orchestration, governed UI, growth evidence, protected staging and exact-candidate evidence collection. |
| `55f2e92bb8238de17e0809fe54c389476517f57b` | Current controlled-launch candidate after PR #388 provenance-aware landing growth evidence | Superseded by PR #396 for support install readiness, news readiness and exact-candidate evidence refresh. |
| `5d68865dd56331e011829749ee970d097e9b14a4` | Current controlled-launch candidate after PR #396 support install readiness, news readiness and exact-candidate evidence refresh | Superseded by PR #433 for auth-provider review decisions and new exact-candidate evidence collection. |
| `c2b5e58f23881635ebf507827158550a44d3f9b5` | Current controlled-launch candidate after PR #433 auth-provider review decisions and exact-candidate evidence refresh | Superseded by PR #435 for current-main protected staging and exact-candidate evidence collection. |
| `92ccb8f18ac28232a2c1cb6cece09de52aa424f0` | Current controlled-launch candidate after PR #435 strict readiness audit and candidate-evidence promotion | Superseded by PR #434 for Mentor tenant-binding security and new exact-candidate evidence collection. |

## Candidate Identity Rules

- Every new launch evidence artifact must record this exact 40-character SHA.
- The deployed app checkout, workflow checkout, bundle manifest, `/api/health`
  commit and generated evidence JSON must all match this SHA.
- If a later PR changes runtime, deployment, security, bundle or launch-control
  behavior, this file and its generated JSON must be updated in a separate
  candidate-promotion PR before protected execution continues.
- Documentation-only evidence attachments may preserve this runtime candidate
  when they only record URLs, digests and dispositions for this exact SHA.
- Historical evidence packets may stay in the repository, but they must not be
  presented as current final evidence unless regenerated and accepted for this
  SHA.
- No support ZIP should be generated or sent to infrastructure/support until the
  remaining NO-GO evidence is accepted.

## Required Next Evidence

| Gate | Required before Go |
| --- | --- |
| Exact-head workflows | Accepted for NOG-04 in `docs/launch/generated/exact-head-workflow-evidence-20260812.json`. |
| Immutable runtime identity | Runtime image digest accepted for this SHA; deployment artifact digest and final manifest wiring still required. |
| Protected staging | NOG-01/NOG-02 evidence collected on protected staging for this SHA. |
| Recovery and rollback | Rollback/volume-restore mechanics accepted for NOG-06; protected staging recovery reconciliation remains required for NOG-05 and must pass `scripts/verify-protected-recovery-reconciliation-evidence.mjs`. |
| Incident readiness | Alert delivery, ownership, acknowledgement and failure-mode evidence for this SHA; NOG-07 remains open until `docs/launch/generated/incident-readiness-evidence-request-20260812.json` is satisfied and the final protected-staging artifact passes `scripts/verify-incident-readiness-evidence.mjs`. |
| Disabled capability scope | Accepted launch-disabled scope for NOG-10/NOG-11/NOG-12 in `docs/launch/generated/disabled-capability-attestation-evidence-20260812.json`; this is not activation evidence for Exchange, custody, enterprise, white-label or public rewards. |
| Accepted risks and approvals | Accepted-risk owner sign-off evidence for NOG-08 is still missing. The prepared guard in `docs/launch/generated/accepted-risk-signoff-evidence-20260812.json` keeps NOG-08 open until externally attributable owner approval is attached and the final artifact passes `scripts/verify-accepted-risk-signoff-evidence.mjs`; the Go approval matrix for this SHA and launch scope also remains required, and NOG-09 remains open until `docs/launch/generated/go-approval-matrix-evidence-request-20260812.json` is satisfied and the final matrix passes `scripts/verify-go-approval-matrix-evidence.mjs`. |

## Decision

This ledger narrows the launch-control line to one candidate. It does not move
TecPey to Go.

The disabled-capability attestation for NOG-10/NOG-11/NOG-12 is accepted only
because those capabilities remain launch-disabled or product-disabled.

The accepted-risk owner sign-off evidence for NOG-08 is still missing. This
candidate only records the prepared risk-register/freshness guard and final
owner sign-off verifier; it does not approve a Go decision or close NOG-08.

**Current decision: NO-GO until this exact candidate has complete accepted
protected staging, recovery reconciliation, incident, accepted-risk owner
sign-off and approval evidence that passes
`scripts/verify-go-approval-matrix-evidence.mjs`.**
