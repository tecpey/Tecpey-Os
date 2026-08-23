# Protected Staging Evidence Packet - 2026-08-10

**Packet status:** DRAFT operational evidence scaffold, not final Go approval  
**Decision:** NO-GO until protected staging, recovery reconciliation, incident, accepted-risk owner sign-off and approval evidence is accepted
**Staging evidence target SHA:** `79c48a16cb685a88315a44e103b3758cf7845d65`
**Runtime candidate baseline:** `79c48a16cb685a88315a44e103b3758cf7845d65`
**Candidate source of truth:** `docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md`  
**Evidence branch:** `agent/protected-staging-rebaseline-pr437`
**Evidence register JSON:** `docs/launch/generated/protected-staging-no-go-register-20260810.json`  
**NOG-01/NOG-02 execution request:** `docs/operations/PROTECTED_STAGING_ACTIVATION_ENV_EVIDENCE_RUNBOOK_20260810.md`, `docs/launch/generated/protected-staging-env-evidence-request-20260810.json`
**Execution status observation:** `docs/launch/generated/protected-staging-execution-status-20260812.json`
**Environment protection setup runbook:** `docs/operations/GITHUB_STAGING_ENVIRONMENT_PROTECTION_RUNBOOK_20260812.md`
**Runtime image digest evidence:** `docs/launch/generated/runtime-image-digest-evidence-20260812.json`
**Exact-head workflow evidence:** `docs/launch/generated/exact-head-workflow-evidence-20260812.json`
**Rollback/volume-restore evidence:** `docs/launch/generated/rollback-volume-restore-evidence-20260812.json`
**NOG-05 recovery reconciliation request:** `docs/launch/generated/recovery-reconciliation-evidence-request-20260812.json`
**NOG-07 incident readiness evidence request:** `docs/launch/generated/incident-readiness-evidence-request-20260812.json`
**Disabled-capability attestation evidence:** `docs/launch/generated/disabled-capability-attestation-evidence-20260812.json`
**Accepted-risk owner sign-off evidence:** `docs/launch/generated/accepted-risk-signoff-evidence-20260812.json`
**Go approval matrix evidence request:** `docs/launch/generated/go-approval-matrix-evidence-request-20260812.json`

This packet is the next release-control surface after the controlled soft launch
RC evidence packet. It converts the remaining NO-GO decision into an execution
register that can be closed one blocker at a time.

The staging evidence target is the current candidate selected in
`docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md` after PR #545 aligned
the staging host collector with the live health migration readiness contract and
Candidate Evidence Recollection Authority #106 accepted exact-main
NOG-03/NOG-04/NOG-06 evidence. Older PR #541, PR #539, PR
#437/#441, 915c/c154 and e355 recollection SHAs remain historical draft
baselines only.
Any staging deployment must record which SHA was deployed, and health/runtime
evidence must match that same SHA.

## Current Decision

| Scope | Decision | Reason |
|---|---|---|
| Controlled public FA/EN, Academy, Mentor and virtual Arena | NO-GO | Protected staging activation, env, recovery reconciliation, incident readiness, accepted-risk owner sign-off and approvals are not yet accepted. The NOG-08 guard is prepared but does not close the blocker without externally attributable owner approval; the NOG-09 guard is prepared but does not close the blocker without a verified Go approval matrix. |
| Real-money Exchange | NO-GO | Financial reconciliation, provider evidence, compliance and ambiguous-result recovery are not accepted. |
| Custody, deposits and withdrawals | NO-GO | HSM/MPC, chain-provider, settlement and on-chain reconciliation evidence are not accepted. |
| Enterprise, white-label and public rewards | NO-GO | Outside the controlled launch scope and must remain route/env/UI/copy gated. |

## NO-GO Register

