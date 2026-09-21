# Mentor: Rive v2 Data Binding + 20+ semantic state acceptance

**Base main:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** Independent contract PR. Mentor Workspace v2 depends on this.

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

Evolve the current signed 13-act static-safe contract into a versioned, data-bound Mentor renderer without breaking existing production behavior.

## Architecture

Backend evidence → host-owned intent/safety policy → semantic presentation state → Rive ViewModel → renderer.

The LLM never selects animation, mood or safety state directly.

## Deliverables

- New renderer contract version; v1 13-act contract remains supported during migration.
- Rive Data Binding / MVVM ViewModel fields at minimum: `userName`, `streakDays`, `mood`, `riskLevel`, `roomLevel`, plus explicit locale/reducedMotion/state fields.
- 20+ semantic states grouped and documented: conversation, learning, celebration/retry, research/work, Arena coaching, safety/privacy/data-unavailable/error.
- State transitions deterministic and testable; “negative PnL” alone never implies sadness/risk warning.
- Signed `.riv` asset acceptance: SHA/digest, required ViewModel properties, state list, artboard/state-machine names, size/perf budget, runtime compatibility.
- Static fallback remains functional if Rive fails or is disabled.
- Reduced motion maps semantic state to static pose/crossfade without meaning loss.
- Accessibility: character is decorative unless conveying information not present in text; no essential content only in animation.
- Dedicated local/runtime test playground to exercise every state and data field without business logic.
- Contract tests prevent adding UI act names not present in accepted asset manifest.

## Acceptance

A new asset cannot ship unless automated acceptance proves every required field/state and fallback. Existing v1 consumers continue working until explicitly migrated.


## Delivery discipline

This Draft PR starts as an implementation contract. Code, migrations, tests and evidence are added to this same branch; the PR does not become Ready until every acceptance criterion above is either implemented or explicitly split into a named follow-up PR. Scope reductions must be documented in the PR body; they may not be silently dropped.

## Release boundary

No merge, Staging mutation or Production mutation is authorized merely by opening this Draft PR.
