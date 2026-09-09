# Connected TecPey experience: delivery and acceptance

Updated: 2026-09-07. This is an implementation backlog, not a readiness claim.

## Product outcome

Earn voluntary return through useful learning, trustworthy information and
visible progress. Measure retention alongside learning outcomes, satisfaction,
notification opt-outs and successful task completion. Do not optimize session
length, pressure to trade, false urgency or compulsory streak maintenance.

## Wave 2 implemented locally

Arena GET now requests strict revocation verification, matching POST. Both
methods distinguish identity-authority outage (503), guest (401 login), and
authenticated account without a student identity (401 profile). The UI sends
only an explicit profile-required response to onboarding; other 401 responses
offer login with a return path to Arena. No access or tenant gate was removed.

Verification: 3 new access-state tests and 53 existing Arena/notification tests
passed; TypeScript, targeted ESLint and two session authority guards passed.
Production build, including server bundling, passed. Database was unconfigured;
no live/database integration or visual acceptance is claimed. Not deployed.

## Blocking identity work

Password login, 2FA completion and refresh all currently sign `studentId: null`.
Updating only password login would regress again on refresh. Resolve the existing
account-to-student relationship through authoritative ownership, without trusting
a submitted student ID or granting access from an email match alone. Check tenant
binding and revocation. Do not create students as a side effect of token renewal.

Required evidence: existing profile, absent profile, duplicate/ambiguous mapping,
relogin, refresh, 2FA, expired/revoked credentials, foreign tenant and DB/Redis
outage. PostgreSQL/Redis integration is still outstanding in this workspace.

## Delivery order and acceptance criteria

| Domain | Deliverable | Acceptance evidence |
| --- | --- | --- |
| Identity | Consistent student identity across all session issuance paths | Isolation and lifecycle integration tests; no account recreation or silent privilege gain |
| Shared experience | One navigation vocabulary, FA/EN parity, responsive layout, light/dark, accessible focus and errors | Desktop/mobile screenshots; keyboard, zoom and RTL checks; Safari review |
| Academy and exams | Lesson → assessment → explanation → targeted practice → progress | Server-issued results, resumable attempts, honest locking, assessment versioning, no duplicate rewards |
| Arena | Practice → journal → feedback → next learning action | Server price/risk authority, idempotent orders, replay consistency, visible stale-data state; EN execution parity |
| Mentor | Contextual coaching grounded in the learner's actual authorized evidence | Provider failure/fallback, cost/time budgets, opt-in data scopes, deletion controls, no invented achievements |
| Animated mentor | Original TecPey character with meaningful idle/listening/thinking/speaking/success/error states | Licensed/original assets, production animation artifact, real state wiring, reduced-motion fallback and mobile performance |
| Notifications | Mentor, Academy and Arena events through the governed dispatcher | Deduplication, preferences, quiet hours, frequency cap, digest, expiry, safe deep links and opt-out checks |
| News | Source ingestion → normalization → deduplication → verification → localized publication | Source attribution, freshness, correction/retraction, missing-provider state, retry/dead-letter observability |
| Social content | News/learning material → platform-specific draft → approval → scheduled publication | Rights/source records, destination verification, no repeated posts, retry idempotency, moderation and preview |
| Admin | Operational visibility and real controls for providers, queues and publishing | Role-gated actions, audit trails, queue health, provider failures, spend limits and emergency pause |
| Subscriptions | Clear plans and dependable entitlement lifecycle | Purchase/cancel/refund/webhook retries and server entitlement tests; no UI-only paywall authority |

## Existing notification foundation observed

`src/lib/notifications/policy.ts` includes optional category opt-out, quiet-hour
policy, consent-required marketing and frequency/digest decisions. Existing tests
exercise those decisions. This is not proof that every producer or external
delivery provider is connected or operational. Validate event production,
outbox/worker execution and user-visible delivery independently.

## Release evidence

Every wave must state implemented scope, test scope, known gaps and deployment
status. Source-contract/unit tests cannot stand in for visual or database E2E
evidence. Apple-inspired craft is a design goal, not certification or an App
Review approval claim. External posts and production deployment require their
own concrete review step.