| ID | Blocker | Closure action | Authority | Launch impact |
|---|---|---|---|---|
| NOG-01 | Protected staging activation evidence is missing | Run protected GitHub Environment `staging` on the intended self-hosted runner and attach the accepted artifact, detached digest and verifier summary. | docs/operations/STAGING_READINESS_EVIDENCE_CONTRACT.md | Blocks controlled soft launch Go |
| NOG-02 | Production-like environment configuration is not proven | Run `env:check` in protected staging with redacted evidence for required URLs, secrets presence, proxy trust and `DATABASE_URL` without exposing values. | docs/launch/CONTROLLED_SOFT_LAUNCH_RC_EVIDENCE_PACKET_20260810.md | Blocks final packet |
| NOG-03 | Immutable runtime image digest is recorded | Accepted for exact candidate `79c48a16cb685a88315a44e103b3758cf7845d65`: `sha256:38ab89604258c6b2f73b04e980ecd2b2a20e5486b04c64abc99ecd5edeecfd69`. | docs/launch/generated/runtime-image-digest-evidence-20260812.json | Exact release identity recorded; Go still blocked by remaining evidence |
| NOG-04 | Exact-head workflow URLs are attached for the current candidate | Accepted exact-head CI, Full Suite Diagnostics, API Security Manifest, Sensitive Mutation Audit, Repository Audit Manifest, Public Browser Golden Path, Container Supply Chain and Full History Secret Scanning run URLs for the staging target SHA. | docs/launch/generated/exact-head-workflow-evidence-20260812.json | Exact-head workflow evidence recorded; Go still blocked by remaining evidence |
| NOG-05 | Backup, restore and recovery reconciliation evidence is missing | Execute protected staging restore and domain reconciliation for Academy, Arena, Mentor, Exchange ledger, notifications/jobs and tenant/principal isolation; final evidence must pass `scripts/verify-protected-recovery-reconciliation-evidence.mjs`. | docs/operations/RECOVERY_RECONCILIATION_CONTRACT.md | Blocks restore trust |
| NOG-06 | Rollback and volume-restore evidence is attached for the current candidate | Accepted exact-candidate Container Supply Chain rollback job evidence for candidate-to-previous image serving plus synthetic PostgreSQL/Redis volume restore mechanics. | docs/launch/generated/rollback-volume-restore-evidence-20260812.json | Rollback mechanics recorded; Go still blocked by remaining evidence |
| NOG-07 | Incident readiness evidence is missing | Run two synthetic critical alert probes, prove latency under five minutes, zero pending/quarantine, record P0 acknowledgement drill, and pass `scripts/verify-incident-readiness-evidence.mjs`. | docs/launch/generated/incident-readiness-evidence-request-20260812.json | Blocks support readiness |
| NOG-08 | Accepted-risk owner sign-off evidence is missing | Attach externally attributable owner approval evidence for the exact candidate. The current guard checks the risk-register structure, stale review dates and final artifact verifier wiring, but NOG-08 remains open until sign-off evidence passes `scripts/verify-accepted-risk-signoff-evidence.mjs`. | docs/launch/generated/accepted-risk-signoff-evidence-20260812.json | Blocks executive decision until owner sign-off evidence is attached |
| NOG-09 | Go approval matrix is missing | Attach approvals from CEO, CTO/Chief Architect, Security, Product, Compliance, SRE and QA for the exact candidate and launch scope, with prerequisite evidence URLs/digests and a matrix artifact that passes `scripts/verify-go-approval-matrix-evidence.mjs`. | docs/launch/generated/go-approval-matrix-evidence-request-20260812.json | Blocks Go record |
| NOG-10 | Real-money Exchange remains launch-disabled | Accepted for controlled launch only while real-money Exchange stays launch-disabled; financial reconciliation, provider and ambiguous-result recovery evidence remain required before activation. | docs/launch/generated/disabled-capability-attestation-evidence-20260812.json | Real-money Exchange activation remains NO-GO; controlled public launch is not blocked while disabled |
| NOG-11 | Custody, deposits and withdrawals remain product-disabled | Accepted for controlled launch only while custody, deposits and withdrawals stay product-disabled; HSM/MPC, chain-provider, on-chain reconciliation and settlement evidence remain required before activation. | docs/launch/generated/disabled-capability-attestation-evidence-20260812.json | Custody, deposits and withdrawals remain NO-GO; controlled public launch is not blocked while disabled |
| NOG-12 | Enterprise, white-label and public rewards remain outside launch scope | Accepted for controlled launch only while enterprise, white-label and public rewards stay disabled, absent or explicitly gated by route/env/UI/copy guards. | docs/launch/generated/disabled-capability-attestation-evidence-20260812.json | Expanded launch scope remains NO-GO; controlled public launch is not blocked while disabled |

