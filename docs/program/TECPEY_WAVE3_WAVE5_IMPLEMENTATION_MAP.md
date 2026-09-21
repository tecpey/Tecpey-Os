# Program: TecPey remaining-work implementation graph

**Base main:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** None — coordination PR only.

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

Turn every material remaining product/release gap after Profile VNext Wave 2 and the landing foundation into an explicit, reviewable delivery graph.

## Workstreams and merge order

1. **Release & Staging Automation** — exact-SHA promotion, rollback and smoke evidence.
2. **Identity / Auth / KYC Authority** — durable identity, regional auth fallbacks, verification lifecycle.
3. **Pro Commerce Authority** — provider-neutral subscription, entitlement and billing truth.
4. **Deep Research Workspace** — sourced, resumable research with claim/citation/conflict/freshness model.
5. **AI Model Lab & Council** — policy-routed multi-provider intelligence and optional transparent model lab.
6. **Mentor Rive v2 Contract** — data-bound 20+ semantic presentation states with signed asset acceptance.
7. **Mentor Workspace v2** — office/chat/action workspace + mini Arena, mobile-first fallback.
8. **Academy Infinite Growth & Assessment Quality** — Term 8, adaptive remediation, item-bank quality, spacing/retrieval.
9. **Arena & League v2** — governed scoring, seasons, fairness, ranks, replay and reward-policy authority.
10. **Living Profile Wave 3** — journey, league/achievement intelligence, identity/KYC status, next-best-action.
11. **Notification Orchestrator v2** — relevance/urgency/fatigue/quiet-hours/caps/dedupe/channel consent.
12. **Global Experience & Launch Hardening** — FA/EN, mobile Safari/PWA, accessibility, visual/perf regression and launch gate.

## Dependency graph

- 1 is operationally independent and should land first.
- 2 is a foundation for 3 and materially improves 10.
- 3 gates premium behavior in 4/5/7/10.
- 4 and 5 share AI control-plane contracts; 4 should land before the user-facing Model Lab.
- 6 is the motion contract; 7 consumes it and must not invent states outside it.
- 8 and 9 produce governed learning/practice evidence consumed by 10 and 11.
- 10 consumes 2/3/8/9 but must still degrade correctly before all optional authorities are available.
- 11 consumes durable events from 8/9/10.
- 12 is the final cross-platform acceptance layer after feature PRs are stable.

## Program rules

- PRs remain Draft until their own acceptance gates are implemented and green.
- No stacking hidden dependencies: each PR body must name upstream PRs/contracts.
- Database migrations are forward-only and idempotent; destructive cleanup is a separate follow-up.
- No payment, cash reward, KYC approval, trading signal or premium research activation is enabled by UI-only work.
- Provider outages and missing authority must render explicitly, not silently fall back to invented values.
- Each PR must include rollback notes and a staging verification checklist before Ready-for-Review.


## Delivery discipline

This Draft PR starts as an implementation contract. Code, migrations, tests and evidence are added to this same branch; the PR does not become Ready until every acceptance criterion above is either implemented or explicitly split into a named follow-up PR. Scope reductions must be documented in the PR body; they may not be silently dropped.

## Release boundary

No merge, Staging mutation or Production mutation is authorized merely by opening this Draft PR.
