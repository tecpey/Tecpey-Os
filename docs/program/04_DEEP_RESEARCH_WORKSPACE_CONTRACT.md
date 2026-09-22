# Research: Deep Research workspace + source truth contract

**Base main:** `44ee569f52c9fbb4ef6fe7e3471f4a80e89fd451`

**Dependencies:** merged Pro Commerce authority (#699) for premium execution; existing AI routing/control plane for provider access.

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

This program is informed by current primary guidance: Apple HIG content-first hierarchy and reduced motion/transparency; WCAG 2.2 focus/target criteria; current provider web-search/citation patterns; and provenance/risk-management guidance. External provider names/models remain registry data, not hard-coded product architecture.

## Objective

Turn “Deep Research” from a capability label into a professional research workspace whose claims are inspectable and whose uncertainty is visible.

## Deliverables

- Durable research job: question, scope, locale, requested freshness, provider strategy, state, progress, timestamps, cancellation.
- Research artifact model: sources, source snapshots/metadata, claims, claim→source citations, conflicting evidence, unresolved questions, confidence rationale, freshness.
- Inline citations are first-class UI objects and visibly clickable; no citation list detached from the claims it supports.
- “Updated at” and source age on time-sensitive market/news material.
- Source controls: trusted-domain allowlist/denylist, public web vs connected/private sources, provider-specific filtering through a normalized policy layer.
- Multi-stage UX: plan → gather → synthesize → verify → report; progress can be inspected without exposing private chain-of-thought.
- Report sections: What is known, Evidence, Conflicting evidence, Unknowns, Educational meaning, Sources.
- Export/share format that preserves citation IDs and freshness metadata.
- Research history with resume/re-run while preserving prior report immutability.
- Cost/time/tool budget and cancellation controls.
- Market research remains educational: no guaranteed prediction, no auto-order path, no model-generated buy/sell instruction presented as authority.

## Research-derived provenance contract

Retrieval is a **tool event with source metadata**, not invisible prose generation.

Primary references:
- OpenAI web search / Responses: https://developers.openai.com/api/docs/guides/tools-web-search
- Anthropic web search with citations/domain controls/dynamic filtering: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
- xAI Web/X Search: https://docs.x.ai/developers/tools/web-search and https://docs.x.ai/developers/tools/x-search

Canonical TecPey objects must therefore separate:
- `ResearchSource`: stable source ID, URL, publisher/domain, title, retrieved-at, published/event time if known, locale, source channel, provider metadata;
- `ResearchClaim`: claim ID, report section, normalized text, claim type (externally factual / synthesis / opinion / unresolved), freshness class;
- `ClaimCitation`: claim ID → one or more source IDs with bounded locator/annotation metadata;
- `ConflictSet`: material source/claim disagreement with no forced false consensus;
- `ResearchRun`: task policy, entitlement, providers/tools attempted, budgets, cancellation, start/end, degraded reason;
- `ResearchArtifact`: immutable version that can be superseded by a later run but not silently rewritten.

UI consequences:
- citations remain adjacent/clickable where the claim is shown;
- “sources consulted” and “sources cited” are distinguishishable;
- social/X evidence is visibly labeled as social narrative and cannot satisfy an independent factual-source requirement by itself;
- provider-specific filtering/search controls normalize into TecPey policy fields (allowed domains, blocked domains, freshness, channel);
- provider fallback cannot erase provenance: each source/tool event preserves the provider/channel that produced it.

## Provider architecture

Use a provider-agnostic search result contract. OpenAI Responses web search, Anthropic citation-enabled web search/dynamic filtering, xAI Web/X Search and other configured providers map into the same provenance model. Provider names/models remain catalog data.

## Acceptance

Every externally factual claim in a research report is either cited or explicitly marked as model synthesis/opinion. Missing sources/freshness fail visibly rather than being replaced by a confident paragraph.

## Delivery discipline

This Draft PR starts as an implementation contract. Code, migrations, tests and evidence are added to this same branch; the PR does not become Ready until every acceptance criterion above is either implemented or explicitly split into a named follow-up PR. Scope reductions must be documented in the PR body; they may not be silently dropped.

## Release boundary

No merge, Staging mutation or Production mutation is authorized merely by opening this Draft PR.