## Open Blocker Tracking

These GitHub issues are the live execution handoff for the blockers that remain
open. They do not replace the machine verifiers or evidence artifacts.

| ID | Tracking issue | Scope |
|---|---|---|
| NOG-01/NOG-02 | https://github.com/tecpey/Tecpey-Os/issues/365 | Protected staging activation and redacted production-like env evidence |
| NOG-05 | https://github.com/tecpey/Tecpey-Os/issues/407 | Protected staging recovery reconciliation |
| NOG-07 | https://github.com/tecpey/Tecpey-Os/issues/408 | Protected incident readiness drill |
| NOG-08 | https://github.com/tecpey/Tecpey-Os/issues/409 | Accepted-risk owner sign-off evidence |
| NOG-09 | https://github.com/tecpey/Tecpey-Os/issues/410 | Final Go approval matrix |

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

## Execution Status Observation - 2026-08-23

Current machine-readable status:
`docs/launch/generated/protected-staging-execution-status-20260812.json`.

Decision: `NO_GO_PROTECTED_STAGING_EXECUTION_BLOCKED`.

The latest GitHub API observation found the `staging` Environment protected by
both `required_reviewers` and `branch_policy`, with administrator bypass
disabled. Reviewer identities are intentionally not recorded. This satisfies
the environment-protection prerequisite, but does not close NOG-01 or NOG-02.

Protected Staging Env Evidence run `32641299129` succeeded only for the now-superseded exact candidate
`159c315cb26677edfa5b05c1708c93bed316ebe9`; it is not promoted or reused for a later candidate. Staging Community Challenge Scheduler Evidence run `32641669277` failed closed for that same SHA before artifact publication with
`host_evidence_health_contract_invalid`. PR #545 aligned the live readiness value
`migrations.status=current` with evidence schema v1 normalization. The selected candidate is now
`79c48a16cb685a88315a44e103b3758cf7845d65`. NOG-01 and NOG-02 remain open until
that exact immutable release is deployed and both governed workflows complete
successfully with verifier-passed artifacts and detached digests.

## Runtime Image Evidence - 2026-08-23

NOG-03 is accepted for immutable runtime image identity only.

| Field | Evidence |
|---|---|
| Candidate SHA | `79c48a16cb685a88315a44e103b3758cf7845d65` |
| Image | `ghcr.io/tecpey/tecpey-os` |
| Image digest | `sha256:38ab89604258c6b2f73b04e980ecd2b2a20e5486b04c64abc99ecd5edeecfd69` |
| Container Supply Chain run | `https://github.com/tecpey/Tecpey-Os/actions/runs/32642393165` |
| Release artifact | `container-release-79c48a16cb685a88315a44e103b3758cf7845d65` |
| Release artifact digest | `sha256:3c2e1b271db1807b1a5ce8c9a8738b98f3fc5d418de925b6e7d9e59946bb77f5` |
| Signature verification | Cosign verification records issuer `https://token.actions.githubusercontent.com`, subject `.github/workflows/container-supply-chain.yml@refs/heads/main`, workflow SHA `79c48a16cb685a88315a44e103b3758cf7845d65`, and docker manifest digest matching the image digest above. |

This closes only the immutable runtime image digest blocker. It did not close
protected staging, redacted env evidence, recovery reconciliation, incident
readiness, accepted-risk sign-off, approval matrix, or the
launch-disabled financial/enterprise capability blockers.

## Exact-Head Workflow Evidence - 2026-08-23

NOG-04 is accepted for exact-head workflow URL attachment only.

