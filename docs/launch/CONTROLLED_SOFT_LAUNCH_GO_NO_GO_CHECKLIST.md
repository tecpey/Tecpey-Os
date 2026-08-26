# Controlled Soft Launch Go/No-Go Checklist

- **Status:** NO-GO until every blocking row below has accepted evidence
- **Current candidate SHA:** `4bc251725ce574d87258b52773e4a52ff3367252`
- **Current candidate source of truth:** `docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md`
- **Current candidate machine ledger:** `docs/launch/generated/current-controlled-launch-candidate.json`
- **Historical draft RC packet:** `03e77790630dac737a2d4cc4636b97e80de48ab3`, `docs/launch/CONTROLLED_SOFT_LAUNCH_RC_EVIDENCE_PACKET_20260810.md`
- **Active protected staging NO-GO register:** `docs/launch/PROTECTED_STAGING_EVIDENCE_PACKET_20260810.md`
- **Related:** #26, #50, #110, #229, PRs #353, #354, #355, #356, #357, #367, #373, #375, #376, #377, #378, #433, #435, #434, #436, #438, #439, #440, #441, #437, `docs/launch/CONTROLLED_LAUNCH_EVIDENCE_DIGEST_20260808.md`

This checklist is the release-decision surface for the narrow controlled Soft
Launch. It is not a marketing readiness claim, and it does not authorize
real-money Exchange, custody, deposits, withdrawals, public rewards, enterprise
or white-label activation.

## Decision scope

The only launch scope this checklist can approve is:

- public Persian and English experience;
- controlled Academy journeys;
- governed educational Mentor assistance;
- official virtual Trading Arena;
- operational evidence that proves the exact release candidate can be deployed,
  restored, rolled back, monitored, and truthfully represented.

Everything outside that scope must remain disabled, hidden, or explicitly
labelled as gated. All new evidence collection must use the current candidate
ledger above; older packet SHAs are historical draft baselines only unless a
release-owner promotion PR explicitly reselects them.

The governed final manifest and release packet for `79c48a16cb685a88315a44e103b3758cf7845d65` remain
historical evidence only. They are not active evidence for `4bc251725ce574d87258b52773e4a52ff3367252` and do not
authorize its staging deployment, merge or launch.

## Blocking checklist

| Gate | Required accepted evidence | Current decision |
|---|---|---|
| Exact release identity | One immutable release candidate SHA, image digest, migration plan hash, CI run, and deployment artifact recorded together. | NOG-03/NOG-04/NOG-06 exact-candidate evidence is accepted; operational blockers remain NO-GO. |
| Full CI and release gates | `release:check` constituents, build, runtime smoke, API security, sensitive mutation audit, repository audit, secret scanning, browser Golden Path, container and recovery workflows pass on the exact candidate. | Exact-head CI, Full Suite, API Security, Sensitive Mutation, Repository Audit, Public Golden Path, Container Supply Chain and Secret Scanning URLs are accepted for NOG-04; NO-GO remains until protected staging, recovery reconciliation, incident, accepted-risk owner sign-off and approval evidence is accepted. |
| Protected staging activation | Staging evidence satisfies `docs/operations/STAGING_READINESS_EVIDENCE_CONTRACT.md`: exact SHA, protected runner, immutable host layout, health, systemd, database operational evidence, alert probe, spool drain, artifact digest and verifier summary. | NO-GO until protected staging evidence is accepted. |
| Backup, restore and recovery | Restore evidence satisfies `docs/operations/RECOVERY_RECONCILIATION_CONTRACT.md` for Academy, Arena, Mentor, Exchange ledger/balances/orders, notifications, tenant/principal isolation and audit trails, and the protected staging domain artifact passes `scripts/verify-protected-recovery-reconciliation-evidence.mjs`. | NO-GO until restore and reconciliation evidence is accepted. |
| Rollback and forward-fix | Candidate-to-previous rollback and volume-restore evidence exist; any irreversible migration has an approved forward-fix decision and owner. | Exact-candidate rollback and synthetic PostgreSQL/Redis volume-restore evidence is accepted for NOG-06; NO-GO remains until protected staging, recovery reconciliation, incident, accepted-risk owner sign-off and approval evidence is accepted. |
| Disabled financial surfaces | Real-money Exchange, custody, deposits, withdrawals, public financial rewards and enterprise claims are impossible to activate accidentally through routes, env flags, UI copy or worker execution. | Disabled-capability attestation is accepted for NOG-10/NOG-11/NOG-12. Controlled launch may proceed only while these surfaces remain disabled; any accidental activation is NO-GO. |
| Exchange safety boundary | Decimal conservation, order/trade/hold/balance/fee/ledger reconciliation, ambiguous-result recovery and provider evidence are either accepted or the Exchange remains launch-disabled. | Accepted as launch-disabled scope only. Real-money Exchange activation remains NO-GO until separately certified. |
| Custody and withdrawal boundary | HSM/MPC, chain-provider certification, testnet/on-chain reconciliation and withdrawal settlement evidence are accepted, or every real withdrawal path remains custody-gated and product-disabled. | Accepted as product-disabled scope only. Custody, deposits and withdrawals remain NO-GO until separately certified. |
| Compliance activation | KYC/AML provider configuration, production-negative mock tests, jurisdiction/legal review and evidence retention plan are accepted, or compliance-dependent flows remain disabled. | NO-GO for compliance-dependent real-money flows. |
| Product truth and UX | Public copy, README, in-app states and docs preserve the launch boundary: education, Mentor and virtual Arena only; no live exchange/custody promise. | NO-GO if any user-facing surface overclaims readiness. |
| Accepted risks | Every remaining non-blocking risk has a named owner, expiration/review date, mitigation, rollback condition and approval owner; the final owner sign-off artifact passes `scripts/verify-accepted-risk-signoff-evidence.mjs`. | Accepted-risk owner sign-off evidence is missing for NOG-08. The register structure, freshness guard and final artifact verifier are prepared, but Go remains blocked by protected staging, recovery reconciliation, incident readiness, accepted-risk owner sign-off and approvals. |
| Incident readiness | Runbooks, alert delivery, ownership, severity/escalation and acknowledgement paths satisfy `docs/operations/INCIDENT_READINESS_CONTRACT.md` for DB, Redis, migration, alert, provider, worker and reconciliation failures, and the protected staging artifact passes `scripts/verify-incident-readiness-evidence.mjs`. | NO-GO until incident evidence is accepted; request is prepared in `docs/launch/generated/incident-readiness-evidence-request-20260812.json`. |
| Go approval matrix | CEO, CTO or Chief Architect, Security, Product, Compliance, SRE and QA approve the exact candidate SHA and controlled launch scope after prerequisite evidence is accepted; the final artifact passes `scripts/verify-go-approval-matrix-evidence.mjs`. | NO-GO until approval evidence is accepted; request is prepared in `docs/launch/generated/go-approval-matrix-evidence-request-20260812.json`. |

