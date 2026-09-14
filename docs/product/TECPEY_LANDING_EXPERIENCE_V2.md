# TecPey Landing Experience V2 — Product & Design Authority

Status: design authority draft
Baseline candidate: `f6baee88550eddb2168548382c9fd5231291cc17`
Baseline main: `c4751708ae6c1d2f2877ed64e7de36e5b963a045`
Scope: public landing presentation layer only
Out of scope: News pipeline behavior, provider/enrichment activation, production deployment, financial activation, exchange execution

## Product thesis

The landing must communicate one coherent journey rather than a stack of feature sections:

**Understand → Learn → Practice → Reflect → Prove → Grow**

TecPey is presented as an education-first digital financial learning and practice operating system. The page must make product capability and product boundaries equally clear.

## Non-negotiable principles

1. **Journey over card-wall.** The mountain and progression spine are navigation and meaning, not decoration.
2. **Evidence over claims.** News, market, Academy, Arena, League and skills surfaces only show data or states supported by current authorities.
3. **Mobile is a first-class composition.** It is not a scaled desktop layout. Safe areas, fixed navigation, thumb reach, content order and density are designed independently.
4. **FA/EN parity by construction.** One semantic composition with correct RTL/LTR behavior and no Persian leakage into English.
5. **Motion communicates state.** Motion must not decorate changing financial numbers or create false urgency. All meaningful interaction remains available with reduced motion.
6. **Accessibility is a release gate.** Keyboard, focus visibility, target size, drag alternatives, contrast, semantic landmarks and reduced-motion behavior are mandatory.
7. **Performance is part of design.** Visual ambition must remain compatible with strong LCP/INP/CLS behavior and responsive image delivery.
8. **No exchange in the growth path.** No stage 9 and no exchange-entry CTA in the learning journey. A future exchange teaser may exist only as a separate, clearly gated surface.
9. **No News ownership overlap.** This work may consume governed News outputs but must not alter capture, hydration, materialization, translation, publication, IndexNow or Enrichment authority owned by the News workstream.

## Experience architecture

### 1. Hero — the mountain as the product map

- Full-width mountain composition, not a decorative card.
- Visible route spine with meaningful milestones that correspond to the actual product journey.
- Primary CTA: free Academy entry.
- Secondary CTA: explore the journey.
- Supporting proof points remain concise and subordinate to the hero narrative.
- No exchange CTA.
- Desktop and mobile use separately tuned crops and content placement.

### 2. Newsroom — context before action

- One focal story plus visible adjacent stories; horizontal movement is optional, never mandatory.
- Swipe/drag must have equivalent arrows/buttons and keyboard operation.
- No autoplay carousel.
- Story metadata hierarchy: title → concise context → source → publication time → category/learning relation.
- Thumbnail usage must follow governed rights/fallback authority. The landing must not invent or proxy ungoverned media.
- Pending/unpublishable News items remain invisible to this presentation layer.

### 3. Market cockpit — evidence, not decoration

- Market state should read as a compact cockpit, not four unrelated cards.
- Price, 24h change, source/time and quote basis stay visible.
- Heatmap must preserve a text/list equivalent.
- Indicators must be derived from displayed/authorized data; no fabricated RSI/sentiment/gauge values.
- Microcharts/sparklines are allowed only when sourced and performance-safe.

### 4. Academy — visible progression

- Seven-term curriculum is represented as a progression path with clear state and destination.
- Mentor is embedded as a companion to learning, not a detached marketing card.
- Assessments, review, daily challenge and certificate evidence are presented as proof of learning architecture.
- Term 8 is not mixed into the core seven-term curriculum; it is the growth/mastery chapter after demonstrated practice.

### 5. Arena & journal — preview the real practice loop

- Show a real product preview or faithful product fragment, not a generic explanatory card.
- Reinforce virtual capital / no-real-money boundary.
- Demonstrate the loop: decision → execution practice → journal → mentor reflection.

### 6. League & rewards — evidence before reward

- Rankings are shown only where governed data and consent rules allow them.
- Monthly / overall context and the user’s own rank are prioritized over decorative leaderboard volume.
- Reward states must distinguish planned, eligible, awarded and paid. No planned reward may look like an awarded balance.