| Workflow | Run | Disposition |
|---|---|---|
| CI | `https://github.com/tecpey/Tecpey-Os/actions/runs/32642393215` | success on `79c48a16cb685a88315a44e103b3758cf7845d65` |
| Full Suite Diagnostics | `https://github.com/tecpey/Tecpey-Os/actions/runs/32642393181` | success on `79c48a16cb685a88315a44e103b3758cf7845d65` |
| API Security Manifest | `https://github.com/tecpey/Tecpey-Os/actions/runs/32642393195` | success on `79c48a16cb685a88315a44e103b3758cf7845d65` |
| Sensitive Mutation Audit | `https://github.com/tecpey/Tecpey-Os/actions/runs/32642393170` | success on `79c48a16cb685a88315a44e103b3758cf7845d65` |
| Repository Audit Manifest | `https://github.com/tecpey/Tecpey-Os/actions/runs/32642393172` | success on `79c48a16cb685a88315a44e103b3758cf7845d65` |
| Public Browser Golden Path | `https://github.com/tecpey/Tecpey-Os/actions/runs/32642393275` | success on `79c48a16cb685a88315a44e103b3758cf7845d65` |
| Container Supply Chain | `https://github.com/tecpey/Tecpey-Os/actions/runs/32642393165` | success on `79c48a16cb685a88315a44e103b3758cf7845d65` |
| Full History Secret Scanning | `https://github.com/tecpey/Tecpey-Os/actions/runs/32642393159` | success on `79c48a16cb685a88315a44e103b3758cf7845d65` |
| Scheduled Operational Recovery | `https://github.com/tecpey/Tecpey-Os/actions/runs/32642401435` | success on `79c48a16cb685a88315a44e103b3758cf7845d65` |

This closes only the exact-head workflow URL blocker. The scheduled recovery
dispatch is accepted as a governed exact-main workflow URL; protected staging
domain recovery reconciliation remains under NOG-05, while protected staging
activation and redacted environment proof remain under NOG-01 and NOG-02.

## Rollback/Volume-Restore Evidence - 2026-08-23

NOG-06 is accepted for exact-candidate ephemeral rollback and synthetic
PostgreSQL/Redis volume-restore mechanics only.

| Field | Evidence |
|---|---|
| Candidate SHA | `79c48a16cb685a88315a44e103b3758cf7845d65` |
| Previous release SHA | `a5b55caf281fe05cd891cf408c5b0ad192d0085a` |
| Container Supply Chain run | `https://github.com/tecpey/Tecpey-Os/actions/runs/32642393165` |
| Rollback job | `Ephemeral staging rollback and volume restore`, job `97201386369`, success |
| Recovery artifact | `container-recovery-79c48a16cb685a88315a44e103b3758cf7845d65` |
| Recovery artifact digest | `sha256:90dda7310c917da6e2d09864e16445124391a9111925211f55034dc276ba4204` |
| Rollback result | candidate image served, previous-release image served after rollback |
| Volume-restore verifier | `scripts/verify-operational-recovery-evidence.mjs` passed for the candidate SHA |
| RTO sample | synthetic CI recovery completed in `6765ms` under the `300s` maximum |

This closes only the rollback/volume-restore mechanics blocker. The immediate previous main parent is recorded only as the mechanical rollback target and is not approved as a healthy release. Protected
staging activation and redacted env evidence remain under NOG-01/NOG-02, and
protected staging domain recovery reconciliation remains under NOG-05.

## Recovery Reconciliation Request - 2026-08-12

NOG-05 remains open. The machine-readable request in
`docs/launch/generated/recovery-reconciliation-evidence-request-20260812.json`
defines the protected staging artifact that must be attached before recovery can
be considered for release-owner acceptance. The final artifact must pass
`scripts/verify-protected-recovery-reconciliation-evidence.mjs` for the exact
candidate SHA and must include accepted count/hash reconciliation for Academy,
Trading Arena, Mentor AI, Exchange Ledger, notifications/jobs, and
tenant/principal isolation. Ephemeral CI restore evidence remains necessary, but
it is not accepted as protected staging domain reconciliation evidence.

## Incident Readiness Evidence Request - 2026-08-12

