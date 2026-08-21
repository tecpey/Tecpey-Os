# Controlled Launch Candidate Promotion — Issue #515

**Status:** implementation checkpoint; not launch evidence

**Current exact main at checkpoint:** `7329c3d9d8a615f106a5cf80ddd1343743f5a509`

The previous candidate `9bd4ca5ec22e99e2d7deb192826ef8c018ee4913` is stale after post-#437 runtime, security, notification, outbound-link and observability changes. Protected-staging or final release evidence MUST NOT be collected against that stale candidate.

## Required implementation

1. Promote the human and machine-readable controlled-launch candidate ledgers to the latest stable exact `main` SHA immediately before finalizing this PR.
2. Align the protected-staging activation runbook, protected-staging evidence request and No-Go register to the same exact SHA.
3. Do not rewrite historical workflow URLs, image digests, rollback artifacts, timestamps or accepted evidence to pretend that they were produced for the new candidate.
4. NOG-03, NOG-04 and NOG-06 may remain accepted only when genuine evidence exists for the promoted exact SHA. Otherwise they must return to an explicit pending/open recollection state.
5. NOG-01, NOG-02, NOG-05, NOG-07, NOG-08 and NOG-09 remain open until real accepted evidence exists.
6. Real-money Exchange, custody/deposits/withdrawals, enterprise, white-label and public rewards remain launch-disabled/NO-GO under their existing gates.
7. Candidate-lineage, launch-decision, exact-head evidence, runtime-image, rollback, staging-evidence and full CI gates must pass on the exact promotion head before merge.

## Parallel-safety rule

Claude or another agent may advance `main` while this work is in progress. Re-read `main` immediately before any final promotion commit. If runtime, deployment, security, bundle or launch-control behavior changed, target the newer stable exact SHA rather than this checkpoint SHA.

## Evidence truth boundary

This checkpoint intentionally does not modify `current-controlled-launch-candidate.json` yet. Promotion is blocked until the repository can either attach genuine exact-head evidence for the new candidate or represent NOG-03/NOG-04/NOG-06 as pending without weakening their authority checks. This prevents a mechanically consistent but evidentially false release ledger.

## Current coordination state

PR #517 was automatically closed when the branch was temporarily synchronized exactly to `main`; after restoring this checkpoint commit it must be reopened before implementation continues. This is coordination state only, not release evidence.
