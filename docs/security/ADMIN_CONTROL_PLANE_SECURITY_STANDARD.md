# TecPey Enterprise Admin Control Plane & Platform Security Standard

Status: **Authoritative product and security invariant**

## Objective

TecPey must operate through a secure, auditable, role-aware administrative control plane covering every production domain. A single shared admin token or generic dashboard is not an acceptable production administration model.

## Non-negotiable security principles

1. Every administrator has an individual identity. Shared production administrator credentials are prohibited.
2. Default deny and least privilege apply to every administrative action.
3. Authentication requires phishing-resistant MFA; WebAuthn/passkeys are preferred.
4. Sensitive actions require recent step-up authentication.
5. Critical financial, security and compliance actions require dual control / four-eyes approval.
6. Every read of highly sensitive data and every mutation is attributable to an administrator, session, IP, device and correlation ID.
7. Audit records are append-only, tamper-evident and retained according to policy.
8. Production secrets never enter browser JavaScript, query strings, logs or analytics.
9. Administrative sessions are short-lived, revocable, device-bound where practical and continuously risk evaluated.
10. Backend authorization is authoritative. Hiding a UI control is never considered access control.

## Administrative domains

The control plane must cover:

- User, identity, account, session and device management
- KYC/KYB, AML, sanctions, risk cases and evidence
- Exchange markets, symbols, fees, limits, orders, trades and incident controls
- Wallets, deposits, withdrawals, hot-wallet limits, address controls and signer health
- Ledger reconciliation, liabilities, balances and financial exception queues
- Academy curriculum, lessons, quizzes, certificates, progress corrections and moderation
- Mentor AI policies, model/provider configuration, prompt versions, memory permissions and safety events
- Trading Arena plans, subscription cycles, three attempts, balances, positions, replay datasets and integrity controls
- Notification campaigns, templates, audience previews, approvals, rate limits and delivery analytics
- Content/CMS, localization and publishing workflows
- Tenant, workspace, feature flag and white-label management
- Support cases, disputes, complaints and account recovery
- Security operations, sessions, alerts, incidents, IP/device risk and emergency actions
- System health, queues, jobs, migrations, integrations, deployments and observability
- Audit, compliance exports, retention and legal holds

## Role and permission model

Production authorization must use explicit permissions, not broad boolean `isAdmin` checks.

Minimum roles:

- Super Administrator
- Security Administrator
- Compliance / AML Analyst
- Compliance Approver
- Finance / Treasury Operator
- Treasury Approver
- Exchange Operations
- Wallet Operations
- Academy Administrator
- Content Publisher
- Support Agent
- Support Supervisor
- Marketing Operator
- Auditor (read-only)
- Incident Commander

Permissions must be action and resource scoped, for example:

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

## Step-up and dual-control actions

At minimum, these actions require recent phishing-resistant re-authentication:

- role or permission changes
- account recovery or identity override
- KYC/AML approval overrides
- withdrawal release, wallet-limit changes or signer configuration
- ledger adjustments or balance corrections
- fee/market/risk-limit changes
- export of sensitive user, financial or compliance data
- Mentor policy/model/provider changes
- production feature-flag changes
- audit-retention or security-policy changes

At minimum, these actions require two distinct authorized administrators:

- withdrawal release above configured thresholds
- ledger adjustment
- hot-wallet or signer policy changes
- disabling AML/sanctions/risk controls
- production key rotation or emergency access
- destructive bulk user actions
- high-impact campaign to broad audiences

## Session security

- HttpOnly, Secure and strict SameSite cookies
- explicit issuer, audience, subject, role set, permission version, session ID and JTI claims
- server-side session registry and immediate revocation
- short idle and absolute expiration
- device/session inventory visible to the administrator
- IP/device anomaly detection and risk-based re-authentication
- CSRF protection for every mutation
- no raw admin secret accepted by normal production UI after bootstrap migration

## Audit event requirements

Every privileged action must include:

- immutable event ID
- timestamp
- actor admin ID and effective role
- session ID and JTI
- action and resource
- target IDs
- request/correlation ID
- source IP and user agent/device
- before and after values with sensitive-field redaction
- reason / ticket / case reference
- approval chain when applicable
- outcome and error code

Audit events must not use generic actors such as `command-center` for production accountability.

## Enterprise UI/UX requirements

The admin experience is an operational product, not a collection of cards.

Required patterns:

- task and exception queues
- global search with permission-aware results
- saved filters and views
- dense but readable data tables with server pagination
- detail drawers/pages with history and related entities
- bulk actions with preview, confirmation and limits
- explicit loading, empty, degraded, error and partial-failure states
- destructive-action confirmation with reason capture
- approval inbox and separation-of-duties visibility
- live health and incident status
- accessible keyboard navigation and focus management
- responsive design, while restricting high-risk actions on untrusted/mobile contexts where appropriate
- FA/EN and RTL/LTR parity

## Delivery gates

No admin feature is complete without:

1. explicit backend permission
2. database-backed state
3. immutable audit event
4. rate limiting and validation
5. CSRF protection for mutations
6. sensitive-data redaction
7. tests for allow/deny and privilege escalation
8. loading/error/empty/unauthorized UI states
9. CI evidence
10. operational rollback or recovery procedure

## Migration sequence

1. Inventory existing admin routes and privileged actions
2. Introduce individual admin identities, roles, permissions and session registry
3. Implement passkey/MFA and step-up authentication
4. Replace shared-token access with bootstrap-only migration path
5. Add centralized authorization middleware and immutable audit writer
6. Build security/operations shell, navigation and permission-aware routing
7. Migrate each domain into the control plane with explicit action contracts
8. Add approval workflows for critical actions
9. Add security monitoring, incident mode and emergency procedures
10. Complete penetration, authorization, accessibility, performance and disaster-recovery testing
