# Notifications: relevance, fatigue, quiet-hours + channel orchestration

**Refreshed onto main:** `96b56d0e469b356ccf8ee698c5a75a36d1cabe60`

**Dependencies:** Consumes durable, versioned events from Academy/Arena/Profile/Research. The notification boundary must remain safe when a producer is absent, duplicated, delayed or malformed.

## Objective

Turn the notification brain/outbox into a consent-aware interruption authority that answers one question deterministically: **should TecPey interrupt this person, on this channel, now?**

The system must prefer no interruption over an unjustified interruption. “No notification” is a successful policy outcome with a durable reason code.

## Non-negotiable authority model

- `src/lib/notifications/producers.ts` is the trusted domain-event producer boundary for the current pilot.
- `src/lib/notifications/creation.ts` is the single in-app intent / notification / outbox creation authority.
- `src/lib/notifications/policy.ts` is the deterministic recipient/channel policy authority.
- Authority-sensitive facts are server-owned, tenant-bound and fail-closed; client metadata or AI output cannot create relevance, urgency, consent, entitlement, identity, rank, mastery or safety truth.
- Mandatory security, financial, legal/compliance and governed administrative notices remain explicitly separate from optional engagement traffic.
- Optional priority must never override category opt-out, channel opt-out, marketing consent, mute, quiet-hours or a hard fatigue decision.
- Every policy decision must remain replayable/explainable from bounded inputs and durable reason codes.

## Current decision path

Trusted versioned domain event
→ strict parsing and principal/tenant binding
→ correlation/idempotency authority
→ recipient eligibility and jurisdiction
→ expiry / duplicate / approval / template checks
→ consent and category/channel preference
→ destination verification
→ mute and quiet-hours
→ category fatigue/cadence policy
→ allow / defer / digest / suppress / escalate
→ immutable intent + policy snapshot
→ notification + transactional outbox where admitted.

## Current pilot scope

- In-app delivery is the only enabled creation path in this pilot authority.
- External channel types exist in the policy model, but email/SMS/push orchestration is not represented as enabled merely because a type exists.
- Current production producers are principal-specific domain events. Generic personalized relevance scoring is **not** treated as runtime authority until server-owned evidence exists.

## Proven controls already present on the refreshed base

- versioned notification classes and class policy matrix;
- tenant/principal binding and inactive-principal rejection;
- durable correlation/idempotency with payload-conflict rejection;
- category/channel preference enforcement;
- marketing-consent enforcement for marketing class policy;
- mute and timezone-aware quiet-hours handling;
- per-category 24-hour optional delivery caps for the current pilot classes;
- instant/digest cadence resolution;
- expiry-before-admission and expiry-after-scheduling handling;
- mandatory-class fallback/escalation semantics;
- immutable intent ledger and transactional outbox;
- durable policy snapshots and explicit decision/reason codes;
- FA/EN producer copy for the current event set;
- tenant-isolation, outbox, delivery-visibility and replay tests.

## Strict-audit findings that remain open

### #728 — concurrency-safe and pending-aware fatigue budget

The current cap reads delivered notifications and serializes creation by correlation key. Distinct correlation keys can race on the same principal/category budget, and deferred/digest rows do not yet reserve interruption budget while pending. PR #707 must not claim a concurrency-safe fatigue budget until #728 is closed with a transactional invariant and concurrent PostgreSQL proof.

### #729 — server-owned relevance/freshness evidence

A standalone relevance/freshness score without a trusted evidence resolver would be bypassable pseudo-authority. The experimental unwired score helper was removed from this branch. #729 owns the evidence schema, provenance/freshness rules, replay identity, negative tests and later calibration/holdout work. AI- or caller-supplied scores are explicitly forbidden as delivery authority.

## Product and anti-dark-pattern rules

- No false urgency, shame, fabricated scarcity, reward-loss threats or repeated nagging after opt-out.
- Do not maximize sends, opens, streak pressure or notification volume as a product objective.
- Passive/in-app delivery is preferred when immediacy is not justified.
- Interruption level must match the significance and time-sensitivity of the information.
- User notification controls remain authoritative for optional classes.
- Personalized copy may use only bounded, attributable facts; never hallucinated traits or inferred vulnerabilities.
- Rank movement requires comparable authoritative snapshots.
- News/market notifications require source provenance, freshness and topic relevance before they can enter a future scored path.

## Acceptance evidence for this PR

Before this Draft can become Ready:

1. exact-head TypeScript, ESLint, unit/integration/security and production-build gates are green except for independently identified repository-wide human-governance gates;
2. tests prove optional high priority cannot bypass quiet-hours, category/channel opt-out or marketing consent;
3. tests prove hard mandatory classes remain separate from optional fatigue suppression;
4. replay/idempotency and payload-conflict behavior remain deterministic;
5. all changed behavior has durable reason codes and policy snapshot evidence;
6. zero unresolved review threads remain;
7. #728 and #729 remain explicitly visible blockers unless implemented on this branch; they may not be silently treated as completed;
8. no Staging or Production mutation is performed as part of making this PR reviewable.

## Delivery discipline

This Draft PR is an implementation and proof track, not a launch approval. A passing build does not convert known unimplemented authority into shipped capability. The PR stays Draft while #728/#729 are unresolved or until their required authority is implemented with exact-head evidence.

## Release boundary

Opening, refreshing or testing this PR authorizes no merge to `main`, no Staging mutation and no Production mutation. Production requires a separate explicit release decision and exact-candidate evidence.
