# Launch Accepted Risks — Phase 39.5 Final Governance Lock

**Date:** 2026-07-05  
**Phase:** 39.5 — Strategic Freeze & TecPey DNA Synchronization (Final Governance Lock)  
**Status:** Official — Every limitation accepted at launch must be explicit, owned, time-bounded, and communicated.  
**Purpose:** Nothing implicit. Every accepted limitation at Soft Launch or Public Launch must be documented with owner, expiration, mitigation, user communication, and rollback condition.

**Rule:** If it is not in this document, it is not an accepted risk — it is an unacknowledged defect.

> **Reconciliation update (2026-08-01).** This is a dated Phase 39.5 record. Some risks below have since been reduced or resolved by merged code and are annotated inline with a **Reconciliation update** note citing the current authority; history is preserved rather than erased. Notably R-03 (schema-on-connect) is resolved — its detailed entry was already marked *Superseded*, and the **Summary Table** row has now been corrected to match. When a note and the original entry disagree, the note and the current code win.

> **Controlled-launch decision update (2026-08-08).** This registry is **not yet accepted as final Go evidence** for #50. The controlled Soft Launch may only use this document after a named release owner records exact thresholds, review dates, sign-off evidence and rollback triggers for every unresolved row. Placeholder thresholds such as `N`, `X`, `defined hours`, or phase-only expirations are management debt, not accepted risk. Until that reconciliation is complete, the current decision remains **NO-GO** for public Go/No-Go and **NO-GO** for every real-money Exchange, custody, deposit, withdrawal, public reward, enterprise or white-label surface.
>
> **Controlled-launch closure update (2026-08-09).** The table below records the exact temporary thresholds, owners and rollback triggers for the controlled education/Mentor/virtual Arena scope only. This closes the placeholder-decision debt for the narrow controlled launch packet, but it does **not** close protected staging, recovery/restore, rollback/forward-fix, compliance, real-money Exchange or custody evidence. Historical placeholder text in the original Phase 39.5 rows is superseded by this closure matrix for controlled-launch decisions.
>
> **Controlled-launch accountable review refresh (2026-08-22).** `@tecpey` re-reviewed the controlled-launch closure matrix in PR #531 after the 2026-08-21 freshness window expired. The Review date column now records the next accountable review deadline after that re-review; it is not owner sign-off evidence, does **not** accept NOG-08, does **not** replace the required owner approval artifact, and does **not** approve any Go decision or real-money/custody/enterprise/white-label/public-reward surface. R-08 was re-reviewed early on 2026-08-22 and remains on its biweekly cadence.

> **Controlled-launch accountable review refresh (2026-08-30).** `@tecpey` re-reviewed every controlled-launch decision, measurable threshold and rollback/halt trigger below; none changed. The Review date column records only the next review deadline after this review. This refresh is **not** accepted-risk owner sign-off, does **not** relabel the immutable 2026-08-23 historical artifact for candidate `79c48a16cb685a88315a44e103b3758cf7845d65`, keeps NOG-08 open for the current candidate, and leaves the release decision **NO-GO**. It authorizes no Go decision, merge, deployment, real-money Exchange, custody, deposit, withdrawal, public reward, enterprise or white-label surface.

## Controlled Launch Reconciliation Addendum — 2026-08-08

This addendum reconciles the dated Phase 39.5 accepted-risk register with the
current controlled launch boundary.

### Decision status

| Scope | Current decision | Reason |
|---|---|---|
| Public FA/EN, Academy, Mentor and virtual Arena controlled launch | NO-GO until final #50 evidence is attached | Staging, recovery, rollback, alert-delivery, accepted-risk and sign-off evidence remain incomplete. |
| Real-money Exchange | NO-GO | Reconciliation, ambiguous-result recovery, provider evidence, compliance and broader financial certification remain open. |
| Custody, deposits and withdrawals | NO-GO | HSM/MPC, chain-provider certification, on-chain reconciliation and withdrawal settlement evidence remain independent gates. |
| Public rewards, enterprise and white-label claims | NO-GO | These are outside the controlled launch scope and must not be implied by README, UI or investor/status copy. |