## Required decision record

The final Go/No-Go record must contain:

The governed manifest and generated final packet dated 2026-08-24 are archived
for candidate `79c48a16cb685a88315a44e103b3758cf7845d65` only. A new final record for `4bc251725ce574d87258b52773e4a52ff3367252` may be generated
only after every active blocker is accepted for this exact candidate; the
historical packet must never be copied or relabelled.

1. exact release candidate SHA and image digest;
2. a governed controlled-launch evidence manifest with `schemaVersion: 2`,
   `evidenceClass: controlled-soft-launch-final-evidence-manifest`, the exact
   release candidate SHA, release-control generator and verifier paths plus
   their SHA-256 source digests, image digest, deployment artifact digest, workflow
   evidence URLs, protected staging evidence, recovery reconciliation evidence,
   rollback or forward-fix evidence, incident readiness evidence, accepted-risk
   sign-off URL and digest, disabled-capability evidence URL and digest, and Go
   approval URL and digest; the manifest
   must contain only HTTPS URLs, SHA-256 digests and release identifiers, never
   secrets, raw logs, host IPs, connection strings or user data;
3. `npm run launch:packet -- --manifest docs/launch/generated/controlled-soft-launch-final-evidence-manifest-20260824.json` JSON output for the exact candidate, with package-lock,
   migration-plan, image, deployment, protected-staging, recovery,
   rollback/forward-fix and incident-readiness artifact digests recorded. The
   final packet must also record `releaseControl.sourceRevision`, the canonical
   manifest digest, and the exact generator and verifier source digests so the
   packet can be reproduced from that release-control revision while the runtime
   candidate remains unchanged. Final mode accepts only the canonical governed
   manifest (plus optional `--out`) and independently verifies its evidence;
   direct evidence flags are draft-only. `--draft` is only for local incomplete
   scaffolding and is not acceptable final decision evidence;
4. linked exact-head CI and workflow results;
5. protected staging evidence artifact and verifier summary;
6. restore/reconciliation evidence artifact;
7. rollback evidence and migration decision notes;
8. disabled-capability attestation for real-money Exchange, custody,
   deposits, withdrawals, public rewards, enterprise and white-label claims;
9. accepted-risk register with named owners and dates, plus owner sign-off
   evidence that passes `scripts/verify-accepted-risk-signoff-evidence.mjs`;
10. incident readiness contract with support hours, severity targets,
   acknowledgement evidence, two protected-staging P0 synthetic alert probes,
   zero pending/quarantine counts and verifier-passed artifact evidence;
11. approvals from CEO, CTO or Chief Architect, Security, Product, Compliance,
   SRE and QA, with a final matrix that passes
   `scripts/verify-go-approval-matrix-evidence.mjs`.

## Non-negotiable No-Go rules

The decision remains NO-GO when any of the following is true:

- exact candidate CI, build, runtime smoke, repository audit or security
  workflow evidence is missing or red;
- protected staging activation has not been collected and verified;
- backup/restore, recovery reconciliation or rollback evidence is missing;
- critical alerts are not delivered through the approved path;
- a launch-critical user state still depends on browser-only authority;
- any disabled real-money or enterprise surface can be activated accidentally;
- public copy implies that Exchange, custody, deposits, withdrawals or
  white-label operations are live;
- incident ownership, accepted risks, compliance or legal approval is missing.

## Completion percentage rule

This checklist does not increase the completion percentage by itself. The
percentage may move only after accepted evidence changes the release reality:
protected staging execution, recovery drills, product Golden Paths, financial
reconciliation, custody/compliance certification, or equivalent exact-head
evidence.
