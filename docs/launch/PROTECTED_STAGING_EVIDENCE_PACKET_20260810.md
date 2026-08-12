# Protected Staging Evidence Packet - 2026-08-10

**Packet status:** DRAFT operational evidence scaffold, not final Go approval  
**Decision:** NO-GO until protected staging, recovery reconciliation, incident and approval evidence is accepted
**Staging evidence target SHA:** `55f2e92bb8238de17e0809fe54c389476517f57b`
**Runtime candidate baseline:** `55f2e92bb8238de17e0809fe54c389476517f57b`
**Candidate source of truth:** `docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md`  
**Evidence branch:** `agent/gated-capability-attestation-evidence-nog12`
**Evidence register JSON:** `docs/launch/generated/protected-staging-no-go-register-20260810.json`  
**NOG-01/NOG-02 execution request:** `docs/operations/PROTECTED_STAGING_ACTIVATION_ENV_EVIDENCE_RUNBOOK_20260810.md`, `docs/launch/generated/protected-staging-env-evidence-request-20260810.json`
**Execution status observation:** `docs/launch/generated/protected-staging-execution-status-20260812.json`
**Runtime image digest evidence:** `docs/launch/generated/runtime-image-digest-evidence-20260812.json`
**Exact-head workflow evidence:** `docs/launch/generated/exact-head-workflow-evidence-20260812.json`
**Rollback/volume-restore evidence:** `docs/launch/generated/rollback-volume-restore-evidence-20260812.json`
**Disabled-capability attestation evidence:** `docs/launch/generated/disabled-capability-attestation-evidence-20260812.json`
**Accepted-risk sign-off evidence:** `docs/launch/generated/accepted-risk-signoff-evidence-20260812.json`

This packet is the next release-control surface after the controlled soft launch
RC evidence packet. It converts the remaining NO-GO decision into an execution
register that can be closed one blocker at a time.

The staging evidence target is the current candidate selected in
`docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md` after PR #388 added
provenance-aware landing growth evidence on top of PR #387's governed UI
primitive contracts, PR #386's Academy mastery season review orchestration, PR
#382's NOG-12 product truth and disabled route guards, PR #380's exact-head Full
Suite Diagnostics hardening, PR #378's post-merge evidence trigger, PR #376's
protected staging environment evidence automation, PR #375's candidate lineage
guard and PR #373's tenant-isolation proof package. Older PR #382, PR #380, PR
#378, PR #376, PR #373, PR #367, PR #358 and first RC-packet SHAs remain
historical draft baselines only.
Any staging deployment must record which SHA was deployed, and health/runtime
evidence must match that same SHA.

## Current Decision

| Scope | Decision | Reason |
|---|---|---|
| Controlled public FA/EN, Academy, Mentor and virtual Arena | NO-GO | Protected staging activation, env, recovery reconciliation, incident readiness and approvals are not yet accepted. Accepted-risk register evidence for NOG-08 is accepted but is not Go approval. |
| Real-money Exchange | NO-GO | Financial reconciliation, provider evidence, compliance and ambiguous-result recovery are not accepted. |
| Custody, deposits and withdrawals | NO-GO | HSM/MPC, chain-provider, settlement and on-chain reconciliation evidence are not accepted. |
| Enterprise, white-label and public rewards | NO-GO | Outside the controlled launch scope and must remain route/env/UI/copy gated. |

## NO-GO Register