### Required accepted-risk closure before a Go decision

Every open risk must have:

1. accountable owner and approval owner;
2. exact review date or expiry date, not only a phase label;
3. measurable threshold values replacing `N`, `X`, `[defined hours]` and similar placeholders;
4. tested mitigation evidence or a linked issue that keeps the release NO-GO until resolved;
5. user communication text where the risk can affect users;
6. rollback or kill-switch condition that can be executed by an identified owner.

### Controlled-launch closure matrix — 2026-08-09

| Risk | Controlled-launch decision | Exact threshold or restriction | Owner | Review date | Rollback / halt trigger |
|---|---|---|---|---|---|
| R-01 | Browser-owned XP, streaks and badges may remain motivational only; canonical progress, assessments and certificates must remain server-backed. | Three or more support complaints about lost engagement state in seven days, or two percent of the controlled cohort reporting loss, whichever is lower, requires pausing public growth until export or server persistence is accelerated. Any canonical progress/certificate loss is P0 and halts launch. | CPO + Academy Director | 2026-09-06, then weekly during controlled launch | Remove gamification emphasis and block public growth until mitigation is shipped and user communication is updated. |
| R-02 | Market-data displays are education/virtual-context only; no verified live-market-data claim is allowed. | Three distinct stale-price reports in 24 hours, five in seven days, or one confirmed user-harm report requires hiding live-price accuracy claims and restricting affected widgets to educational display. | CTO + Chief Architect | 2026-09-06, then weekly | Disable market-board freshness claims and keep trading paper-only until server-side price evidence is accepted. |
| R-04 | Critical operational alerts must be delivered through the approved ops alert path before any Go record. | Synthetic critical alert delivery must succeed twice in protected staging, pending alert count must be zero, quarantine count must be zero, delivery latency must be under five minutes, and P0 acknowledgement must occur within fifteen minutes during support hours. | SRE Lead + DevSecOps Lead | 2026-09-06 before Go decision, then after every alert-path change | NO-GO until alert probe evidence, spool drain and acknowledgement evidence are attached. |
| R-05 | Redis-dependent real-money withdrawals remain disabled; Redis is allowed only for non-custodial controlled-launch functions. | Any Redis outage over five minutes triggers degraded-mode messaging and review; any path that can create a real withdrawal while Redis is degraded is a hard NO-GO. | SRE Lead + Wallet Engineer | 2026-09-06, then weekly | Keep withdrawals disabled; if a real withdrawal path is reachable, revert or disable the route/worker before continuing. |
| R-06 | Certificate signing remains allowed only for controlled education certificates; signing secret exposure and certificate trust failures remain launch-critical. | One suspected signing-secret compromise, one forgeable certificate report, or one failed verification incident affecting a legitimate certificate requires halting certificate issuance and opening a security incident. | Academy Director + Chief Security Officer | 2026-09-06, then weekly | Disable certificate issuance and certificate trust claims until secret rotation, denylist or re-issuance decision and user communication are complete. |
| R-07 | Real-money Exchange, custody and ledger settlement remain outside controlled-launch scope. | Zero real-money orders, deposits, withdrawals, public rewards or custody settlements are permitted. Any non-zero activation is a hard NO-GO regardless of other evidence. | Chief Financial Systems Architect + CTO | 2026-09-06 before any Exchange re-scope | Disable the activating flag/route/worker and open a financial incident before resuming. |
| R-08 | Persian-first launch copy is acceptable; English/global growth claims remain gated. | If non-Persian traffic exceeds ten percent of weekly active users, or non-Persian commercial demand exceeds five percent of qualified leads in a rolling seven-day window, English parity and discoverability become launch-blocking for growth campaigns. | CPO + Growth Lead | 2026-09-13, then biweekly | Pause non-Persian acquisition and remove global readiness claims until parity evidence is accepted. |
| R-09 | Controlled-launch support is not 24/7, but named incident ownership is required. | Support window is 09:00-23:00 Asia/Tehran daily. P0 acknowledgement target is fifteen minutes during support hours and sixty minutes outside support hours. P1 acknowledgement target is four hours. | CTO + SRE Lead | 2026-09-06, then weekly | If a P0 misses acknowledgement target or causes material user harm, launch expansion pauses until formal on-call is active. |
| R-10 | Hot-wallet readiness is not accepted; custody and withdrawals remain product-disabled. | Hot-wallet balance claims are forbidden. Any UI/API/worker path implying active custody or withdrawal readiness is a hard NO-GO. | Wallet Engineer + Chief Financial Systems Architect | 2026-09-06 before any custody re-scope | Remove the claim or disable the path; custody stays NO-GO until independent certification and reconciliation evidence exist. |

