# TecPey Intelligent Notification & Communication Platform

Status: **Phase 0 authority contract**  
Owner: Platform / CRM / AI Operating System  
Related issue: #85

## 1. Purpose

TecPey notifications are a shared platform capability, not a collection of direct provider calls. Every personal, cohort, campaign, operational and platform-wide message must pass a deterministic server-owned policy before any channel adapter can receive it.

The platform supports:

- individual notifications;
- user-selected topic and asset alerts;
- Academy and Trading Arena automation;
- Social Layer events;
- CRM cohorts and campaigns;
- News and market-intelligence alerts;
- security, legal, compliance, Exchange and Wallet events;
- Admin, incident and C-level operational communication;
- AI-assisted ranking, summarization and digest composition within fixed policy limits.

## 2. Authority boundaries

| Concern | Authority |
|---|---|
| Event existence and financial/security facts | Committed authoritative domain state |
| Recipient identity and eligibility | Identity/RBAC/CRM/domain database |
| Consent and category/channel preference | Notification preference and consent records |
| Quiet hours, caps, dedupe and expiry | Deterministic Notification Policy Engine |
| Audience membership | Versioned server-side audience resolution |
| Mandatory/optional classification | Versioned notification-class policy |
| Message facts and variables | Approved template plus authoritative event payload |
| AI summary/ranking | Advisory transformation after facts and eligibility |
| Provider delivery acceptance | Channel adapter response |
| Delivered/opened/clicked evidence | Verified provider callback or first-party event |
| Campaign approval | Admin Control Plane and configured dual control |
| Audit and reconciliation | Notification delivery ledger and immutable audit evidence |

The following are explicitly **not** authorities:

- browser localStorage/sessionStorage;
- client-provided recipient IDs or eligibility;
- AI classification of a message as mandatory;
- queue payloads when they conflict with committed database state;
- provider response text without signature/correlation verification;
- open/click metrics as proof that content was accurate or appropriate.

## 3. High-level flow

```text
Authoritative domain transaction
        │
        ├─ commit event/outbox record
        ▼
Notification intent ingestion
        │
        ├─ classify from versioned server policy
        ├─ resolve audience snapshot
        ├─ load consent/preferences/eligibility
        ▼
Deterministic policy evaluation per recipient + channel
        │
        ├─ allow
        ├─ defer until quiet-hours end
        ├─ aggregate into digest
        ├─ suppress with reason
        └─ escalate for approval/fallback/manual repair
        ▼
Template rendering and optional AI-assisted transformation
        │
        ├─ facts remain immutable
        ├─ approved variables only
        └─ provider/model/prompt/reviewer provenance
        ▼
Transactional delivery outbox
        ▼
Channel adapter → provider
        ▼
Attempt ledger / callback verification / retry / DLQ
        ▼
User inbox projection + analytics + audit + reconciliation
```

## 4. Notification taxonomy

Every intent uses exactly one class:

1. `security_critical`
2. `financial_transactional`
3. `legal_compliance_service`
4. `academy`
5. `trading_arena`
6. `mentor_ai`
7. `social`
8. `news_market_intelligence`
9. `product_support`
10. `marketing_campaign`
11. `admin_operations`

A security, financial or legal message may not contain marketing content. Reclassification requires a versioned policy change and review; it is not a per-message AI decision.

## 5. Audience contracts

Supported audience scopes:

- one principal;
- immutable principal list;
- domain cohort;
- CRM segment snapshot;
- topic/coin/tool followers;
- role or current on-call group;
- tenant;
- platform;
- emergency broadcast.

Audience queries are never executed lazily at delivery time without a versioned snapshot. The system records:

- audience definition;
- resolver version;
- creation time;
- total eligible, suppressed and unresolved counts;
- tenant/jurisdiction/locale breakdown;
- approver(s);
- immutable snapshot or replayable membership evidence.

AI may propose a segment query but cannot activate or expand it.

## 6. User preference and consent model

The future user Notification Center must support:

- category × channel preferences;
- instant versus digest delivery;
- quiet hours and timezone;
- followed topics/assets/tools and thresholds;
- mute and snooze;
- marketing consent and withdrawal history;
- registered browser/mobile devices;
- notification history and reason-for-delivery;
- visible unsubscribe and preference controls.

Mandatory security, transactional and legal categories remain available through at least one governed channel. A disabled mandatory channel causes fallback/escalation; it does not authorize silent message loss.

Consent records require:

- tenant and principal;
- purpose/category;
- status;
- policy/version accepted;
- source and UI surface;
- timestamp and jurisdiction;
- withdrawal timestamp and reason where supplied;
- immutable audit reference.

## 7. Deterministic policy engine

The first implemented authority is:

```text
src/lib/notifications/policy.ts
```

It returns a structured decision:

- `allow`
- `defer`
- `digest`
- `suppress`
- `escalate`

with a machine-readable reason code, mandatory flag, optional `notBefore` and fallback-channel instruction.

Policy order is intentionally fail-closed:

1. validate timestamps, correlation key and counters;
2. recipient eligibility;
3. jurisdiction;
4. expiry;
5. duplicate/correlation evidence;
6. campaign/broadcast approval and dual control;
7. template availability;
8. consent and optional category settings;
9. channel availability and destination verification;
10. mute and quiet hours;
11. frequency cap;
12. cadence/digest preference;
13. allow.

AI suggestions are not inputs to this authority.

## 8. Approval matrix

| Dispatch | Default approval requirement |
|---|---:|
| Individual committed domain event | 0 |
| Approved automation to eligible recipients | 0 after automation policy approval |
| Campaign | 1 |
| Tenant broadcast | 1 |
| Platform broadcast | 2 |
| Emergency broadcast | 2 plus incident/severity evidence |

Future policy may require additional approvals for legal, custody, compliance or sensitive CRM segments.

## 9. Proposed persistent model

No database migration is introduced in Phase 0 because TecPey still needs a unified platform-principal and tenant authority before notification foreign keys are finalized. The production model must eventually include at least:

### Configuration

- `notification_class_policies`
- `notification_templates`
- `notification_template_versions`
- `notification_channel_providers`
- `notification_automations`

### User control

- `notification_preferences`
- `notification_consents`
- `notification_devices`
- `notification_topic_subscriptions`
- `notification_suppressions`

### Intent and audience

- `notification_intents`
- `notification_audience_definitions`
- `notification_audience_snapshots`
- `notification_audience_members`
- `notification_policy_decisions`

### Delivery

- `notifications`
- `notification_deliveries`
- `notification_delivery_attempts`
- `notification_provider_callbacks`
- `notification_digests`
- `notification_outbox`
- `notification_dead_letters`

### Campaign and audit

- `notification_campaigns`
- `notification_campaign_versions`
- `notification_campaign_approvals`
- `notification_experiments`
- `notification_audit_events`

All applicable records must be tenant-scoped. High-volume attempt/callback tables require retention and partitioning strategy.

## 10. Delivery guarantees

- domain events are emitted only after authoritative transaction commit through a transactional outbox;
- notification ingestion and delivery are idempotent by correlation/idempotency keys;
- processing is at-least-once, while user-visible delivery is deduplicated;
- retries depend on classified provider failure, not a generic loop;
- every attempt is immutable;
- latest status is a projection, not replacement for attempt history;
- provider callbacks require signature and message-ID correlation;
- terminal failures enter DLQ/manual repair;
- expiry is enforced before every retry;
- corrections and retractions preserve original evidence.

## 11. Channel boundaries

### In-app

First production channel. It requires no external destination but still requires recipient eligibility, policy, persistent notification record and read/dismiss/action evidence.

### Web/mobile push

Requires verified subscription/device, permission state, endpoint rotation handling and lock-screen redaction. Sensitive financial or KYC details do not appear in payload previews.

### Email

Requires verified address, bounce/suppression management, plain-text alternative, localization, unsubscribe rules and signed sensitive-action links.

### SMS

