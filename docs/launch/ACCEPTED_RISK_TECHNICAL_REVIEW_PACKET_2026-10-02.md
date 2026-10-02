# Accepted-Risk Technical Review Packet — 2026-10-02

## Authority and boundary

This packet is a current technical-evidence review for the controlled-launch accepted-risk freshness cycle. It is **not** project-owner sign-off, does not extend any review deadline, does not accept NOG-08, does not approve Go, and does not authorize merge, deployment, staging/production mutation, real-money Exchange, custody, deposits, withdrawals, public rewards, enterprise or white-label activation.

Source repository authority: `tecpey/Tecpey-Os` `main` at `96b56d0e469b356ccf8ee698c5a75a36d1cabe60`.

The purpose is to separate what current repository/CI evidence can establish from what still requires an accountable human decision or runtime/business evidence.

## Technical review matrix

| Risk | Current technical observation | Technical disposition | Human/runtime evidence still required |
|---|---|---|---|
| R-01 | Canonical Academy progress, assessments and certificates remain server-authoritative, while `AcademyEngagementHub` still owns XP/streak/completed engagement state in browser state/local persistence. | **UNCHANGED / REDUCED-BUT-OPEN supported by repository evidence.** The current controlled decision and loss rollback boundary remain technically coherent. | Accountable owner must decide whether the current complaint/cohort threshold remains acceptable. |
| R-02 | The accepted-risk authority still limits displayed market data to education/virtual context and explicitly rejects a verified-live-market-data claim. Financial-path price consensus does not establish display-price authority. | **UNCHANGED / CONTROLLED supported by repository authority.** | Accountable owner must confirm the stale-price/user-harm thresholds remain acceptable; actual incident/report counts are outside repository evidence. |
| R-04 | Incident-readiness authority still requires two protected-staging synthetic critical deliveries, delivery latency under five minutes, zero pending, zero quarantine and P0 acknowledgement within the declared target. Missing any item keeps the launch gate NO-GO. | **UNCHANGED / EVIDENCE-PENDING.** Repository policy is correct and fail-closed. | Current protected-staging alert-delivery artifact and queue/latency evidence remain independent requirements; freshness must not substitute for them. |
| R-05 | Repository launch authority continues to treat Redis-dependent real-money withdrawals as disabled/out of controlled-launch scope; exact-head CI on the current supply-chain remediation passes withdrawal admission, Redis safety and wallet custody authority guards. | **UNCHANGED / HARD FINANCIAL BOUNDARY supported.** | Accountable owner must confirm no separately activated runtime path exists outside repository evidence. |
| R-06 | Current register continues to allow only controlled education certificate signing and retains the halt condition for suspected signing-secret compromise, forgeability or legitimate verification failure. No repository change was found that weakens this boundary. | **UNCHANGED / CONTROLLED supported at policy level.** | Operational/security owner must confirm no current compromise/forgeability/verification incident exists and that the existing halt trigger remains acceptable. |
| R-07 | README, controlled-launch authority and exact-head Exchange/Wallet gates continue to state that real-money Exchange, deposits, withdrawals, public rewards and custody settlement are outside current launch scope. | **UNCHANGED / HARD NO-GO supported.** | Accountable owner must confirm zero out-of-band activation in deployed environments. |
| R-08 | Register still defines Persian-first launch with non-Persian growth gated when non-Persian traffic exceeds 10% of WAU or qualified-lead demand exceeds 5% in a rolling seven-day window. Repository evidence cannot establish current traffic/lead ratios. | **DECISION BOUNDARY UNCHANGED; CURRENT THRESHOLD STATE UNKNOWN.** | Current analytics for non-Persian WAU and qualified leads plus accountable owner decision are required before refreshing the biweekly deadline. |
| R-09 | `INCIDENT_READINESS_CONTRACT.md` still defines support 09:00–23:00 Asia/Tehran daily, P0 acknowledgement within 15 minutes during support hours / 60 minutes outside, and P1 within 4 hours. | **UNCHANGED / CONTROLLED supported at contract level.** | Accountable owner must confirm actual current staffing/coverage can still meet the contract; current drill evidence remains separate. |
| R-10 | Repository authority continues to state that hot-wallet readiness is unaccepted and real-money custody/withdrawal activation remains outside controlled scope; wallet custody/exchange gates are passing on the current remediation head. | **UNCHANGED / HARD CUSTODY NO-GO supported.** | Accountable owner must confirm no external/runtime activation or readiness claim exists beyond repository evidence. |

## Current exact-head CI observation relevant to this review

On supply-chain remediation PR #731 exact head `763821bb8eb7ffca33d776f0d97ea4ff3db91364`, the following repository-wide authorities pass: Container Supply Chain, Repository Audit Manifest, API Security Manifest, Full History Secret Scanning, Sensitive Mutation Audit, Exchange Authority, Scheduled Operational Recovery, Full Suite Diagnostics, Public Browser Golden Path and Candidate Evidence Recollection Authority.

`CI / Quality Checks` reaches the accepted-risk authority after successfully passing TypeScript, ESLint, database/migration, tenant isolation, Mentor red-team, Academy, withdrawal admission, wallet custody, Redis safety, scheduler, recovery and related guards. Its first failure is the stale accepted-risk freshness authority. This confirms that the current blocker is governance freshness, not a hidden product/supply-chain failure.

The protected AI Tenant RLS runtime workflow is not failing: static authority validation passes and the protected PostgreSQL job waits on GitHub Environment `ai-tenant-rls-evidence`, as designed.

## Admission rule for the accountable review

A follow-up authoritative review record may refresh dates only after the accountable owner explicitly reviews the existing decision, measurable threshold/restriction, joint ownership and rollback/halt trigger for every row. For R-08, current analytics must be considered rather than assumed. For R-04, freshness and protected-staging incident evidence remain independent: a fresh review cannot close the operational evidence gate.

Historical accepted-risk sign-offs remain bound to their original candidate SHA/digest and must not be relabeled for a new candidate.

## Current decision

`TECHNICAL_REVIEW_COMPLETE / ACCOUNTABLE_REVIEW_REQUIRED / NO-GO UNCHANGED`