### Re-evaluation rule

The final Go/No-Go packet must cite this addendum and either:

- replace every placeholder with exact signed values; or
- keep the related capability explicitly NO-GO and product-disabled.

No AI agent, contributor or operator may treat this historical registry as final
accepted-risk evidence without that reconciliation.

---

## R-01 — Academy Progress, Trading DNA, Journals, Streaks, and Community Data Live in localStorage

| Field | Value |
|-------|-------|
| **Description** | Core Academy state (term progress, spaced repetition mastery, Trading DNA behavioral profile, trading journal, community challenges, smart review) is stored in browser localStorage. Clearing browser data, using private/incognito mode, switching devices, or certain browser updates will cause irreversible loss. |
| **Reason Accepted for Launch** | Server-side persistence migration is scoped to Phase 43. Moving even a minimal path into Phase 40 would delay launch beyond current window. Early users are expected to be technical and tolerant. |
| **Owner** | Chief Product Officer + Academy Director (joint) |
| **Expiration Phase** | Phase 43 (or earlier if accelerated). Must be resolved before any white-label or enterprise Academy deployment. |
| **Mitigation** | 1. User-facing warning in Academy and Arena before any data is entered. 2. Export capability for journal and progress snapshots (even if JSON only). 3. Clear communication in onboarding and support docs. |
| **User Communication** | "At this stage of TecPey, your learning progress, Trading DNA, journal, and community activity are stored in your browser. Clearing your browser data or switching devices will result in loss. We recommend exporting your journal regularly. Full cloud sync is planned for a future update." |
| **Rollback Condition** | If user complaints or churn exceed threshold defined by CPO within first 4 weeks of Soft Launch, this risk must be re-evaluated and either accelerated server persistence or restricted launch scope must be considered. |

> **Reconciliation update (2026-08-01).** Reduced in scope, **not resolved.** Canonical Academy progress, assessments, and certificates are now PostgreSQL-authoritative (`src/lib/academy-progress.ts`, `src/lib/academy-assessment.ts`, `src/lib/academy-certificates.ts`, with `academy-progress-*-postgres` authority tests), so the loss premise no longer applies to that canonical state. **However, this risk remains fully in force for the Academy engagement/gamification layer:** `src/components/academy/AcademyEngagementHub.tsx` — mounted on the live `/academy` and `/academy/daily-challenge` routes — stores user-earned XP, streaks, completed missions, and unlocked badges **exclusively in `localStorage`**, with no server persistence, and clearing browser data or switching devices still loses that state. For those browser-owned features R-01's warning, export, and mitigation obligations still apply; the reduction above must not be read as removing them. See `docs/PRODUCTION_DECISIONS.md` D-02.

---

## R-02 — Price / Market Data Health Is Entirely Client-Reported

