# Trust Surfaces — Phase 39.5 Final Governance Lock

**Date:** 2026-07-05  
**Phase:** 39.5 — Strategic Freeze & TecPey DNA Synchronization (Final Governance Lock)  
**Status:** Official — Every surface where users, institutions, or regulators place trust in TecPey must be identified, threat-modeled, and monitored.  
**Purpose:** Make every trust assumption explicit. No hidden trust. No unacknowledged attack surface.

**Rule:** If a system component is not listed here, it has not been analyzed as a trust surface. That is a governance gap.

---

## Definition

A **trust surface** is any interface, data store, process, or output where:

- A user or external party relies on TecPey for correctness, availability, privacy, or integrity.
- Failure or compromise would cause financial loss, credential damage, identity harm, or loss of confidence.

---

## T-01 — Wallet Balances and Ledger

**Description:** User asset balances derived from `wallet_ledger` (append-only) and cached in `wallet_balances`.

**Trust Assumptions:**
- Ledger is append-only and immutable.
- Balance calculations are correct.
- Holds and releases are atomic with order lifecycle.
- Hot wallet on-chain balances are sufficient to cover user liabilities.

**Threats:**
- Ledger tampering or injection.
- Balance drift (ledger vs snapshot vs on-chain).
- Double-spend or negative balance due to race conditions.
- Hot wallet compromise or loss of keys.

**Verification:**
- CHECK constraints on non-negative balances.
- Idempotency keys on withdrawals.
- Reconciliation reports (currently manual, see LAUNCH_ACCEPTED_RISKS R-07).

**Monitoring:**
- Wallet observability metrics (build/sign/broadcast latency, low balance, dropped tx).
- Ledger vs balances drift detection (missing at launch — see B-02).

**Failure Mode:**
- User sees incorrect balance.
- Withdrawal cannot be paid.
- Platform cannot prove solvency.

**Recovery:**
- Manual ledger correction (high risk).
- Hot wallet top-up.
- User communication and potential compensation.

**Owner:** Chief Financial Systems Architect + Wallet Engineer

---

## T-02 — Withdrawals (User Request → Admin Approval → On-Chain Execution)

**Description:** Full pipeline from `POST /api/auth/withdraw` through admin approval (`/api/admin/withdrawals/[id]`) to BullMQ execution and on-chain broadcast.

**Trust Assumptions:**
- Only approved withdrawals are executed.
- Execution is exactly-once (idempotency via tx_hash).
- Destination address is validated and belongs to the user.
- Admin approval cannot be forged or bypassed.

**Threats:**
- Unauthorized withdrawal creation.
- Admin token theft or session hijack (SB-002, SB-011).
- Approval of fraudulent or incorrect withdrawals.
- Execution of unapproved withdrawals.
- Stuck or double-broadcast withdrawals.
- Destination address substitution.

**Verification:**
- State machine enforcement (only "approved" state executes).
- CSRF on all state-changing routes (SB-001 — incomplete at analysis time).
- Address validation per chain.
- tx_hash uniqueness.

**Monitoring:**
- Withdrawal queue depth, DLQ, stuck states.
- Admin approval audit log.
- On-chain vs internal state reconciliation (missing at launch).

**Failure Mode:**
- User funds withdrawn without approval.
- Funds sent to wrong address.
- Withdrawal stuck in intermediate state for extended period.

**Recovery:**
- Manual cancellation before broadcast.
- On-chain recovery (difficult or impossible for many chains).
- Compensation and support escalation.

**Owner:** Wallet Engineer + Chief Security Officer + Compliance

---

## T-03 — Public Certificate Verification (`/verify/[certificateId]`)

**Description:** Publicly accessible page that verifies and displays issued Academy certificates.

**Trust Assumptions:**
- Certificate data returned is authentic and was issued by TecPey.
- Signature is valid and was produced with the authorized signing secret.
- Revoked or invalid certificates are correctly flagged (currently weak or absent).
- The page itself is not serving forged content.

**Threats:**
- Forged certificates accepted as valid.
- Valid certificates become unverifiable after key rotation or compromise.
- Verification page serves stale or tampered data.
- Phishing site impersonates verification page.

**Verification:**
- Signature check using `CERTIFICATE_SIGNING_SECRET`.
- Certificate exists in database.
- (Future) Revocation list or status.

**Monitoring:**
- Verification success/failure rates.
- Signature validation failures.
- Certificate issuance vs verification mismatch.

**Failure Mode:**
- Fake certificate appears legitimate.
- Legitimate graduate cannot prove credential.
- Public trust in TecPey Academy collapses.

**Recovery:**
- Revocation + re-issuance.
- Public notice.
- Investigation of key compromise.

**Owner:** Academy Director + Chief Security Officer

---

## T-04 — Academy Progress and Behavioral Profile (Trading DNA)

**Description:** Student term progress, quiz results, spaced repetition state, Trading DNA 12-dimension profile, and related behavioral data.

**Trust Assumptions (Current — localStorage):**
- Data is only accessible to the student on the same browser/device.
- Student can trust that their progress is accurately recorded and used for personalization and gating.
- No one else can tamper with or view their data.

