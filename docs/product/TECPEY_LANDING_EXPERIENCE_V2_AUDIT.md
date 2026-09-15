# TecPey Landing Experience V2 — Exact-Baseline Audit

Status: execution authority
Baseline branch: `codex/landing-experience-v2`
Baseline commit: `f6baee88550eddb2168548382c9fd5231291cc17`
Parent main: `c4751708ae6c1d2f2877ed64e7de36e5b963a045`
News workstream: isolated; PR #643 semantics are out of scope

## Executive finding

The candidate is materially stronger than the merged landing, but it is not yet a visual-authority pass. Its strengths are a coherent 8-stage product journey, stronger premium interaction foundation, richer newsroom/market presentation, real data containment and accessibility fallbacks. Its remaining risk is that visual ambition is still implemented as local presentation rules rather than a fully validated, device-tested system.

The release decision is therefore **preserve architecture, harden composition, prove visually** — not rewrite the data layer and not polish blindly.

## What is worth preserving

1. One FA/EN semantic composition instead of duplicated landing trees.
2. Exact eight-stage growth path; no stage 9 and no exchange CTA inside the journey.
3. Full-bleed mountain Hero direction with product-route milestones.
4. Seven-item News carousel with explicit buttons, keyboard support and no autoplay.
5. Governed market data only; invalid/unknown values are withheld rather than invented.
6. Heatmap/list equivalence and explicit provenance.
7. Shared premium icon/interaction foundation, 44px-class touch targets and reduced-motion handling.
8. Academy → Mentor → Arena/Journal → League → Term 8 → skills-record narrative.

## P0/P1 gates before Ready

### P0 — workstream isolation

- Do not change Full-Evidence Capture, hydration, materialization, `newsUrl`, translation/enrichment retries, IndexNow semantics or Enrichment activation.
- Do not modify News timers, providers, server state or production state.
- If Landing needs a field not already exposed by the governed public News contract, coordinate rather than widening the contract in this workstream.

### P0 — product truth

- No fabricated indicators, sentiment, RSI, rewards, balances, source media or live status.
- Exchange remains outside the growth path and clearly future/gated.
- Arena remains explicitly virtual/no-real-money.
- Reward states remain distinguishable: planned, eligible, awarded, paid.

### P1 — visual composition

- Hero must remain content-first: UI chrome and route markers may not compete with the headline or primary CTA.
- Route markers must align to the visible mountain composition at desktop and mobile crops; decorative floating labels without visual anchoring fail.
- Newsroom must show one focal story plus contextual adjacency without making drag the only usable interaction.
- Market must read as one cockpit hierarchy rather than independent cards plus controls plus heatmap.
- Academy must read as progression, not a link directory.
- Mentor/Arena/Journal must show the practice/reflection loop as one product system.
- League/Term 8 must read as evidence-driven progression, not reward marketing.

### P1 — mobile / safe area

Acceptance widths: 320, 360/375, 390/393, 430 CSS px.

At every width:
- no overlap between fixed bottom navigation and market controls, heatmap, captions, CTA or carousel pagination;
- sticky chapter navigation must not obscure keyboard focus;
- page must not horizontally scroll;
- hero text must remain readable without depending on image contrast alone;
- adjacent carousel cards may peek, but the selected card must retain a clear focal width;
- all core actions remain usable without drag;
- `env(safe-area-inset-bottom)` is respected where fixed UI is present.

### P1 — desktop / large screen

Acceptance widths: 768, 1024, 1280, 1440+ CSS px.

- Content measure and visual hierarchy must not become sparse at wide widths.
- Hero route must not drift away from mountain landmarks.
- Section rhythm must be intentional; large empty gaps count as defects.
- News carousel focal width must not become an oversized modal-like block.
- Market cockpit must preserve at-a-glance hierarchy before controls/detail disclosure.

## Interaction authority

- Common press/disclosure feedback: 140–240ms unless a state transition requires more.
- Press scale is allowed only when it does not move surrounding layout.
- Financial values must not animate in a way that implies urgency or change that did not occur.
- Gesture support supplements buttons/keyboard; it never replaces them.
- Reduced motion disables non-essential breathing/halo/scale transitions while preserving state clarity.
- Reduced transparency/fallback must preserve contrast if backdrop filtering is unavailable or disabled.

## Accessibility authority

Minimum release target: WCAG 2.2 AA.

Required:
- focus not obscured by sticky/fixed UI;
- visible focus indication with sufficient contrast;
- drag alternatives via single-pointer controls;
- target size/spacing compliance;
- semantic headings/landmarks and meaningful focus order;
- no color-only market meaning;
- FA/EN directionality must use native logical layout, not visual mirroring hacks.

## Performance authority

- Hero media is the primary LCP candidate and must be intentionally sized/prioritized.
- No avoidable layout shift from image/card/nav dimensions.
- Avoid continuous JS animation loops for decoration.
- Noncritical previews/media load lazily.
- Before Ready, record lab/field evidence where available for LCP, INP and CLS; visual richness is not allowed to regress interaction responsiveness.

## First implementation batch

The first code batch is intentionally narrow and must not touch News semantics:

1. **Hero hierarchy hardening** — route-marker anchoring, mobile crop/readability, content priority and motion fallback.
2. **Journey/sticky-nav hardening** — focus visibility, scroll margins, small-screen overflow and reduced-transparency fallback.
3. **Mobile bottom-safe spacing contract** — reserve safe interaction space so fixed global navigation cannot cover Landing controls/content.
4. **Visual evidence hooks** — deterministic attributes/states for browser screenshots and regression assertions.

Newsroom data mapping, News API behavior, market data authority and PR #643 files are excluded from Batch 1.

## Evidence matrix before Ready

Each of the following must be captured on the exact candidate head:

- FA desktop light
- FA desktop dark
- EN desktop light
- EN desktop dark
- FA mobile light
- FA mobile dark
- EN mobile light
- EN mobile dark
- reduced-motion mobile
- reduced-motion desktop

Critical visual checkpoints per capture:
Hero, route, chapter navigation, News focal card, market cockpit/heatmap, Academy progression, Arena/Journal loop, League, Term 8, final skills CTA, fixed mobile navigation clearance.

## Decision rule

A change is accepted only when it improves comprehension, task success, hierarchy, trust, accessibility, responsiveness, performance or brand coherence without materially degrading another dimension.

A green build is necessary but never sufficient for visual acceptance.