| Field | Value |
|-------|-------|
| **Description** | There is no server-side price feed or independent oracle. The only mechanism for detecting price feed problems is client-reported via `/api/internal/price-feed-status`. The platform cannot independently verify that users are seeing accurate, live market data. |
| **Reason Accepted for Launch** | Building or integrating a server-side price source was not in Phase 39.5 or Phase 40 scope. Current architecture is client-side TradingView + WebSocket for display. |
| **Owner** | CTO + Chief Architect |
| **Expiration Phase** | Phase 45 (or earlier if trading volume or regulatory pressure requires it). Must be resolved before claiming "institutional-grade market data" or high-frequency features. |
| **Mitigation** | 1. Explicit user-facing disclaimer on markets and trading pages. 2. Rate-limited, authenticated internal endpoint to reduce abuse. 3. Monitoring of client-reported down events with manual review. |
| **User Communication** | "Market prices are provided by third-party sources and displayed client-side. TecPey does not independently verify real-time accuracy. In case of suspected data issues, trading may be paused. Always cross-check prices before executing large trades." |
| **Rollback Condition** | If client-reported price feed down events exceed N per week or if any material user harm is traced to stale/manipulated displayed prices, server-side price source must be accelerated or trading restricted to paper only until resolved. |

> **Reconciliation update (2026-08-01).** Still accurate for *displayed* prices (TradingView + WebSocket, client-reported via `/api/internal/price-feed-status`). A server-side, multi-provider price **consensus** now exists for the gated withdrawal/financial path only (`src/lib/security/withdrawal-price-producer.ts`); it does not govern chart display. See `docs/PRODUCTION_DECISIONS.md` D-03.

---

## R-03 — Schema-on-Connect Risk (Superseded)

| Field | Value |
|-------|-------|
| **Description** | **Archived historical context:** Phase 39.5 accepted schema-on-connect as a temporary risk. That behavior is superseded and is not an active production path. Production schema changes now run only through the governed migration command before startup; runtime and health readiness are verify-only and fail closed without bypassing migration state. |
| **Reason Accepted for Launch** | Historical reference only. The risk was accepted before the governed migration runtime was implemented. |
| **Owner** | CTO + Platform Engineering Lead |
| **Expiration Phase** | Resolved by Issue #166. |
| **Mitigation** | `npm run db:migrate` is the sole canonical production migration action. Production requests never execute schema migrations, and startup and health readiness verify the canonical plan without executing DDL. |
| **User Communication** | Not user-facing. Internal operations note only. |
| **Rollback Condition** | Not applicable; the former schema-on-connect contract is archived and must not be restored. |

---

## R-04 — Alert Delivery Is Not Guaranteed (Log + Optional Webhook)

| Field | Value |
|-------|-------|
| **Description** | `emitAlert()` writes to structured logs and optionally POSTs to `ALERT_WEBHOOK_URL`. There is no guaranteed delivery, no retry with backoff beyond the caller, no on-call integration, and no escalation. |
| **Reason Accepted for Launch** | Full alerting platform (PagerDuty, OpsGenie, etc.) and on-call tooling were not in Phase 39.5/40 scope. Current implementation is a notification sketch. |
| **Owner** | SRE Lead + DevSecOps Lead |
| **Expiration Phase** | Phase 41 (or earlier if critical incidents are missed). Must be resolved before claiming production-grade observability. |
| **Mitigation** | 1. Require `ALERT_WEBHOOK_URL` configured and tested for critical alerts in staging and production. 2. Critical alerts also logged at ERROR level. 3. Manual monitoring of logs for first 2 weeks post-launch. |
| **User Communication** | Not user-facing. |
| **Rollback Condition** | If any critical failure (`DB_DOWN`, `REDIS_DOWN`, wallet pipeline failure, mass withdrawal stuck) goes undetected for > 30 minutes in the first 4 weeks, guaranteed delivery must be implemented immediately. |

---

## R-05 — Redis Is a Single Point of Failure for Withdrawals (BullMQ) and Other Critical Paths

| Field | Value |
|-------|-------|
| **Description** | Withdrawal queueing and execution depend on BullMQ + Redis. Nonce caching, rate limiting coordination, and future order book also touch Redis. There is no declared degraded mode for when Redis is unavailable. |
| **Reason Accepted for Launch** | Multi-region or highly available Redis was not in scope. Single-instance or Upstash Redis is the current production path. |
| **Owner** | SRE Lead + Wallet Engineer |
| **Expiration Phase** | Phase 45 (or earlier if withdrawal volume or trading requires it). Must be resolved before high-availability or multi-region claims. |
| **Mitigation** | 1. Explicit degraded-mode matrix: what happens to new withdrawals, in-flight jobs, trading, and rate limiting when Redis is down. 2. Test in staging. 3. User-facing messaging for withdrawal delays. |
| **User Communication** | "Withdrawals are processed asynchronously. In rare cases of infrastructure maintenance or outage, processing may be delayed. You will be notified of any extended delays." |
| **Rollback Condition** | If Redis unavailability causes > N withdrawals to be stuck for > X hours in the first 4 weeks, either high-availability Redis or a degraded-mode queue must be implemented. |