**Trust Assumptions (Future — server):**
- Server correctly stores and returns only the student's own data.
- Behavioral profile is used only for educational coaching, not manipulation or discrimination.
- Data is not sold or leaked.

**Threats:**
- Data loss (browser clear, device switch) — accepted at launch (R-01).
- Tampering by other users (localStorage is client-side).
- Server-side: unauthorized access, modification, or leakage.
- Behavioral profile used for non-educational purposes.

**Verification:**
- Currently: none (client-side only).
- Future: auth + ownership checks, audit logs.

**Monitoring:**
- Currently: none systematic.
- Future: access logs, anomaly detection on progress changes.

**Failure Mode:**
- Student loses months of work and mastery.
- Student is incorrectly gated or advanced.
- Behavioral profile is used against the student.

**Recovery:**
- For localStorage loss: none (data is gone).
- Future: restore from backup, support intervention.

**Owner:** Academy Director + Chief Product Officer

---

## T-05 — Trading DNA and Leaderboards

**Description:** 12-dimension behavioral competence model used for personalization, gating, and (future) public or semi-public leaderboards.

**Trust Assumptions:**
- Scores accurately reflect student behavior.
- Leaderboards (when implemented) are fair and not manipulable.
- Scores are not used punitively or for discrimination.

**Threats:**
- Gaming or manipulation of behavioral signals.
- Incorrect scoring due to bugs or data loss.
- Public exposure of private behavioral data.

**Verification:**
- Currently: localStorage only, no server validation.
- Future: server-side computation with audit.

**Monitoring:**
- Future: anomaly detection on score changes.

**Failure Mode:**
- Unfair leaderboards.
- Students lose trust in the "DNA" model.
- Privacy breach.

**Recovery:**
- Recalculation or reset of scores.
- Public correction.

**Owner:** Academy Director + Chief Product Officer

---

## T-06 — AI Mentor Responses

**Description:** Personalized educational coaching provided by AI Mentor (currently OpenAI GPT-4o-mini with behavioral context).

**Trust Assumptions:**
- Responses are educationally sound and aligned with curriculum.
- Behavioral context is used only to personalize help, not to manipulate or exploit.
- No financial advice or trading signals are given.
- Student data sent to the model is handled according to privacy policy.

**Threats:**
- Hallucinated or incorrect educational content.
- Prompt injection leading to policy violation or data leakage.
- Behavioral data used for non-educational purposes.
- Cost or availability abuse.

**Verification:**
- Cost guard and token limits.
- Prompt engineering and system instructions.
- (Future) Output filtering and A/B testing of prompts.

**Monitoring:**
- Usage, cost, fallback rate, user satisfaction (thumbs).
- (Future) Content safety and hallucination detection.

**Failure Mode:**
- Student receives wrong or harmful advice.
- Privacy breach via model.
- Loss of trust in AI coaching.

**Recovery:**
- Fallback to static content or human mentor.
- Prompt rollback.
- User notification.

**Owner:** AI Platform Director

---

## T-07 — KYC / Compliance Status (Sumsub + Others)

**Description:** User identity verification and sanctions screening results used to gate withdrawals and trading.

**Trust Assumptions:**
- KYC decision is accurate and from the configured provider.
- Mock sessions are impossible in production (SB-004).
- Sanctions screening (OFAC, etc.) is up to date.
- Data is stored and used in compliance with regulations.

**Threats:**
- Mock or bypassed KYC in production.
- Stale sanctions lists.
- False positive/negative on real users.
- Data breach of sensitive identity documents.

**Verification:**
- Production guard against mock sessions.
- Provider health and response validation.

**Monitoring:**
- KYC completion and rejection rates.
- Sanctions hit rate.
- Provider uptime.

**Failure Mode:**
- Unverified or sanctioned user can withdraw.
- Legitimate user blocked incorrectly.
- Regulatory penalty or reputational damage.

**Recovery:**
- Manual review and override process.
- Re-KYC.
- Provider switch if needed.

**Owner:** Compliance Lead + Chief Security Officer

---

## T-08 — Identity and Session (Current Three-Cookie Model)

**Description:** User authentication via three separate cookies and JWTs (`user_session`, `tecpey_academy_auth`, `tecpey_student_session`).

**Trust Assumptions:**
- Only the legitimate user can present a valid session.
- Sessions are not hijackable via XSS, CSRF, or cookie theft.
- Admin sessions are protected (currently weak — raw token and sessionStorage).

**Threats:**
- Session fixation or hijacking.
- CSRF on state-changing routes (SB-001).
- Raw admin token theft (SB-002, SB-011).
- Secret fan-out (SB-010).

**Verification:**
- JWT signature validation.
- CSRF tokens (incomplete coverage).
- HttpOnly + Secure flags.

**Monitoring:**
- Failed auth attempts.
- Session anomalies.

**Failure Mode:**
- Account takeover.
- Unauthorized admin access.
- Cross-user data exposure.

**Recovery:**
- Session revocation.
- Password/2FA reset.
- Admin token rotation.

**Owner:** Chief Security Officer

---

## T-09 — Public Price Data and Market Snapshots

