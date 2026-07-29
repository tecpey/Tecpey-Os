# TecPey Enterprise Admin Control Plane & Platform Security Standard

Status: **Authoritative product and security invariant**

## Objective

TecPey must operate through a secure, auditable, role-aware administrative control plane covering every production domain. A single shared admin token or generic dashboard is not an acceptable production administration model.

## Non-negotiable principles

1. Every administrator has an individual identity; shared production credentials are prohibited.
2. Default deny and least privilege apply to every action and resource.
3. Authentication requires phishing-resistant MFA; WebAuthn/passkeys are preferred.
4. Sensitive actions require recent step-up authentication.
5. Critical financial, security and compliance actions require dual control.
6. Sensitive reads and every mutation are attributable to an administrator, session, IP, device and correlation ID.
7. Audit records are append-only and tamper-evident.
8. Production secrets never enter browser JavaScript, URLs, logs or analytics.
9. Admin sessions are short-lived, revocable and risk evaluated.
10. Backend authorization is authoritative; hiding UI controls is not access control.

## Administrative domains

The control plane covers users and identity, KYC/KYB and AML, Exchange operations, Wallet and Treasury, Ledger and reconciliation, Academy, Mentor AI, Trading Arena, campaigns and notifications, CMS and localization, tenants and white-label, support and disputes, security operations, jobs and integrations, audit and legal retention.

## Role and permission model

Production authorization uses explicit action/resource permissions rather than boolean `isAdmin` checks. Minimum roles include Super Administrator, Security Administrator, Compliance Analyst/Approver, Treasury Operator/Approver, Exchange Operations, Wallet Operations, Academy Administrator, Content Publisher, Support Agent/Supervisor, Marketing Operator, Auditor and Incident Commander.

Representative permissions:

- `users.read`, `users.suspend`, `users.recover`
- `kyc.review`, `kyc.approve`, `aml.case.assign`, `aml.case.close`
- `withdrawals.read`, `withdrawals.hold`, `withdrawals.approve`, `withdrawals.reject`
- `wallets.limit.update`, `signers.status.read`
- `ledger.read`, `ledger.adjust.request`, `ledger.adjust.approve`
- `academy.content.edit`, `academy.content.publish`, `academy.progress.correct`
- `mentor.policy.read`, `mentor.policy.update`, `mentor.memory.inspect`
- `arena.plan.update`, `arena.attempt.reset`, `arena.integrity.review`
- `campaign.preview`, `campaign.schedule`, `campaign.approve`, `campaign.cancel`
- `security.sessions.revoke`, `security.incident.activate`
- `audit.read`, `audit.export`

## Step-up and dual control

Role/permission changes, account recovery overrides, compliance overrides, withdrawal release, wallet/signer changes, ledger adjustments, market/risk changes, sensitive exports, Mentor provider/policy changes, production flags and security policy changes require recent phishing-resistant re-authentication.

High-value withdrawals, ledger adjustments, signer/hot-wallet policy changes, disabling compliance controls, production key rotation, destructive bulk actions and broad high-impact campaigns require two distinct authorized administrators.

## Session security

Admin sessions use HttpOnly, Secure and strict SameSite cookies; explicit issuer, audience, subject, session ID and JTI; server-side registry and immediate revocation; short idle and absolute expiry; device inventory; anomaly detection; CSRF protection; and no raw shared secret in the normal production UI.

## Audit requirements

Every privileged event includes immutable event ID, timestamp, actor admin ID, role, session and JTI, action/resource/target, request ID, IP/device, redacted before/after values, reason or case reference, approval chain, outcome and error code. Generic actors such as `command-center` are not acceptable for production accountability.

## Enterprise UI/UX requirements

The admin experience is an operational product, not a collection of cards. It requires task and exception queues, permission-aware global search, saved views, server-paginated tables, entity history, bulk-action preview and limits, explicit loading/empty/degraded/error states, reason capture, approval inbox, incident status, keyboard accessibility, FA/EN and RTL/LTR parity, and restrictions on high-risk actions from unsafe contexts.

## Delivery gate

No admin capability is complete without explicit backend permission, database source of truth, immutable audit, validation and rate limiting, CSRF protection, redaction, allow/deny and escalation tests, complete UI states, CI evidence and an operational recovery procedure.

## Migration sequence

1. Inventory all privileged routes/actions/reads.
2. Introduce individual admin identities, roles, permissions and session registry.
3. Add WebAuthn/passkey MFA and step-up authentication.
4. Restrict the shared token to a controlled one-time bootstrap path.
5. Add centralized authorization and tamper-evident audit writing.
6. Build the permission-aware operations shell.
7. Migrate each product domain with explicit action contracts.
8. Add approval workflows for critical actions.
9. Add security monitoring, incident mode and emergency procedures.
10. Complete penetration, authorization, accessibility, performance and disaster-recovery testing.