---

## R-06 — Certificate Verification Depends on a Single Signing Secret Without Rotation or Revocation Path

| Field | Value |
|-------|-------|
| **Description** | Issued certificates are signed with `CERTIFICATE_SIGNING_SECRET`. There is no rotation procedure, no versioning, and no revocation list. If the secret is compromised or rotated, previously issued certificates may become unverifiable or forgeable. |
| **Reason Accepted for Launch** | Full certificate infrastructure (PKI, HSM-backed signing, CRL/OCSP) was not in Phase 39.5/40 scope. Current implementation is a simple HMAC or symmetric signature. |
| **Owner** | Academy Director + Chief Security Officer |
| **Expiration Phase** | Phase 43 (or earlier if certificates become a revenue or white-label product). Must be resolved before any paid or institutional certificate program. |
| **Mitigation** | 1. Secret stored and rotated like other high-value secrets. 2. Minimal revocation list (even a simple denylist table) implemented or explicitly accepted as future work. 3. Public verification page returns clear status. |
| **User Communication** | "Certificates issued during this phase of TecPey are digitally signed. In the unlikely event of a security incident affecting certificate issuance, we will notify all affected users and may require re-issuance." |
| **Rollback Condition** | If the signing secret is suspected compromised, or if any certificate is shown to be forgeable, immediate revocation list + re-issuance process must be executed. |

---

## R-07 — No Independent On-Chain vs Ledger / Hot Wallet vs User Balances Reconciliation at Launch

| Field | Value |
|-------|-------|
| **Description** | There is no automated or scheduled job that proves "total user balances from ledger match on-chain hot wallet balances minus in-flight withdrawals" at launch. |
| **Reason Accepted for Launch** | Reconciliation tooling and operational process were not built in Phase 38–39. Manual spot checks are possible but not systematic. |
| **Owner** | Chief Financial Systems Architect |
| **Expiration Phase** | Phase 41 (or earlier if real-money volume exceeds threshold). Must be resolved before claiming institutional custody or large-scale trading. |
| **Mitigation** | 1. Manual reconciliation script exists and is run before Soft Launch with results logged. 2. Any discrepancies are investigated and explained in writing. 3. Automated job planned for Phase 41. |
| **User Communication** | Not user-facing at launch. Internal finance/ops note only. |
| **Rollback Condition** | If any material discrepancy is discovered post-launch that cannot be explained within 48 hours, trading and withdrawals must be paused until reconciliation is automated and clean. |

---

## R-08 — English Parity, Structured Data, and Discoverability Are Incomplete at Launch

| Field | Value |
|-------|-------|
| **Description** | English mirror has gaps. Structured data (schema.org, entity markup) is inconsistent. hreflang and international targeting are not fully verified. No `llms.txt` or LLM-specific discoverability assets exist. |
| **Reason Accepted for Launch** | Primary user base is Persian-speaking. Full English + global discoverability (SEO/GEO/AEO/LLMO) was scoped as ongoing work, not launch blocker. |
| **Owner** | Chief Product Officer + Growth / SEO lead |
| **Expiration Phase** | Phase 45 (global launch readiness). Must be resolved before significant paid acquisition or non-Persian market push. |
| **Mitigation** | 1. Core Persian experience is complete and correct. 2. English disclaimer: "English experience is in active development." 3. Basic structured data on key pages (markets, crypto, verify). 4. `llms.txt` and entity strategy planned for Phase 42–45. |
| **User Communication** | On English pages: "The English version of TecPey is under active development. Some features and content may be incomplete. The primary experience is available in Persian." |
| **Rollback Condition** | If English or international traffic becomes material (> X% of users or > Y revenue) before discoverability is hardened, acceleration or temporary geo-restriction must be considered. |