Restricted to configured security, transactional, legal or explicit-consent workflows because of cost, privacy and delivery uncertainty. It must never include secrets or full financial identifiers.

### Admin Center

Recipient eligibility derives from current RBAC/on-call evidence. Confidential operational messages cannot fall back to consumer channels unless policy explicitly allows it.

## 12. Intelligent personalization

Personalization is allowed only after eligibility and consent. It may consider:

- preferred locale/timezone/channel;
- authorized Academy progress;
- current Arena cycle and learning risk;
- followed topics/assets/tools;
- unresolved support tasks;
- recent notification fatigue;
- accessibility/device capabilities.

Every notification should expose a reason such as:

- “You asked to follow Bitcoin security news.”
- “Your Arena reflection is still unfinished.”
- “A new login was detected on your account.”
- “This is part of the weekly Academy digest you enabled.”

Personalization must not use fear, urgency or market volatility to pressure deposits or trading.

## 13. AI boundary

TecPey AI may:

- draft from approved facts;
- translate/localize;
- summarize lengthy events;
- select among already-approved templates;
- rank eligible optional items;
- aggregate digests;
- flag likely fatigue or irrelevance;
- propose campaign audiences and timing;
- analyze delivery performance.

TecPey AI may not:

- override policy decisions;
- change a class to mandatory;
- invent financial/security facts;
- send emergency/platform broadcasts;
- use unapproved CRM/KYC/wallet fields;
- generate direct trading signals;
- bypass approval, quiet hours, consent, caps or suppression;
- publish AI-created copy without required review state.

## 14. Domain examples

### Academy continuation

An automation detects committed incomplete progress, resolves users who enabled Academy reminders, checks fatigue and quiet hours, and sends an in-app message or places it in the next digest.

### Arena risk event

A committed Arena risk-rule event creates an educational intent. The message clearly says the activity was simulated. It may link to the journal or relevant risk lesson, but must not celebrate reckless PnL.

### Withdrawal status

The Wallet pipeline emits only after a committed authoritative transition. The notification renderer reads current DB authority; it does not trust queue-provided address, amount or transaction hash.

### Breaking news

An approved editorial event identifies source, freshness and affected followed assets. AI may summarize the approved facts. Only eligible followers receive it; critical/breaking severity cannot be self-declared by the model.

### Social mention

Before delivery, the resolver rechecks block/mute/privacy state. Multiple low-priority events may be batched to reduce fatigue.

### Admin incident

An incident intent resolves the active role/on-call group, records confidential classification, delivers through Admin Center and approved escalation channels, and produces an immutable incident delivery report.

## 15. Observability and SLO direction

Measure:

- policy allow/defer/digest/suppress/escalate by reason;
- ingestion and delivery latency;
- queue depth and age;
- provider acceptance/delivery/failure;
- retry and DLQ rate;
- opt-out, complaint, mute and fatigue;
- task completion and usefulness feedback;
- cost by tenant/channel/purpose;
- security/transactional SLO;
- audience and callback reconciliation.

Open and click rate are secondary signals. Safety, relevance, delivery reliability and successful task completion are primary.

## 16. Delivery sequence

1. **Phase 0:** policy/types/tests/authority document.
2. **Phase 1:** unified principal/tenant references, migrations and in-app inbox.
3. **Phase 2:** preference/consent center and first Academy/support/security integrations.
4. **Phase 3:** email/web-push adapters, callbacks, retry/DLQ and digests.
5. **Phase 4:** CRM campaigns, audience snapshots, approval UI and analytics.
6. **Phase 5:** AI-assisted ranking/summarization under policy.
7. **Phase 6:** native mobile and other approved channels.

## 17. Phase 0 completion boundary

Phase 0 is complete only when:

- notification types and policy compile;
- policy tests cover consent, approvals, quiet hours, duplicate, expiry, caps and destination fallback;
- existing CI remains green;
- no provider is activated prematurely;
- the production persistence gap remains explicitly documented;
- issue #85 remains open for the durable implementation.
