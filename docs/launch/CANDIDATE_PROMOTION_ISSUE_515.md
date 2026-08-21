# Controlled Launch Candidate Promotion — Issue #515

**Status:** exact-main NOG-03/NOG-04/NOG-06 evidence recollected and terminal promotion prepared; overall launch remains NO-GO

**Current exact candidate:** `e4065675473170f62f0ed4dec8641f8d77722725`  
**Candidate source:** `main` after PR #523  
**Historical previously accepted candidate:** `9bd4ca5ec22e99e2d7deb192826ef8c018ee4913`  
**Protected evidence collection for the promoted candidate:** permitted after this promotion passes CI  
**Overall launch decision:** NO-GO

## Exact-candidate evidence now attached

NOG-04 is backed by schema-v2 exact-head workflow evidence for all nine governed runs on `e4065675473170f62f0ed4dec8641f8d77722725`, including `Scheduled Operational Recovery` via governed `workflow_dispatch` on `main`.

NOG-03 is backed by the exact-main `Container Supply Chain` publish/attest/sign run, immutable image digest and container-release signature-verification artifact metadata for the same SHA.

NOG-06 is backed by the exact-main `Ephemeral staging rollback and volume restore` job: the candidate image was served, the previous release was served after rollback, PostgreSQL/Redis restore evidence was attached, and the recovery result is bound to the exact selected SHA.

The canonical evidence paths are:

- `docs/launch/generated/exact-head-workflow-evidence-20260812.json`
- `docs/launch/generated/runtime-image-digest-evidence-20260812.json`
- `docs/launch/generated/rollback-volume-restore-evidence-20260812.json`

## Terminal promotion boundary

The human and JSON candidate ledgers, protected-staging request/runbook/register and remaining evidence requests are aligned to the selected SHA. `docs/launch/generated/candidate-promotion-state-20260821.json` records the terminal `promoted_exact_candidate_evidence` state and `docs/launch/generated/candidate-evidence-recollection-request-20260821.json` records genuine acceptance of NOG-03/NOG-04/NOG-06 recollection.

This is not a Go decision. NOG-01, NOG-02, NOG-05, NOG-07, NOG-08 and NOG-09 remain open. Real-money Exchange, custody/deposits/withdrawals, enterprise, white-label and public rewards remain launch-disabled.

## Evidence truth boundary

PR-head evidence from PR #523 (`46c41cfd8ef912766ba6f7aaa3a7accbe4b83f81`) validates that PR but is not exact-candidate evidence for its squash-merge commit. The accepted evidence used here comes from genuine GitHub Actions runs whose `head_sha` is `e4065675473170f62f0ed4dec8641f8d77722725` and whose governed origin is verified.

Historical evidence for `9bd4ca5ec22e99e2d7deb192826ef8c018ee4913` remains historical and is not relabelled.

## Final pre-merge rule

Immediately before this evidence-only promotion PR is made Ready or merged:

1. Re-read `main` and active PRs.
2. Confirm no runtime, deployment, security, bundle or launch-control behavior has advanced beyond `e4065675473170f62f0ed4dec8641f8d77722725`.
3. Confirm every workflow on the final PR head is successful and no unresolved review thread exists.
4. Merge only with the exact expected PR head.

A later evidence-only documentation merge may preserve this runtime candidate under the candidate identity rule; any later runtime/deployment/security/bundle/launch-control change requires a new promotion cycle.