### 7. Term 8 / mastery — the narrative climax

- Present ongoing mastery as the consequence of accumulated evidence, not a generic feature section.
- Personal growth plan, replay, mentor review and verified work samples form the chapter structure.
- A Pro benefit may be mentioned only with explicit eligibility/activation boundaries.

### 8. Skills portfolio — the destination

- Final destination of the journey is the user’s skills portfolio / verifiable record, not the exchange.
- Closing CTA returns to Academy/account progression.

## Shared UI foundation

- Common icon system based on Lucide plus authentic asset/coin marks where appropriate.
- Semantic icon container states instead of inconsistent neon treatments.
- Interaction feedback target: approximately 140–240 ms for common press/disclosure state transitions.
- `scale(.97)`-style press feedback may be used where it does not destabilize layout.
- Motion background stays subordinate to foreground content in light and dark themes.
- Support both `prefers-reduced-motion` and reduced-transparency/fallback presentation.
- Pointer/touch targets should target 44×44 CSS px where practical; never violate WCAG 2.2 minimum target-size requirements.
- Focus must remain visible and must not be obscured by sticky/fixed chrome.

## Responsive authority

Required acceptance widths include at minimum:
- 320 px
- 360/375 px
- 390/393 px
- 430 px
- 768 px
- 1024 px
- 1280 px
- 1440+ px

Mobile acceptance additionally requires:
- safe-area-aware fixed bottom navigation;
- no overlap between bottom navigation and controls/captions/heatmap content;
- no hidden labels behind fixed chrome;
- no horizontal page scroll;
- touch controls reachable without precision tapping;
- carousels usable without dragging;
- content order remains meaningful with CSS disabled or motion removed.

## Accessibility release gate

Target: WCAG 2.2 AA as the minimum product gate, while adopting selected stronger criteria where practical.

Required checks:
- Focus not obscured by sticky/fixed UI.
- Clear focus appearance.
- Dragging interactions have single-pointer alternatives.
- Controls meet target-size/spacing expectations.
- No unavoidable interaction-triggered motion.
- Moving/scrolling content can be paused/stopped where applicable.
- Landmarks/headings/labels preserve meaningful navigation.
- RTL/LTR semantics are native, not visually mirrored hacks.

## Performance release gate

- LCP hero image must be intentionally prioritized, correctly sized and responsive.
- No design change may introduce avoidable layout shift.
- Interactions should remain responsive under real device CPU constraints.
- Avoid heavy client-side animation loops for decorative effects.
- Lazy-load non-critical media and product previews.
- Capture field and lab evidence for LCP, INP and CLS before Ready.

## Visual evidence gate

A green build is not a visual pass.

Before Ready:
1. Capture exact-head browser evidence for FA and EN.
2. Capture mobile and desktop.
3. Capture light and dark.
4. Capture reduced-motion state.
5. Compare hero, newsroom, market cockpit, Academy path, Arena preview, League, mastery and bottom navigation against this authority.
6. Any P0/P1 visual regression blocks Ready.
7. Record accepted deviations and evidence links in `design-qa.md`.

## CI / engineering gate

At minimum:
- TypeScript green.
- ESLint green.
- production build green.
- existing public UI / design authority gates green.
- locale parity tests green.
- landing News carousel interaction/accessibility tests green.
- market containment/integrity tests green.
- reduced-motion tests green.
- no forbidden exchange CTA/stage 9 regression.
- exact-head workflow evidence recorded before merge consideration.

## Workstream isolation

Files or behavior owned by the active News workstream must not be modified without explicit coordination. In particular, Landing V2 must not change the semantics of:
- Full-Evidence Capture
- hydration
- materialization
- `newsUrl` / detail publication authority
- translation/enrichment retries
- IndexNow publication bookkeeping
- Enrichment activation/timers

If presentation work needs additional News fields, it must first prove that the required field already exists in the governed public contract or be coordinated separately with the News owner.

## Decision rule

A change is accepted only if it improves at least one of: comprehension, task success, hierarchy, trust, accessibility, responsiveness, performance or brand coherence — without materially degrading another.

Visual novelty alone is not sufficient evidence for acceptance.
