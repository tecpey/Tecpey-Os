# AI: Model Lab + AI Council policy orchestration

**Base main:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** Deep Research contracts + Pro entitlement; builds on existing provider router/control-plane catalog.

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

Expose TecPey’s multi-provider intelligence as a governed product capability rather than a model dropdown that bypasses policy.

## Research-derived provider/tool controls

Current provider documentation shows an important convergence: “search” is a tool capability with provider-specific metadata, filtering and source/citation output—not a stable model-brand feature.

Primary references:
- OpenAI web search: https://developers.openai.com/api/docs/guides/tools-web-search
- Anthropic web search: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
- xAI X Search: https://docs.x.ai/developers/tools/x-search

Implementation consequences:
- provider/model IDs are registry data with effective dates and health, never hard-coded into user-flow business logic;
- capability discovery is explicit: `web_search`, `social_search`, citations, structured output, long-context, reasoning tier, tool budgets;
- a model upgrade or retirement changes catalog/configuration and evaluation evidence, not application architecture;
- provider fallback must preserve task constraints: a fallback lacking required source/citation/social capability is not an acceptable “successful” fallback;
- X/social search is a distinct evidence channel; it cannot satisfy independent factual-source requirements by itself;
- full provider prompt/raw output is not indiscriminately logged; telemetry stores bounded operational metadata and policy/evaluation artifacts;
- user-visible Model Lab comparisons use the same normalized task, source constraints and output schema so comparison is not biased by silently different tool access;
- council synthesis retains dissent/missing-evidence metadata rather than averaging conflicting outputs into false consensus.

## Deliverables

- Capability registry per provider/model: reasoning, web search, X/social search, long-context, structured output, cost class, latency class, health.
- Policy router chooses provider/model from task requirements, entitlement, locale, safety, freshness and budget—not brand preference alone.
- Circuit breaker, timeout, retry/fallback matrix and per-provider usage telemetry.
- AI Council roles: Reasoning, Research, Social Narrative, Market Context, Tutor. Roles are capabilities, not fixed vendors.
- Synthesis layer surfaces agreement, disagreement, missing evidence and confidence rationale.
- User-facing Model Lab (optional Pro): user can compare eligible models on the same bounded prompt but cannot bypass tool/safety/tenant policy.
- Model version used, tool use, freshness and citations visible in result metadata where appropriate.
- Admin controls for provider enablement, routing weights, quotas and emergency disable.
- Evaluation harness: factuality/citation coverage, structured-output validity, latency, cost, refusal/safety consistency, Persian/English quality.
- No provider output can directly mutate trading, KYC, payments, entitlement or Mentor animation state.

## Acceptance

Provider outage degrades to an allowed fallback or explicit unavailable state. The same task can be replayed through the evaluation harness with recorded policy and provider metadata.


## Delivery discipline

This Draft PR starts as an implementation contract. Code, migrations, tests and evidence are added to this same branch; the PR does not become Ready until every acceptance criterion above is either implemented or explicitly split into a named follow-up PR. Scope reductions must be documented in the PR body; they may not be silently dropped.

## Release boundary

No merge, Staging mutation or Production mutation is authorized merely by opening this Draft PR.