Incident readiness evidence request: NOG-07 remains open. The machine-readable request in
`docs/launch/generated/incident-readiness-evidence-request-20260812.json`
defines the protected staging artifact that must be attached before incident
readiness can be considered for release-owner acceptance. The final artifact
must pass `scripts/verify-incident-readiness-evidence.mjs` for the exact
candidate SHA and must include two accepted P0 synthetic alert probes under five
minutes, zero pending/quarantine counts, P0 acknowledgement by incident
commander and SRE owner, independent review, and accepted runbook coverage for
DB, Redis, migration, alert delivery, provider, worker and reconciliation
failures.

## Disabled Capability Attestation Evidence - 2026-08-12

NOG-10/NOG-11/NOG-12 are accepted only as disabled-scope evidence for the
controlled public launch.

| Field | Evidence |
|---|---|
| Candidate SHA | `79c48a16cb685a88315a44e103b3758cf7845d65` |
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

## Accepted-Risk Owner Sign-Off Evidence - 2026-08-12

Owner sign-off evidence for NOG-08 is still missing. This artifact prepares the
accepted-risk register and stale-review-date guard for the selected candidate
SHA, but it does not close NOG-08.
NOG-08 remains open until owner sign-off evidence is attached.

| Field | Evidence |
|---|---|
| Candidate SHA | `79c48a16cb685a88315a44e103b3758cf7845d65` |
| Evidence artifact | `docs/launch/generated/accepted-risk-signoff-evidence-20260812.json` |
| Authority guard | `scripts/check-accepted-risk-signoff-evidence-authority.mjs` |
| Final artifact verifier | `scripts/verify-accepted-risk-signoff-evidence.mjs` |
| Negative tests | `npm run test:accepted-risk-signoff-evidence` |
| Risk register authority | `scripts/accepted-risk-register-authority-policy.mjs` |
| Accepted scope | None; NOG-08 remains open pending owner sign-off evidence |

The accepted-risk register contains named accountable owners, exact review
dates, measurable thresholds, user-communication boundaries and rollback or halt
triggers for the narrow controlled Academy, Mentor and virtual Arena scope.
The final NOG-08 artifact must include every controlled-launch risk owner
sign-off, the `docs/LAUNCH_ACCEPTED_RISKS.md` digest, exact review-date
freshness, governed GitHub evidence URLs and SHA-256 digests, and it must pass
`scripts/verify-accepted-risk-signoff-evidence.mjs` for the selected candidate
SHA.

Owner sign-off evidence for NOG-08 is still missing. This evidence does not
approve a Go decision and does not substitute protected staging activation,
production-like env evidence, recovery reconciliation, incident readiness,
accepted-risk owner sign-off or the Go approval matrix. Go remains blocked by
protected staging, recovery reconciliation, incident readiness, accepted-risk
owner sign-off and approval evidence.

## Go Approval Matrix Evidence Request - 2026-08-12

Go approval matrix evidence for NOG-09 is still missing. This request prepares
the final approval artifact contract for the selected candidate SHA, but it does
not close NOG-09.
NOG-09 remains open until the final matrix passes
`scripts/verify-go-approval-matrix-evidence.mjs`.

| Field | Evidence |
|---|---|
| Candidate SHA | `79c48a16cb685a88315a44e103b3758cf7845d65` |
| Evidence request | `docs/launch/generated/go-approval-matrix-evidence-request-20260812.json` |
| Authority guard | `scripts/check-go-approval-matrix-evidence-authority.mjs` |
| Verifier | `scripts/verify-go-approval-matrix-evidence.mjs` |
| Required roles | CEO, CTO or Chief Architect, Security, Product, Compliance, SRE and QA |
| Accepted scope | None; NOG-09 remains open pending verified approval matrix evidence |

The final approval matrix must include accepted prerequisite evidence URL and
SHA-256 digest coverage for NOG-01/NOG-02/NOG-03/NOG-04/NOG-05/NOG-06/NOG-07/
NOG-08/NOG-10/NOG-11/NOG-12. It can approve only the controlled public FA/EN,
Academy, Mentor and virtual Arena scope; real-money Exchange, custody,
deposits, withdrawals, public rewards, enterprise and white-label remain
disabled or separately blocked.

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
