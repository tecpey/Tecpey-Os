# Notifications: relevance, fatigue, quiet-hours + channel orchestration

**Base main:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** Consumes durable events from Academy/Arena/Profile/Research but must remain safe if those producers are absent.

## Global quality bar

- Authority-sensitive state is server-owned, tenant-bound and fail-closed; clients cannot create entitlement, identity, mastery, rank or safety truth.
- No fabricated intelligence without named authority + provenance/freshness.
- Content-first design; glass only for navigation/controls/light overlays; no glass-on-glass.
- WCAG 2.2 AA minimum, 44px preferred primary targets, visible focus, no focus obscuration, reduced-motion/transparency-safe behavior.
- FA/EN parity, RTL/LTR correctness, logical CSS and bidi isolation.
- Schema validation, CSRF/rate limits, session/tenant checks, idempotency/replay defense, audit logs and negative tests.
- Structured logs, explicit degraded states, authority reason codes and freshness timestamps.
- TypeScript, ESLint, unit/integration/security/browser tests, repository audit and exact-head CI.
- Immutable exact-SHA staging-first release with rollback proof; Production requires separate explicit approval.


## Objective
Turn the notification brain/outbox into a consent-aware interruption policy: should we interrupt now?

## Decision model
Candidate event → eligibility → priority × relevance × urgency × freshness → fatigue/cadence/dedupe → quiet-hours/channel policy → send or suppress.

## Deliverables
- Versioned notification classes and preference matrix.
- User timezone/quiet hours, global/class caps, snooze and channel opt-outs.
- Correlation/dedup across repeated news, Academy reminders, Arena rank movement and Mentor prompts.
- Fatigue budget with decay; security/transactional classes explicitly separate.
- “No notification” is a successful outcome with reason code.
- In-app timeline first; email/SMS/Telegram only where configured/consented.
- Personalized copy uses bounded facts, never hallucinated traits.
- Rank movement requires comparable authoritative snapshots.
- News notification requires source/freshness/topic relevance.
- Delivery telemetry measures send/open/action/suppress without manipulative streak pressure.
- Admin debug surface explains send/suppress decision.

## Anti-dark-pattern rules
No false urgency, shame, fabricated scarcity, reward-loss threats or repeated nagging after opt-out.

## Acceptance
Property/integration tests prove quiet hours, caps, dedupe and consent cannot be bypassed by high priority.

## Delivery discipline
This Draft PR begins as an implementation contract. Code, migrations, tests and evidence are added to this same branch. It cannot become Ready until each acceptance item is implemented or explicitly split into a named follow-up PR.

## Release boundary
Opening this PR authorizes no merge, Staging mutation or Production mutation.