| ID | Blocker | Closure action | Authority | Launch impact |
|---|---|---|---|---|
| NOG-01 | Protected staging activation evidence is missing | Run protected GitHub Environment `staging` on the intended self-hosted runner and attach the accepted artifact, detached digest and verifier summary. | docs/operations/STAGING_READINESS_EVIDENCE_CONTRACT.md | Blocks controlled soft launch Go |
| NOG-02 | Production-like environment configuration is not proven | Run `env:check` in protected staging with redacted evidence for required URLs, secrets presence, proxy trust and `DATABASE_URL` without exposing values. | docs/launch/CONTROLLED_SOFT_LAUNCH_RC_EVIDENCE_PACKET_20260810.md | Blocks final packet |
| NOG-03 | Immutable runtime image digest is recorded | Accepted for exact candidate `55f2e92bb8238de17e0809fe54c389476517f57b`: `sha256:f8f1996d92460f37823bca0c1a8c830e5fbd8992699a4cd41f6e065dd9d1f365`. | docs/launch/generated/runtime-image-digest-evidence-20260812.json | Exact release identity recorded; Go still blocked by remaining evidence |
| NOG-04 | Exact-head workflow URLs are attached for the current candidate | Accepted exact-head CI, Full Suite Diagnostics, API Security Manifest, Sensitive Mutation Audit, Repository Audit Manifest, Public Browser Golden Path, Container Supply Chain and Full History Secret Scanning run URLs for the staging target SHA. | docs/launch/generated/exact-head-workflow-evidence-20260812.json | Exact-head workflow evidence recorded; Go still blocked by remaining evidence |
| NOG-05 | Backup, restore and recovery reconciliation evidence is missing | Execute protected staging restore and domain reconciliation for Academy, Arena, Mentor, Exchange ledger, notifications/jobs and tenant/principal isolation. | docs/operations/RECOVERY_RECONCILIATION_CONTRACT.md | Blocks restore trust |
| NOG-06 | Rollback and volume-restore evidence is attached for the current candidate | Accepted exact-candidate Container Supply Chain rollback job evidence for candidate-to-previous image serving plus synthetic PostgreSQL/Redis volume restore mechanics. | docs/launch/generated/rollback-volume-restore-evidence-20260812.json | Rollback mechanics recorded; Go still blocked by remaining evidence |
| NOG-07 | Incident readiness evidence is missing | Run two synthetic critical alert probes, prove latency under five minutes, zero pending/quarantine, and record P0 acknowledgement drill. | docs/operations/INCIDENT_READINESS_CONTRACT.md | Blocks support readiness |
| NOG-08 | Accepted-risk register evidence is current for the selected candidate | Accepted-risk register evidence for NOG-08 is accepted for the narrow controlled-launch scope: owner-role coverage, exact review dates, measurable thresholds, user communication and rollback/halt triggers are current. This is not Go approval. | docs/launch/generated/accepted-risk-signoff-evidence-20260812.json | Risk-register evidence recorded; Go still blocked by staging, recovery, incident and approval evidence |
| NOG-09 | Go approval matrix is missing | Attach approvals from CEO, CTO/Chief Architect, Security, Product, Compliance, SRE and QA for the exact candidate and launch scope. | docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md | Blocks Go record |
| NOG-10 | Real-money Exchange remains launch-disabled | Accepted for controlled launch only while real-money Exchange stays launch-disabled; financial reconciliation, provider and ambiguous-result recovery evidence remain required before activation. | docs/launch/generated/disabled-capability-attestation-evidence-20260812.json | Real-money Exchange activation remains NO-GO; controlled public launch is not blocked while disabled |
| NOG-11 | Custody, deposits and withdrawals remain product-disabled | Accepted for controlled launch only while custody, deposits and withdrawals stay product-disabled; HSM/MPC, chain-provider, on-chain reconciliation and settlement evidence remain required before activation. | docs/launch/generated/disabled-capability-attestation-evidence-20260812.json | Custody, deposits and withdrawals remain NO-GO; controlled public launch is not blocked while disabled |
| NOG-12 | Enterprise, white-label and public rewards remain outside launch scope | Accepted for controlled launch only while enterprise, white-label and public rewards stay disabled, absent or explicitly gated by route/env/UI/copy guards. | docs/launch/generated/disabled-capability-attestation-evidence-20260812.json | Expanded launch scope remains NO-GO; controlled public launch is not blocked while disabled |

## First Execution Slice

The next engineering/operations slice should close **NOG-01** and **NOG-02**
together:

1. run the protected `staging` environment workflow for the exact staging target
   SHA;
2. collect the host evidence required by
   `docs/operations/STAGING_READINESS_EVIDENCE_CONTRACT.md`;
3. run `env:check` only in the protected staging/prod-like environment and
   preserve redacted pass/fail evidence;
4. upload the canonical evidence artifact, detached SHA-256 digest and verifier
   summary;
5. update the final launch manifest only with HTTPS URLs, SHA-256 digests and
   release identifiers.

The executable request for this slice is now captured in:

