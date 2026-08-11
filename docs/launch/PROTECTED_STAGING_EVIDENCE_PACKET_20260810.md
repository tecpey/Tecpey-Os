# Protected Staging Evidence Packet - 2026-08-10

**Packet status:** DRAFT operational evidence scaffold, not final Go approval  
**Decision:** NO-GO until protected staging, recovery, rollback, incident, risk and approval evidence is accepted  
**Staging evidence target SHA:** `866ff092828b15ef0e64c3508bf4904c6d22ba52`
**Runtime candidate baseline:** `866ff092828b15ef0e64c3508bf4904c6d22ba52`
**Candidate source of truth:** `docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md`  
**Evidence branch:** `agent/protected-staging-no-go-evidence-packet`  
**Evidence register JSON:** `docs/launch/generated/protected-staging-no-go-register-20260810.json`  
**NOG-01/NOG-02 execution request:** `docs/operations/PROTECTED_STAGING_ACTIVATION_ENV_EVIDENCE_RUNBOOK_20260810.md`, `docs/launch/generated/protected-staging-env-evidence-request-20260810.json`

This packet is the next release-control surface after the controlled soft launch
RC evidence packet. It converts the remaining NO-GO decision into an execution
register that can be closed one blocker at a time.

The staging evidence target is the current candidate selected in
`docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md` after PR #380 hardened
exact-head Full Suite Diagnostics evidence collection on top of PR #378's
post-merge evidence trigger, PR #376's protected staging environment evidence
automation, PR #375's candidate lineage guard and PR #373's tenant-isolation
proof package. Older PR #378, PR #376, PR #373, PR #367, PR #358 and first
RC-packet SHAs remain historical draft baselines only.
Any staging deployment must record which SHA was deployed, and health/runtime
evidence must match that same SHA.

## Current Decision

| Scope | Decision | Reason |
|---|---|---|
| Controlled public FA/EN, Academy, Mentor and virtual Arena | NO-GO | Protected staging activation, env, recovery, rollback, incident readiness and approvals are not yet accepted. |
| Real-money Exchange | NO-GO | Financial reconciliation, provider evidence, compliance and ambiguous-result recovery are not accepted. |
| Custody, deposits and withdrawals | NO-GO | HSM/MPC, chain-provider, settlement and on-chain reconciliation evidence are not accepted. |
| Enterprise, white-label and public rewards | NO-GO | Outside the controlled launch scope and must remain route/env/UI/copy gated. |

## NO-GO Register

| ID | Blocker | Closure action | Authority | Launch impact |
|---|---|---|---|---|
| NOG-01 | Protected staging activation evidence is missing | Run protected GitHub Environment `staging` on the intended self-hosted runner and attach the accepted artifact, detached digest and verifier summary. | docs/operations/STAGING_READINESS_EVIDENCE_CONTRACT.md | Blocks controlled soft launch Go |
| NOG-02 | Production-like environment configuration is not proven | Run `env:check` in protected staging with redacted evidence for required URLs, secrets presence, proxy trust and `DATABASE_URL` without exposing values. | docs/launch/CONTROLLED_SOFT_LAUNCH_RC_EVIDENCE_PACKET_20260810.md | Blocks final packet |
| NOG-03 | Immutable runtime image digest is missing | Build or identify the exact container/runtime image for the staging target SHA and record a SHA-256 image digest. | docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md | Blocks exact release identity |
| NOG-04 | Exact-head workflow URLs are not attached to a final manifest | Attach exact-head CI, repository audit, Public Browser Golden Path and secret scanning workflow URLs for the staging target SHA. | docs/launch/generated/controlled-soft-launch-rc-evidence-packet-20260810.json | Blocks final manifest |
| NOG-05 | Backup, restore and recovery reconciliation evidence is missing | Execute protected staging restore and domain reconciliation for Academy, Arena, Mentor, Exchange ledger, notifications/jobs and tenant/principal isolation. | docs/operations/RECOVERY_RECONCILIATION_CONTRACT.md | Blocks restore trust |
| NOG-06 | Rollback or forward-fix evidence is missing | Prove rollback from the staging target to the previous accepted release, or record an approved irreversible-migration forward-fix decision with owner. | docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md | Blocks deployment safety |
| NOG-07 | Incident readiness evidence is missing | Run two synthetic critical alert probes, prove latency under five minutes, zero pending/quarantine, and record P0 acknowledgement drill. | docs/operations/INCIDENT_READINESS_CONTRACT.md | Blocks support readiness |
| NOG-08 | Accepted-risk sign-off is not final evidence | Attach owner-approved accepted-risk sign-off for this exact candidate, including review dates, thresholds, user communication and rollback triggers. | docs/LAUNCH_ACCEPTED_RISKS.md | Blocks executive decision |
| NOG-09 | Go approval matrix is missing | Attach approvals from CEO, CTO/Chief Architect, Security, Product, Compliance, SRE and QA for the exact candidate and launch scope. | docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md | Blocks Go record |
| NOG-10 | Real-money Exchange remains uncertified | Keep Exchange launch-disabled until decimal conservation, order/trade/hold/balance/fee/ledger reconciliation, ambiguous-result recovery and provider evidence are accepted. | docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md | Blocks real-money Exchange only |
| NOG-11 | Custody, deposits and withdrawals remain uncertified | Keep custody/deposit/withdrawal paths product-disabled until HSM/MPC, chain-provider certification, on-chain reconciliation and settlement evidence are accepted. | docs/operations/RECOVERY_RECONCILIATION_CONTRACT.md | Blocks custody and withdrawals only |
| NOG-12 | Enterprise, white-label and public rewards remain outside launch scope | Preserve route/env/UI/copy guards so these surfaces cannot be advertised or activated by accident. | docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md | Blocks expanded launch scope |

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
