# Current Controlled Launch Candidate

**Status:** active candidate identity ledger, not Go approval  
**Decision:** NO-GO until accepted exact-candidate evidence is attached  
**Current candidate SHA:** `7390afa2ba8509d0f46733b98d966928cb07b231`
**Candidate source:** `main` after PR #373
**Candidate selected at:** `2026-08-11T09:45:55Z`
**Machine-readable ledger:** `docs/launch/generated/current-controlled-launch-candidate.json`

This file is the source of truth for the next controlled soft-launch evidence
collection. Older 2026-08-10 packets remain historical draft scaffolds unless
this ledger explicitly lists them as active inputs.

## Why This Candidate Exists

PR #373 completed the tenant-isolation proof package and hardened the
controlled-launch capability boundary after PR #367's support deployment bundle
hardening. Because tenant isolation, launch-gated financial surfaces and support
handoff are all part of the launch decision boundary, the next evidence
collection must use the SHA that contains those fixes:

```text
7390afa2ba8509d0f46733b98d966928cb07b231
```

Using older draft baselines for new staging/support evidence would recreate the
ambiguity this ledger is designed to remove.

## Superseded Draft Baselines

| SHA | Previous role | Current status |
| --- | --- | --- |
| `03e77790630dac737a2d4cc4636b97e80de48ab3` | Runtime baseline in the first draft RC packet | Historical draft baseline only; not the current evidence target. |
| `a8d494f12618cc6b36c0eeae40a7b7b212754fbf` | Protected staging evidence target after PR #358 | Superseded by this ledger for all new protected staging collection. |
| `f64593e773642e33f5afc1c7baf9351de9e43500` | Support bundle workflow before hardening | Historical handoff baseline only; do not generate support bundles from it. |
| `3ef67b816a4d3a0ab6c1f369aceb0063c641aedc` | Current controlled-launch candidate after PR #367 support bundle hardening | Superseded by PR #373 for all new exact-candidate evidence collection. |

## Candidate Identity Rules

- Every new launch evidence artifact must record this exact 40-character SHA.
- The deployed app checkout, workflow checkout, bundle manifest, `/api/health`
  commit and generated evidence JSON must all match this SHA.
- If a later PR changes runtime, deployment, security, bundle, evidence or
  launch-control behavior, this file and its generated JSON must be updated in a
  separate candidate-promotion PR before evidence collection continues.
- Historical evidence packets may stay in the repository, but they must not be
  presented as current final evidence unless regenerated and accepted for this
  SHA.
- No support ZIP should be generated or sent to infrastructure/support until the
  remaining NO-GO evidence is accepted.

## Required Next Evidence

| Gate | Required before Go |
| --- | --- |
| Exact-head workflows | CI, Public Browser Golden Path, Full Suite, Sensitive Mutation, Repository Audit, Secret Scanning, API Security and Container Supply Chain evidence for this SHA. |
| Immutable runtime identity | Container/runtime image digest and deployment artifact digest for this SHA. |
| Protected staging | NOG-01/NOG-02 evidence collected on protected staging for this SHA. |
| Recovery and rollback | Backup/restore, reconciliation, rollback or approved forward-fix evidence for this SHA. |
| Incident readiness | Alert delivery, ownership, acknowledgement and failure-mode evidence for this SHA. |
| Accepted risks and approvals | Owner-approved risk register and approval matrix for this SHA and the narrow controlled launch scope. |

## Decision

This ledger narrows the launch-control line to one candidate. It does not move
TecPey to Go.

**Current decision: NO-GO until this exact candidate has complete accepted
operational evidence and every out-of-scope financial/enterprise capability
remains explicitly launch-disabled.**