| Artifact | Purpose |
|---|---|
| `docs/operations/PROTECTED_STAGING_ACTIVATION_ENV_EVIDENCE_RUNBOOK_20260810.md` | Operator-facing runbook for protected staging activation and redacted `env:check` evidence. |
| `docs/launch/generated/protected-staging-env-evidence-request-20260810.json` | Machine-readable request for manifest automation and release review. |

These artifacts do not close NOG-01 or NOG-02. They make the evidence collection
ready to execute on the protected staging host without exposing secrets.

## Execution Status Observation - 2026-08-12

Current machine-readable status:
`docs/launch/generated/protected-staging-execution-status-20260812.json`.

Decision: `NO_GO_PROTECTED_STAGING_EXECUTION_BLOCKED`.

The latest GitHub API observation found the `staging` Environment exists, but
its `protection_rules: []` response means it cannot yet be treated as accepted
protected staging evidence. The protected env workflow has no observed runs, and
the only observed scheduler evidence run was cancelled on an older SHA. NOG-01
and NOG-02 remain open until the staging Environment has required protection
rules/reviewers and both manual workflow runs complete successfully for the
selected candidate SHA.

## Runtime Image Evidence - 2026-08-12

NOG-03 is accepted for immutable runtime image identity only.

| Field | Evidence |
|---|---|
| Candidate SHA | `55f2e92bb8238de17e0809fe54c389476517f57b` |
| Image | `ghcr.io/tecpey/tecpey-os` |
| Image digest | `sha256:f8f1996d92460f37823bca0c1a8c830e5fbd8992699a4cd41f6e065dd9d1f365` |
| Container Supply Chain run | `https://github.com/tecpey/Tecpey-Os/actions/runs/31559911811` |
| Release artifact | `container-release-55f2e92bb8238de17e0809fe54c389476517f57b` |
| Release artifact digest | `sha256:db0a734eeae399a5b7ab5fea3d0daa6d76958e93d74bbf11db6e199062fc4b08` |
| Signature verification | Cosign verification records issuer `https://token.actions.githubusercontent.com`, subject `.github/workflows/container-supply-chain.yml@refs/heads/main`, workflow SHA `55f2e92bb8238de17e0809fe54c389476517f57b`, and docker manifest digest matching the image digest above. |

This closes only the immutable runtime image digest blocker. It did not close
protected staging, redacted env evidence, recovery reconciliation, incident
readiness, accepted-risk sign-off, approval matrix, or the
launch-disabled financial/enterprise capability blockers.

## Exact-Head Workflow Evidence - 2026-08-12

NOG-04 is accepted for exact-head workflow URL attachment only.

| Workflow | Run | Disposition |
|---|---|---|
| CI | `https://github.com/tecpey/Tecpey-Os/actions/runs/31559911781` | success on `55f2e92bb8238de17e0809fe54c389476517f57b` |
| Full Suite Diagnostics | `https://github.com/tecpey/Tecpey-Os/actions/runs/31559911951` | success on `55f2e92bb8238de17e0809fe54c389476517f57b` |
| API Security Manifest | `https://github.com/tecpey/Tecpey-Os/actions/runs/31559911808` | success on `55f2e92bb8238de17e0809fe54c389476517f57b` |
| Sensitive Mutation Audit | `https://github.com/tecpey/Tecpey-Os/actions/runs/31559911818` | success on `55f2e92bb8238de17e0809fe54c389476517f57b` |
| Repository Audit Manifest | `https://github.com/tecpey/Tecpey-Os/actions/runs/31559911907` | success on `55f2e92bb8238de17e0809fe54c389476517f57b` |
| Public Browser Golden Path | `https://github.com/tecpey/Tecpey-Os/actions/runs/31559911856` | success on `55f2e92bb8238de17e0809fe54c389476517f57b` |
| Container Supply Chain | `https://github.com/tecpey/Tecpey-Os/actions/runs/31559911811` | success on `55f2e92bb8238de17e0809fe54c389476517f57b` |
| Full History Secret Scanning | `https://github.com/tecpey/Tecpey-Os/actions/runs/31559911749` | success on `55f2e92bb8238de17e0809fe54c389476517f57b` |

This closes only the exact-head workflow URL blocker. Operational Recovery and
product-domain recovery reconciliation remain under NOG-05, while protected
staging activation and redacted environment proof remain under NOG-01 and
NOG-02.

