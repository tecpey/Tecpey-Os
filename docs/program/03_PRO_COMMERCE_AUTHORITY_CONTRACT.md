# Commerce: Pro subscription + entitlement authority

**Base main:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** Identity/Auth authority. Research/Model Lab/Mentor Workspace consume this entitlement contract.

## Global quality bar

Every implementation under this program is governed by the following non-negotiable rules:

- **Authority first:** security-, entitlement-, identity-, mastery-, rank-, payment- and personalization-sensitive state is server-owned, tenant-bound and fail-closed. Client state can render authority but cannot create it.
- **No fabricated intelligence:** no synthetic mastery, risk, rank, subscription, confidence, live market value or AI capability may be presented as fact without a named authority and freshness/provenance.
- **Design:** content-first hierarchy. Translucent/glass treatment is reserved for navigation, controls and lightweight overlays; never glass-on-glass or decorative transparency that competes with content.
- **Accessibility:** WCAG 2.2 AA minimum, 44px preferred primary touch targets, visible keyboard focus, no focus obscured by sticky UI, semantic landmarks, reduced-motion and reduced-transparency-safe behavior, screen-reader states for loading/error/degraded/locked.
- **Localization:** FA/EN parity in the same PR, correct RTL/LTR semantics, logical CSS properties, bidi isolation for identifiers/numbers, no English-only operational dead ends.
- **Security:** strict schema validation, bounded payloads, CSRF for mutations, rate limiting, tenant/workspace authorization, session/revocation checks, idempotency/replay defense, audit trail and negative tests.
- **Privacy:** data minimization; self-reported notes never silently become inferred traits; sensitive profile changes require explicit authority and user-facing explanation.
- **Observability:** structured logs, correlation IDs, explicit degraded modes, freshness timestamps, provider/authority reason codes and bounded telemetry.
- **Testing:** TypeScript, ESLint, unit, integration, negative/security tests, repository audit classification, public browser golden path, mobile/desktop FA/EN evidence, exact-head CI.
- **Release:** immutable exact-SHA artifact, staging-first, health + smoke + rollback proof, Production untouched until a separate explicit release decision.

### Research anchors

This program is informed by current primary guidance: Apple Liquid Glass/HIG content-first hierarchy and reduced motion/transparency; WCAG 2.2 focus/target criteria; Rive Data Binding/ViewModel/MVVM; current OpenAI Responses web-search/citation patterns; Anthropic citation-enabled web search with dynamic filtering; xAI Web/X Search; and evidence on spacing + retrieval practice for durable learning. External provider names/models remain registry data, not hard-coded product architecture.


## Objective

Create a provider-neutral commercial authority for TecPey Pro without letting payment-provider details leak into product logic.

## Deliverables

- Versioned plan catalog and capability grants; plan names/prices/renewal/legal copy are data, not scattered UI constants.
- Provider adapter interface for checkout/session creation, invoice/payment events, refunds and cancellations.
- Subscription lifecycle with explicit effective timestamps and server-derived capability snapshots.
- Idempotent webhook/event ingestion with replay protection, signature verification, raw-event retention policy and deterministic reconciliation.
- Entitlements are materialized server-side from commercial authority; browser/client cannot grant Pro.
- Grace/suspension/cancellation behavior is explicit and testable; never infer entitlement from “payment success” UI redirect alone.
- Customer-facing billing surface: current plan, renewal date, cancellation semantics, receipts/invoices when provider supports them, support path.
- Admin/support audit view with immutable commercial events and reconciliation reason codes.
- Feature flags keep purchasing disabled until provider credentials, pricing, refund/cancellation terms and legal disclosures are configured.
- Existing Arena entitlement grants must remain compatible but clearly distinguished from global Pro commercial entitlements.

## Research-derived commercial/event controls

Stripe's public idempotency guidance is used as a quality reference for safe retry semantics, not as a provider commitment:
- https://docs.stripe.com/api/idempotent_requests

Implementation consequences:
- every outbound mutating provider request receives a TecPey-generated idempotency key bound to the intended commercial operation;
- inbound provider events are deduplicated by provider + event ID + account scope before any entitlement projection;
- HTTP redirect/return success is **never** payment or entitlement authority;
- provider events may arrive late, duplicated or out of order; projection logic must reconcile by effective event timestamps/version and current provider object state where supported;
- money amounts use exact integer minor-unit/currency semantics or an explicitly versioned equivalent—never floating-point arithmetic;
- provider-specific status values normalize into a TecPey subscription state machine; unknown values fail closed and are observable;
- manual grants/refunds/revocations are separate audited commands and cannot overwrite raw provider history;
- commercial event retention, PII minimization and log redaction are explicit;
- reconciliation jobs compare provider truth, TecPey commercial ledger and entitlement projection and emit bounded mismatch reason codes.

## Security

- no card/payment secrets stored by TecPey;
- signed webhooks only;
- idempotency keys on mutating provider calls;
- tenant/user binding on every commercial event;
- downgrade cannot leave premium capabilities active past policy-defined effective time;
- full audit trail for manual grants/revocations.

## Acceptance

A webhook replay cannot duplicate entitlement. A failed/late/out-of-order event reconciles deterministically. UI reads capability authority and fails closed during provider outage.


## Delivery discipline

This Draft PR starts as an implementation contract. Code, migrations, tests and evidence are added to this same branch; the PR does not become Ready until every acceptance criterion above is either implemented or explicitly split into a named follow-up PR. Scope reductions must be documented in the PR body; they may not be silently dropped.

## Release boundary

No merge, Staging mutation or Production mutation is authorized merely by opening this Draft PR.
