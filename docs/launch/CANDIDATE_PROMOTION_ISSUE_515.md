# Controlled Launch Candidate Promotion — Issue #515

**Status:** Phase 3 exact-main candidate evidence promoted; operational NO-GO remains

**Current accepted candidate with historical exact-candidate evidence:** `79c48a16cb685a88315a44e103b3758cf7845d65`

**Current exact main / proposed next candidate:** `8db71529b3b9250bab2462c5c151d00c3aef2754`

**Proposed candidate source:** `main` after PR #685

**Protected execution during promotion:** allowed only for exact-candidate evidence collection

**Superseded intermediate candidate:** `5e65ec55e003986187083a71a84272676dc09ccc` (post-PR #581; historical exact-candidate evidence only)

**Current evidence authority:** Candidate Evidence Recollection Authority run https://github.com/tecpey/Tecpey-Os/actions/runs/35412133096 plus exact-main NOG-03/NOG-04/NOG-06 artifacts bound to `8db71529b3b9250bab2462c5c151d00c3aef2754`.

The accepted candidate `79c48a16cb685a88315a44e103b3758cf7845d65` and its controlled-scope Go evidence remain historical and exact-candidate-bound. They do not authorize the newer runtime. Main advanced through public runtime resilience, Academy login/profile continuity, Iran-safe authentication, secure Limoo/Resend communications operations, the PR #566 pinned OpenSSL runtime remediation, PR #568 secure Limoo Pattern OTP, and the governed product/runtime integration line through PR #685. The proposed candidate is recorded separately in `docs/launch/generated/candidate-promotion-state-20260821.json` and is accepted only for exact-SHA evidence collection after genuine NOG-03/NOG-04/NOG-06 evidence was recollected and atomically promoted.

## Two-phase fail-closed promotion

Phase 1 reopens the machine-readable promotion guard and blocks protected execution while preserving historical evidence binding to the accepted `79c48a16` candidate.

Phase 2 targets the exact post-PR #685 main commit `8db71529b3b9250bab2462c5c151d00c3aef2754`. The recollection request is `docs/launch/generated/candidate-evidence-recollection-request-20260821.json`. Exact-main workflow, container-image and rollback artifacts are attached only after the governed promotion change verifies and records their immutable URLs, IDs and digests.

The human/JSON candidate ledger and protected-staging target may move only after genuine exact-head workflow, runtime-image and rollback/volume-restore evidence exists for the proposed SHA and all authority checks pass.

## Required implementation

1. Re-read `main` immediately before final promotion. If Claude or another agent advances runtime/deployment/security/bundle/launch-control behavior, refresh the proposed SHA first.
2. Verify and attach genuine exact-head workflow evidence for `8db71529b3b9250bab2462c5c151d00c3aef2754` before NOG-04 can be accepted there.
3. Recollect genuine runtime image digest evidence for the same exact SHA before NOG-03 can be accepted there.
4. Recollect genuine rollback/volume-restore evidence for the same exact SHA before NOG-06 can be accepted there.
5. Only after 2-4, atomically align the human and machine-readable candidate ledgers, protected-staging activation runbook, protected-staging evidence request and No-Go register to the same exact SHA.
6. Do not rewrite historical workflow URLs, image digests, rollback artifacts, timestamps or accepted evidence to pretend that they were produced for the new candidate.
7. Accepted NOG-01, NOG-02, NOG-05, NOG-07, NOG-08 and NOG-09 evidence remains valid only for `79c48a16cb685a88315a44e103b3758cf7845d65`; promotion to `8db71529b3b9250bab2462c5c151d00c3aef2754` must reopen those blockers until fresh exact-candidate evidence is accepted.
8. Real-money Exchange, custody/deposits/withdrawals, enterprise, white-label and public rewards remain launch-disabled/NO-GO under their existing gates.
9. Candidate-lineage, launch-decision, exact-head evidence, runtime-image, rollback, staging-evidence and full CI gates must pass on the exact promotion head before merge.

## Evidence truth boundary

The PR-head evidence from PR #685 (`b6f034b334d8798597788435a4b9e863e1df1faa`) validates the immutable Node 24 GitHub Actions migration, but it is not exact-candidate evidence for the post-merge `main` commit `8db71529b3b9250bab2462c5c151d00c3aef2754` and must not be substituted for it.

Likewise, accepted evidence attached to `79c48a16cb685a88315a44e103b3758cf7845d65` remains exact to that historical candidate and must not be relabelled.

## Guard now enforced

`scripts/check-controlled-launch-candidate-lineage.mjs` validates the promoted state. It requires:

- the human ledger, JSON ledger, protected-staging request, runbook and No-Go register to target the same exact candidate SHA;
- `protectedExecutionAllowed: true` only after genuine NOG-03/NOG-04/NOG-06 evidence is accepted for that exact candidate, and only for protected evidence collection — never as Go approval;
- NOG-01/02/05/07/08/09 to remain open until fresh exact-candidate operational evidence is accepted;
- NOG-03/NOG-04/NOG-06 to remain bound to genuine current-candidate workflow/artifact evidence;
- real-money and expanded-scope capability boundaries to remain disabled.

## Parallel-safety rule

Claude or another agent may advance `main` while this work is in progress. Re-read `main` immediately before any final promotion commit. If runtime, deployment, security, bundle or launch-control behavior changed, target the newer stable exact SHA rather than this checkpoint SHA.