## Rollback/Volume-Restore Evidence - 2026-08-12

NOG-06 is accepted for exact-candidate ephemeral rollback and synthetic
PostgreSQL/Redis volume-restore mechanics only.

| Field | Evidence |
|---|---|
| Candidate SHA | `55f2e92bb8238de17e0809fe54c389476517f57b` |
| Previous release SHA | `e51f591b1af3195c625a839cbe8212b1720a0f9c` |
| Container Supply Chain run | `https://github.com/tecpey/Tecpey-Os/actions/runs/31559911811` |
| Rollback job | `Ephemeral staging rollback and volume restore`, job `93999940637`, success |
| Recovery artifact | `container-recovery-55f2e92bb8238de17e0809fe54c389476517f57b` |
| Recovery artifact digest | `sha256:f2de21d7bdcd9c7467d77f0a337d7e0fd1b89f764c7208e31bfba0c3eb2f6378` |
| Rollback result | candidate image served, previous-release image served after rollback |
| Volume-restore verifier | `scripts/verify-operational-recovery-evidence.mjs` passed for the candidate SHA |
| RTO sample | synthetic CI recovery completed in `5124ms` under the `300s` maximum |

This closes only the rollback/volume-restore mechanics blocker. Protected
staging activation and redacted env evidence remain under NOG-01/NOG-02, and
protected staging domain recovery reconciliation remains under NOG-05.

## Disabled Capability Attestation Evidence - 2026-08-12

NOG-10/NOG-11/NOG-12 are accepted only as disabled-scope evidence for the
controlled public launch.

| Field | Evidence |
|---|---|
| Candidate SHA | `55f2e92bb8238de17e0809fe54c389476517f57b` |
| Evidence artifact | `docs/launch/generated/disabled-capability-attestation-evidence-20260812.json` |
| Authority guard | `scripts/check-gated-capability-evidence-authority.mjs` |
| Product-truth guard | `npm run launch:disabled-capabilities:check` |
| Negative tests | `npm run test:disabled-capability-attestation` |
| Accepted scope | Accepted launch-disabled scope for NOG-10/NOG-11/NOG-12 |

NOG-10 is accepted only as launch-disabled real-money Exchange scope for the
controlled public launch. NOG-11 is accepted only as product-disabled custody,
deposit and withdrawal scope for the controlled public launch. NOG-12 is
accepted only as disabled enterprise, white-label and public rewards scope for
the controlled public launch.

This evidence does not authorize real-money Exchange, custody, deposits,
withdrawals, enterprise, white-label or public reward activation.

## Accepted-Risk Sign-Off Evidence - 2026-08-12

NOG-08 is accepted only as current controlled-launch accepted-risk register
evidence for the selected candidate SHA.

| Field | Evidence |
|---|---|
| Candidate SHA | `55f2e92bb8238de17e0809fe54c389476517f57b` |
| Evidence artifact | `docs/launch/generated/accepted-risk-signoff-evidence-20260812.json` |
| Authority guard | `scripts/check-accepted-risk-signoff-evidence-authority.mjs` |
| Risk register authority | `scripts/accepted-risk-register-authority-policy.mjs` |
| Accepted scope | Accepted-risk register evidence for NOG-08 |

The accepted-risk register contains named accountable owners, exact review
dates, measurable thresholds, user-communication boundaries and rollback or halt
triggers for the narrow controlled Academy, Mentor and virtual Arena scope.

This evidence does not approve a Go decision and does not substitute protected
staging activation, production-like env evidence, recovery reconciliation,
incident readiness or the Go approval matrix. Go remains blocked by protected
staging, recovery reconciliation, incident readiness and approval evidence.

## Evidence Privacy Boundary

Evidence must contain only hashes, release identifiers, redacted pass/fail
summaries and HTTPS artifact URLs. It must not contain secrets, database URLs,
host IPs, raw logs, raw customer rows, private keys, provider payloads or prompt
transcripts.

## Decision Rule

This packet may be merged as a planning/evidence-control artifact, but it does
not change launch readiness. The final decision remains:

**NO-GO until every blocker in the register has accepted evidence or the related
capability remains explicitly launch-disabled.**