---

## R-09 — No Guaranteed On-Call or 24/7 Human Response at Soft Launch

| Field | Value |
|-------|-------|
| **Description** | There is no formal 24/7 on-call rotation or guaranteed response SLA for production incidents at Soft Launch. |
| **Reason Accepted for Launch** | Team size and operational maturity at launch do not yet support full on-call. Initial cohort is small and tolerant. |
| **Owner** | CTO + SRE Lead |
| **Expiration Phase** | Phase 42 (or earlier if user base or trading volume grows faster than expected). |
| **Mitigation** | 1. Core team has informal escalation. 2. Critical alerts go to shared channel + key individuals. 3. Soft Launch users are informed of limited support hours. 4. Formal on-call rotation planned for Phase 42. |
| **User Communication** | "During the initial Soft Launch period, support and incident response are provided by the core team during [defined hours]. We will expand coverage as the platform grows." |
| **Rollback Condition** | If a critical incident occurs outside covered hours and causes material user harm or extended downtime, formal on-call must be stood up immediately. |

---

## R-10 — Hot Wallet Balance Monitoring and Safety Thresholds Are Manual or Absent at Launch

| Field | Value |
|-------|-------|
| **Description** | There are no automated minimum balance thresholds with alerts or hard stops on withdrawals when hot wallet balances approach unsafe levels. Monitoring is manual or ad-hoc. |
| **Reason Accepted for Launch** | Wallet observability exists for execution metrics but not yet for balance safety guardrails. This was not built in Phase 38–39. |
| **Owner** | Wallet Engineer + Chief Financial Systems Architect |
| **Expiration Phase** | Phase 41 (or earlier if hot wallet balances are material). |
| **Mitigation** | 1. Manual daily/periodic check of hot wallet balances before Soft Launch. 2. Alert thresholds defined in code or runbook even if not yet wired to automatic pause. 3. Hard stop on withdrawals if balance < 1.5× pending withdrawals (manual enforcement initially). |
| **User Communication** | Not user-facing. Internal ops note. |
| **Rollback Condition** | If any hot wallet approaches or falls below pending withdrawal obligations, withdrawals must be paused and manual top-up executed. Automated guardrails must be implemented before resuming. |

---

## Summary Table

| Risk ID | Risk | Owner | Expiration | User Communication Required | Blocking if Exceeded |
|---------|------|-------|------------|-----------------------------|----------------------|
| R-01 | localStorage data loss | CPO + Academy Dir | Phase 43 | Yes | Yes |
| R-02 | Client-only price feed health | CTO + Architect | Phase 45 | Yes | Yes |
| R-03 | Schema-on-connect | CTO + Platform Eng | Superseded (#166) | No (internal) | No — resolved by governed migrations |
| R-04 | Fragile alerting | SRE + DevSecOps | Phase 41 | No | Yes |
| R-05 | Redis as SPoF for withdrawals | SRE + Wallet Eng | Phase 45 | Yes | Yes |
| R-06 | Certificate signing secret | Academy Dir + CSO | Phase 43 | Yes | Yes |
| R-07 | No automated financial reconciliation | Fin Systems Arch | Phase 41 | No | Yes |
| R-08 | Incomplete English + discoverability | CPO + Growth | Phase 45 | Yes | No (unless traffic material) |
| R-09 | No 24/7 on-call | CTO + SRE | Phase 42 | Yes | Yes (if major incident missed) |
| R-10 | No hot wallet safety thresholds | Wallet Eng + Fin Arch | Phase 41 | No | Yes |

---

**Rule:** Every risk in this document must be re-evaluated at the end of Soft Launch and before Public Launch. Any risk that has materialized or whose mitigation has failed must be escalated to the Executive Sign-off Matrix.

*This is the authoritative registry of accepted limitations at launch. It is not a wish list. It is a contract with reality.*

---

*Persian-first governance. English engineering terminology preserved.*
