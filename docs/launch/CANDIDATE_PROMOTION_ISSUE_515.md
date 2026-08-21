# Controlled Launch Candidate Promotion — Issue #515

**Status:** Phase 2 evidence-recollection checkpoint; not launch evidence

**Current accepted candidate with historical exact-candidate evidence:** `9bd4ca5ec22e99e2d7deb192826ef8c018ee4913`

**Current exact main / proposed next candidate:** `0ec1468d90869401cea8ccb2b9271de14f228792`

**Proposed candidate source:** `main` after PR #521

**Protected execution during promotion:** blocked

The previous accepted candidate `9bd4ca5ec22e99e2d7deb192826ef8c018ee4913` is stale after post-#437 runtime, security, notification, outbound-link, observability, alert-delivery and production-email readiness changes. Protected-staging or final release evidence MUST NOT be collected against that stale candidate. The proposed candidate is recorded separately in `docs/launch/generated/candidate-promotion-state-20260821.json`; it is not treated as accepted until genuine exact-SHA evidence is recollected.

## Two-phase fail-closed promotion

Phase 1 installed the machine-readable promotion guard and blocked protected execution while preserving historical evidence binding to the old candidate.

Phase 2 now targets the exact post-PR #521 main commit `0ec1468d90869401cea8ccb2b9271de14f228792`. The recollection request is `docs/launch/generated/candidate-evidence-recollection-request-20260821.json`.

The human/JSON candidate ledger and protected-staging target may move only after genuine exact-head workflow, runtime-image and rollback/volume-restore evidence exists for the proposed SHA and all authority checks pass.

## Required implementation

1. Re-read `main` immediately before final promotion. If Claude or another agent advances runtime/deployment/security/bundle/launch-control behavior, refresh the proposed SHA first.
2. Recollect genuine exact-head workflow evidence for `0ec1468d90869401cea8ccb2b9271de14f228792` before NOG-04 can be accepted there.
3. Recollect genuine runtime image digest evidence for the same exact SHA before NOG-03 can be accepted there.
4. Recollect genuine rollback/volume-restore evidence for the same exact SHA before NOG-06 can be accepted there.
5. Only after 2-4, atomically align the human and machine-readable candidate ledgers, protected-staging activation runbook, protected-staging evidence request and No-Go register to the same exact SHA.
6. Do not rewrite historical workflow URLs, image digests, rollback artifacts, timestamps or accepted evidence to pretend that they were produced for the new candidate.
7. NOG-01, NOG-02, NOG-05, NOG-07, NOG-08 and NOG-09 remain open until real accepted evidence exists.
8. Real-money Exchange, custody/deposits/withdrawals, enterprise, white-label and public rewards remain launch-disabled/NO-GO under their existing gates.
9. Candidate-lineage, launch-decision, exact-head evidence, runtime-image, rollback, staging-evidence and full CI gates must pass on the exact promotion head before merge.

## Evidence truth boundary

The PR-head evidence from PR #518 (`6c2bcbbc7c7e32fa00cbff2c3583507f4eda5b5c`) and PR #521 (`6145c03bdee9da4d06b781175a60b63d38cba568`) is useful validation of those code changes, but it is not exact-candidate evidence for the squash-merge commit `0ec1468d90869401cea8ccb2b9271de14f228792` and must not be substituted for it.

Likewise, historical accepted evidence attached to `9bd4ca5ec22e99e2d7deb192826ef8c018ee4913` remains historical and must not be relabelled.

## Guard now enforced

`scripts/check-controlled-launch-candidate-lineage.mjs` validates the two-phase promotion state. It requires:

- the proposed SHA to be a different exact 40-character SHA from the currently accepted candidate;
- `protectedExecutionAllowed` to remain `false` while promotion is pending;
- NOG-03/NOG-04/NOG-06 to be explicitly identified as stale accepted evidence requiring recollection;
- NOG-01/02/05/07/08/09 to remain open;
- real-money and expanded-scope capability boundaries to remain disabled.

## Parallel-safety rule

Claude or another agent may advance `main` while this work is in progress. Re-read `main` immediately before any final promotion commit. If runtime, deployment, security, bundle or launch-control behavior changed, target the newer stable exact SHA rather than this checkpoint SHA.
