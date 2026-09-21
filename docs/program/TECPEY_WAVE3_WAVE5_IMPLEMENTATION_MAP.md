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


## Verified research basis — 2026-09-21

The implementation contracts are not based on visual trend-following or vendor marketing alone. The following current primary/authoritative references were checked before defining the program:

- **Apple Human Interface Guidelines / Materials:** Liquid Glass is a functional layer for controls and navigation above content; Apple explicitly advises against using Liquid Glass throughout the content layer and recommends sparing use.  
  https://developer.apple.com/design/human-interface-guidelines/materials
- **Apple Liquid Glass technology overview:** prioritize important content, adaptable layouts, standard iconography and predictable action placement.  
  https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass
- **WCAG 2.2 – Target Size (Minimum):** 24×24 CSS px minimum or sufficient spacing; TecPey intentionally adopts a stricter 44px preferred target for primary/mobile actions.  
  https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
- **WCAG 2.2 – Focus Appearance / Focus Not Obscured:** visible, sufficiently contrasted keyboard focus and sticky-layer behavior that never hides focused controls.  
  https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance
- **Rive Data Binding / View Models:** use a ViewModel contract between runtime data and animation/UI, keeping model data separate from presentation wiring.  
  https://rive.app/docs/runtimes/data-binding
- **OpenAI web search / Responses tools:** web retrieval is a tool capability and citation/freshness should remain explicit product metadata rather than becoming implicit prose.  
  https://developers.openai.com/api/docs/guides/tools-web-search
- **Anthropic web search:** source citations, domain controls and dynamic filtering reinforce the provider-neutral research contract used in #700.  
  https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
- **xAI Web Search / X Search:** web and X are distinct retrieval surfaces; TecPey therefore models social narrative as a separate evidence channel rather than treating it as market truth.  
  https://docs.x.ai/developers/tools/web-search  
  https://docs.x.ai/developers/tools/x-search
- **Learning science:** retrieval practice and spaced relearning improve durable retention; optimal schedules are context-dependent rather than universally “one SM-2 formula.” Relevant evidence includes Karpicke & Roediger and Cepeda et al.  
  https://pubmed.ncbi.nlm.nih.gov/17576148/  
  https://pubmed.ncbi.nlm.nih.gov/19439395/  
  https://pubmed.ncbi.nlm.nih.gov/21707204/  
  https://pubmed.ncbi.nlm.nih.gov/35436145/

### Architectural implications

1. **No design-by-glass:** glass is not a content-card default. Content surfaces prefer solid/standard materials, with translucency reserved for navigation, controls and transient overlays.
2. **No provider-shaped architecture:** OpenAI/Anthropic/xAI capabilities map into TecPey-owned contracts for research, citations, search channels and freshness.
3. **No LLM-owned character state:** Rive receives a host-owned semantic ViewModel; text generation never directly chooses animation or safety state.
4. **No universal spaced-repetition superstition:** Academy stores evidence and scheduling rationale so spacing/retrieval policy can evolve without corrupting historical learning state.
5. **No citation theater:** research reports bind claims to source objects and surface missing/conflicting evidence instead of merely adding a bibliography.
6. **No accessibility afterthought:** focus, target size, reduced motion/transparency and sticky-layer behavior are acceptance criteria, not final-polish tasks.

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

## Live PR graph

| Track | PR | Dependency |
| --- | --- | --- |
| 00 Program Map | #696 | coordination root |
| 01 Release & Staging Automation | #697 | #696 |
| 02 Identity / Auth / KYC | #698 | #696 |
| 03 Pro Commerce Authority | #699 | #698 |
| 04 Deep Research Workspace | #700 | #699 + existing AI control plane |
| 05 AI Model Lab & Council | #701 | #700 + #699 |
| 06 Mentor Rive v2 Contract | #702 | #696 |
| 07 Mentor Workspace v2 | #703 | #702 + #701 + #699 |
| 08 Academy Infinite Growth | #704 | existing Academy/Mentor evidence |
| 09 Arena & League v2 | #705 | existing Arena authority + #699 for paid entitlement |
| 10 Living Profile Wave 3 | #706 | #698 + #704 + #705; #699 enriches Pro state |
| 11 Notification Orchestrator v2 | #707 | durable events from #700/#704/#705/#706 |
| 12 Global Experience & Launch Gate | #708 | final integration across #697–#707 |

### Critical path

**Release safety:** #697 can progress independently and should be landed before broad staging cycles.

**Identity → monetization → research intelligence:** #698 → #699 → #700 → #701.

**Mentor motion/workspace:** #702 can progress in parallel, then #703 consumes #702 plus #701/#699.

**Learning/competition → profile:** #704 and #705 can progress in parallel; #706 consumes their governed evidence.

**Engagement → launch:** #707 consumes durable events; #708 is the cross-product launch gate after upstream behavior stabilizes.

### Parallelism rules

- #697, #698, #702, #704 and #705 are the safest first parallel implementation set.
- #699 must not merge before #698's session/identity boundaries are compatible.
- #700/#701 may implement fail-closed scaffolding before #699, but premium execution cannot become live.
- #703 must not invent Rive states while #702 is unfinished.
- #706 may render explicit “authority unavailable” placeholders before #704/#705 land, but cannot fabricate journey/rank evidence.
- #708 never becomes a dumping ground for unfinished product logic; it is for integration hardening, not feature completion.

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