**Description:** Order book snapshots, recent trades, and market summaries served to all users (authenticated and unauthenticated).

**Trust Assumptions:**
- Data reflects actual order book and trade history at the time of query.
- No manipulation of public market view.
- Latency is acceptable for decision-making.

**Threats:**
- Stale or manipulated public data.
- Denial of service on public market endpoints.
- Inconsistency between public view and what a user sees after placing orders.

**Verification:**
- Matching engine and order book correctness.
- (Future) Independent price feed health.

**Monitoring:**
- Latency, error rate on market endpoints.
- Client-reported price feed down events.

**Failure Mode:**
- Users trade on incorrect information.
- Loss of confidence in market data.

**Recovery:**
- Pause trading.
- Manual correction of order book if corrupted.
- Public notice.

**Owner:** Trading Engineer + CTO

---

## T-10 — API Keys and Developer Access (Future)

**Description:** API keys for programmatic access to trading, data, and (future) developer platform.

**Trust Assumptions:**
- Keys are scoped correctly.
- Replay protection is enforced (currently fails open without Redis — SB-003).
- Keys are not leaked or abused.

**Threats:**
- Key compromise leading to unauthorized trading or data access.
- Replay attacks on signed requests.
- Over-privileged keys.

**Verification:**
- HMAC signature + timestamp + nonce (when Redis available).
- Permission checks.

**Monitoring:**
- Key usage patterns.
- Replay detection events.

**Failure Mode:**
- Unauthorized trades or withdrawals via compromised key.
- Data exfiltration.

**Recovery:**
- Key revocation.
- Audit of actions taken with compromised key.
- Compensation if financial damage.

**Owner:** Chief Security Officer + Platform Engineering Lead

---

## T-11 — Marketplace Content and Transactions (Future — Phase 48)

**Description:** User-generated content, strategies, indicators, bots, prompts, and paid transactions in the future marketplace.

**Trust Assumptions:**
- Content is as described.
- Payments are processed correctly.
- Revenue share is accurate.
- No malware or malicious code is distributed.
- Reviews and rankings are not gamed.

**Threats:**
- Fraudulent or malicious marketplace items.
- Payment disputes.
- Review manipulation.
- Revenue share errors.

**Verification:**
- (Future) Automated + human review pipeline.
- Sandbox execution for code.
- Payment provider integration.

**Monitoring:**
- (Future) Fraud detection, refund rates, malware scans.

**Failure Mode:**
- User loses money on malicious item.
- Platform liability for harmful content.
- Loss of creator trust.

**Recovery:**
- Refund + removal.
- Creator suspension.
- Platform compensation.

**Owner:** Marketplace Lead (future) + Chief Product Officer

---

## T-12 — White-Label Tenant Isolation and Branding (Future — Phase 44)

**Description:** When white-label is launched, each tenant's data, branding, AI behavior, and configuration must be isolated.

**Trust Assumptions:**
- Tenant A's data never reaches Tenant B.
- Tenant can trust that their branding and AI personality are under their control.
- Platform cannot (or will not) access tenant data beyond agreed scope.

**Threats:**
- Data leakage between tenants.
- Cross-tenant AI contamination.
- Branding or domain hijacking.
- Billing errors across tenants.

**Verification:**
- (Future) Row-level or schema-level isolation.
- Tenant context propagation on every query and AI call.

**Monitoring:**
- (Future) Cross-tenant access attempts, configuration drift.

**Failure Mode:**
- Tenant data breach.
- Brand damage to platform and tenant.
- Legal liability.

**Recovery:**
- Immediate isolation fix.
- Notification to affected tenants.
- Audit and compensation.

**Owner:** White-label Director + Chief Architect

---

## Summary of Trust Surfaces

| ID | Surface | Current Trust Level | Launch Risk | Owner |
|----|---------|---------------------|-------------|-------|
| T-01 | Wallet Balances & Ledger | Medium | High | Fin Systems + Wallet |
| T-02 | Withdrawals (full pipeline) | Low-Medium | Critical | Wallet + Security + Compliance |
| T-03 | Public Certificate Verification | Low | High (reputational) | Academy + Security |
| T-04 | Academy Progress & DNA | Very Low (localStorage) | High | Academy + CPO |
| T-05 | Trading DNA & Leaderboards | Very Low | Medium | Academy + CPO |
| T-06 | AI Mentor Responses | Medium | Medium | AI Platform Dir |
| T-07 | KYC / Compliance | Medium | High | Compliance + Security |
| T-08 | Identity & Sessions | Low-Medium | High | Security |
| T-09 | Public Price Data | Medium | Medium | Trading + CTO |
| T-10 | API Keys (future) | Low | Medium | Security + Platform |
| T-11 | Marketplace (future) | Not yet built | High | Marketplace + CPO |
| T-12 | White-Label Isolation (future) | Not yet built | Critical | White-label + Architect |

---

**Rule:** Every new feature or external integration (marketplace, white-label, developer platform, new AI agents, etc.) must add its trust surface to this document before entering production.

*This is the authoritative trust surface registry. It is not aspirational — it reflects current reality and planned surfaces.*

---

*Persian-first governance. English engineering terminology preserved.*