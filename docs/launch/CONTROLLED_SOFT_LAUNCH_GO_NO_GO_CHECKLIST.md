# Controlled Soft Launch Go/No-Go Checklist

**Status:** NO-GO until every blocking row below has accepted evidence  
**Baseline main SHA before this checklist:** `046b85a7281805e0a633ff268734d3052e3cc3bf`  
**Related:** #26, #50, #110, #229, `docs/launch/CONTROLLED_LAUNCH_EVIDENCE_DIGEST_20260808.md`

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
labelled as gated.

## Blocking checklist

| Gate | Required accepted evidence | Current decision |
|---|---|---|
| Exact release identity | One immutable release candidate SHA, image digest, migration plan hash, CI run, and deployment artifact recorded together. | NO-GO until candidate evidence exists. |
| Full CI and release gates | `release:check` constituents, build, runtime smoke, API security, sensitive mutation audit, repository audit, secret scanning, browser Golden Path, container and recovery workflows pass on the exact candidate. | NO-GO until exact-head evidence is linked. |
| Protected staging activation | Staging evidence satisfies `docs/operations/STAGING_READINESS_EVIDENCE_CONTRACT.md`: exact SHA, protected runner, immutable host layout, health, systemd, database operational evidence, alert probe, spool drain, artifact digest and verifier summary. | NO-GO until protected staging evidence is accepted. |
| Backup, restore and recovery | Restore evidence satisfies `docs/operations/RECOVERY_RECONCILIATION_CONTRACT.md` for Academy, Arena, Mentor, Exchange ledger/balances/orders, notifications, tenant/principal isolation and audit trails. | NO-GO until restore and reconciliation evidence is accepted. |
| Rollback and forward-fix | Candidate-to-previous rollback and volume-restore evidence exist; any irreversible migration has an approved forward-fix decision and owner. | NO-GO until rollback evidence is accepted. |
| Disabled financial surfaces | Real-money Exchange, custody, deposits, withdrawals, public financial rewards and enterprise claims are impossible to activate accidentally through routes, env flags, UI copy or worker execution. | NO-GO if any disabled surface can be activated accidentally or advertised as live. |
| Exchange safety boundary | Decimal conservation, order/trade/hold/balance/fee/ledger reconciliation, ambiguous-result recovery and provider evidence are either accepted or the Exchange remains launch-disabled. | NO-GO for real-money Exchange. Controlled launch may proceed only with Exchange disabled. |
| Custody and withdrawal boundary | HSM/MPC, chain-provider certification, testnet/on-chain reconciliation and withdrawal settlement evidence are accepted, or every real withdrawal path remains custody-gated and product-disabled. | NO-GO for custody and withdrawals. Controlled launch may proceed only with real withdrawals disabled. |
| Compliance activation | KYC/AML provider configuration, production-negative mock tests, jurisdiction/legal review and evidence retention plan are accepted, or compliance-dependent flows remain disabled. | NO-GO for compliance-dependent real-money flows. |
| Product truth and UX | Public copy, README, in-app states and docs preserve the launch boundary: education, Mentor and virtual Arena only; no live exchange/custody promise. | NO-GO if any user-facing surface overclaims readiness. |
| Accepted risks | Every remaining non-blocking risk has a named owner, expiration/review date, mitigation, rollback condition and approval owner. | NO-GO until accepted-risk register is current. |
| Incident readiness | Runbooks, alert delivery, ownership, severity/escalation and acknowledgement paths are tested for DB, Redis, migration, alert, provider, worker and reconciliation failures. | NO-GO until incident evidence is accepted. |

## Required decision record

The final Go/No-Go record must contain:

1. exact release candidate SHA and image digest;
2. `npm run launch:packet` JSON output for the exact candidate, with package-lock,
   migration-plan, image and deployment artifact digests recorded;
3. linked exact-head CI and workflow results;
4. protected staging evidence artifact and verifier summary;
5. restore/reconciliation evidence artifact;
6. rollback evidence and migration decision notes;
7. disabled-capability attestation for real-money Exchange, custody,
   deposits, withdrawals, public rewards, enterprise and white-label claims;
8. accepted-risk register with named owners and dates;
9. approvals from CEO, CTO or Chief Architect, Security, Product, Compliance,
   SRE and QA.

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
