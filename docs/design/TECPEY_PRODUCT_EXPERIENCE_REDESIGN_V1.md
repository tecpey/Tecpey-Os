# TecPey Product Experience Redesign v1

Status: **Design and implementation authority for the redesign branch**  
Scope: Public web, Academy, Mentor, Trading Arena, market intelligence, auth/profile and trust surfaces  
Locales: **FA + EN parity is mandatory**  
Brand: Use only the governed TecPey brand assets and design tokens.

## 1. Product experience thesis

TecPey should not feel like a collection of crypto pages. It should feel like one learning operating system:

**Learn → Ask → Practice → Understand context → Review the decision → Grow**

The visible product hierarchy is:

1. **Academy** — structured learning and assessment.
2. **AI Mentor** — context-aware educational guidance.
3. **Trading Arena** — virtual-capital practice, risk controls and journaling.
4. **Market intelligence** — news, coins, reference prices and tools that add context.
5. **Trust layer** — security, methodology, transparency, risk disclosure and support.

Real-money exchange, custody, deposits and withdrawals remain launch-gated until their operational, compliance and security gates are complete. Public UX must never make an inactive capability look active.

## 2. Global information architecture

### Primary navigation

Keep the always-visible desktop navigation focused on the five highest-value destinations:

- Home
- Academy
- Trading Arena
- AI Mentor
- Markets

Use **Explore / کشف و یادگیری** for:

- News
- Coins
- Trader Tools
- Start Guide
- Security
- Glossary
- FAQ
- Exchange comparisons
- Fees
- Risk disclosure

Contact, corporate, legal and partnership destinations belong in contextual surfaces or the footer unless the current task requires them.

### Mobile navigation

The persistent mobile navigation is the primary app-like navigation surface. It must:

- preserve safe-area spacing;
- keep the current destination visually obvious;
- avoid horizontal scrolling for core destinations;
- use at least the governed minimum touch target;
- keep the centered Home behavior where the existing mobile system defines it;
- never compete with a second fixed CTA bar at the same screen edge.

## 3. Page hierarchy contract

Every major page must answer these questions in this order:

1. **Where am I?**
2. **What can I accomplish here?**
3. **What is my best next action?**
4. **What do I need to know before that action?**
5. **What evidence, status or risk changes my decision?**
6. **Where do I go next?**

### Above the fold

A page gets:

- one primary message;
- one primary CTA;
- at most one secondary CTA;
- one product/status visual when useful;
- no feature-wall grid above the fold.

### Progressive disclosure

Do not present the entire TecPey capability graph at once.

Use:

- summary → detail;
- current step → next step;
- primary task → supporting tools;
- current evidence → deeper methodology.

Do not hide the majority of a marketing page inside one generic disclosure control. Disclosure should reduce local complexity, not hide an unstructured page.

## 4. Visual language

### Keep

- official blue/cyan TecPey identity;
- governed light/dark tokens;
- strong readable typography;
- calm high-contrast surfaces;
- accessible focus states;
- meaningful product visuals;
- restrained glass where it communicates depth.

### Reduce

- repeated 28–36px rounded cards;
- identical card grids across every section;
- cyan border around every object;
- decorative gradients that do not communicate state;
- hover lift on every card;
- large dark panels used only for visual variety;
- badges and pills that do not encode meaningful status.

### Prefer

- editorial spacing;
- section dividers;
- lists and rows for comparable information;
- timeline/step structures for journeys;
- app-window previews for real product capability;
- data visualization only when the data is primary;
- clear empty/loading/degraded states.

## 5. Content design rules

### Start from the user task

Headings should describe the user's problem, outcome or decision—not an internal capability name.

Good:
- «قبل از سرمایه واقعی، دانش و مهارت واقعی بساز.»
- «قیمت را ببین؛ اما قبل از تصمیم، زمینه را بفهم.»

Avoid:
- implementation terminology;
- SEO/AEO/GEO claims in user-facing copy;
- internal evidence/governance vocabulary without explanation;
- generic “world-class”, “smart”, “advanced” claims without user value.

### Financial and crypto communication

Every market-facing surface must:

- distinguish education/reference data from financial advice;
- show risk with comparable prominence to benefits when a financial action is discussed;
- avoid return promises;
- avoid signal-like rankings unless ranking methodology and purpose are explicit and non-investment;
- never imply a coin/tool is a superior investment because it appears first;
- show source/freshness/context where news or market evidence matters.

### Exchange language

When the governed CTA **«ورود به صرافی»** is used, preserve the exact phrase.

When exchange functions are not active, copy must make the launch-gated state unambiguous.

## 6. Motion and interaction

Motion must explain state, hierarchy or continuity.

Allowed:
- short entrance transitions;
- selection/active-state motion;
- chart/data transitions;
- Mentor/Arena contextual transitions;
- subtle spatial continuity.

Avoid:
- constant decorative movement;
- multiple competing ambient animations;
- motion that delays reading or action.

All non-essential motion must respect reduced-motion preferences.

## 7. Accessibility baseline

Target WCAG 2.2 AA behavior across supported flows.

Mandatory:

- visible focus;
- logical keyboard order;
- no keyboard traps except correctly managed modal focus containment;
- minimum governed pointer/touch target size;
- semantic headings;
- explicit labels for icon-only controls;
- accessible dialog/menu states;
- status not conveyed by color alone;
- text/background contrast preserved in light and dark modes;
- critical controls not obscured by fixed navigation;
- RTL and LTR both tested.

A screenshot review cannot prove accessibility compliance; keyboard, semantic and automated checks remain required.

## 8. Performance baseline

Public pages must remain content-first.

Priorities:

- avoid adding client components when no interaction is required;
- avoid decorative above-the-fold media that dominates LCP without adding product understanding;
- stream independent authenticated navbar state rather than blocking public page delivery;
- lazy-load below-fold heavy visuals where possible;
- avoid duplicate data fetches;
- protect Core Web Vitals and mobile Safari/PWA behavior.

## 9. Route-family redesign map

### A. Home / landing

Primary job: explain TecPey in one connected story and start the right journey.

Target sequence:

1. Product-led hero
2. Compact discovery
3. Educational market snapshot
4. News context
5. Mentor preview
6. Learning journey
7. Context-first market radar
8. Connected product story
9. Clear close / next action

Do not restore the previous 20+ equal-weight section stack.

### B. Academy entry and curriculum

Primary job: always answer **“What should I do next?”**

Target model:

- resume/next action for known learners;
- “start here” for new learners;
- 7 foundation terms plus Term 8 continuous growth;
- assessment and mastery status attached to the relevant step;
- certificates as a result of progress, not a competing top-level CTA;
- Mentor and Arena as contextual tools inside the learning journey;
- Practice Lab connected to lessons and weaknesses.

Avoid presenting Roadmap, Mentor, Certificate, Engagement, Coach, Terms and Practice Lab as equally weighted independent products.

### C. Academy lesson / term pages

Primary job: learn one concept and prove understanding.

Required flow:

- lesson objective;
- concise learning content;
- example;
- risk/security note when relevant;
- one practice/checkpoint;
- explanation after answer;
- progress state;
- next lesson/term.

Term 8 should be adaptive and ongoing, based on governed learning evidence rather than a one-time static course.

### D. AI Mentor

Primary job: help the learner reason, not replace their judgment.

Desktop workspace:

- Mentor office/context area;
- chat/history;
- visible learning context;
- contextual Arena frame only when useful;
- source/freshness display for news/research;
- explicit capability and privacy boundaries.

Mentor actions should be tied to:
- a lesson;
- an observed misconception;
- a risk-management issue;
- a practice challenge;
- a sourced market event.

### E. Trading Arena

Primary job: practice a decision safely and review it.

Visual priority:

1. market/chart context;
2. risk state;
3. order/decision ticket;
4. position and portfolio impact;
5. Mentor guidance when evidence allows it;
6. journal and post-decision review.

Risk controls and authoritative degraded states must visually outrank gamification.

Leagues, rewards and rankings must not imply guaranteed financial outcomes.

### F. Markets

Primary job: inspect reference market data and move into research/learning.

Prefer:
- compact sortable market table/board;
- clear freshness/degraded state;
- search;
- link to coin research;
- learning-context CTA.

Avoid turning market movement alone into an action recommendation.

### G. Coins

Primary job: answer “What is this asset and what should I understand about it?”

Template:

- identity and current reference data;
- what it does;
- network/ecosystem;
- supply/token economics;
- major risks;
- official sources;
- recent sourced context;
- related Academy lesson;
- related Arena practice when appropriate.

### H. News

Primary job: answer “What happened, how reliable/fresh is it, and why might it matter?”

Required:
- source;
- publication time;
- update time where relevant;
- summary;
- context;
- affected concepts/assets;
- uncertainty;
- related learning path.

The Persian experience may summarize credible non-Persian sources; source identity must remain visible.

### I. Trader Tools

Primary job: help the user complete a specific analytical or risk-management task.

Tools should be categorized by task, not by an arbitrary popularity score.

Every tool needs:
- purpose;
- when to use it;
- limitations;
- official link;
- safety/privacy caveat where relevant;
- related lesson.

### J. Authentication / registration

Primary job: get the user into the correct identity domain with minimal doubt.

Keep:
- clear separation between Academy identity and launch-gated exchange account where applicable;
- Google + Apple provider slots when enabled by admin policy;
- accessible password/OTP alternatives for supported regions;
- explicit error and recovery states.

Avoid marketing clutter inside the form.

### K. Profile / account / KYC

Primary job: show identity completeness, security state and the next required action.

Use a status dashboard rather than a long settings form.

Group:
- identity;
- verification;
- security;
- preferences;
- sessions/devices;
- Academy identity/progress links.

### L. Security / transparency / risk / methodology

Primary job: establish verifiable trust.

Prefer:
- concrete controls;
- ownership/responsibility boundaries;
- incident/support paths;
- dated methodology;
- known limitations.

Avoid generic safety superlatives.

### M. About / company / partners / business / media

Primary job: communicate company purpose and the relevant relationship path.

These pages should reuse the public design system but should not mimic an Academy dashboard.

## 10. Component-system direction

Build and reuse a small set of semantic primitives:

- ProductHero
- SectionIntro
- PrimaryAction / SecondaryAction
- StatusChip
- EvidenceMeta
- JourneyRail
- FeatureRow
- DataTable / MarketRow
- WorkspacePreview
- RiskNotice
- EmptyState
- DegradedState
- NextAction
- SourceList

A primitive should represent a repeated **meaning**, not just a repeated rounded rectangle.

## 11. Locale parity

FA and EN must share:

- section order;
- capability availability;
- navigation hierarchy;
- CTA intent;
- risk meaning;
- degraded/loading behavior;
- accessibility behavior.

Localization may change sentence structure and density. It must not create a second product architecture.

## 12. QA gates for every redesigned surface

Before Ready-for-review:

- source/lint/type checks green;
- brand authority green;
- public UI authority green;
- FA/EN parity green;
- route integrity green;
- desktop light/dark visual QA;
- mobile light/dark visual QA;
- RTL and LTR visual QA;
- 320px narrow viewport check;
- iPhone Safari/PWA check for public and authenticated critical paths;
- keyboard flow check;
- reduced-motion check;
- no horizontal overflow;
- no fixed-control collision;
- loading/empty/error/degraded states reviewed;
- copy reviewed for risk clarity and unsupported claims;
- no real-money capability shown active while launch-gated.

## 13. Acceptance criteria for this redesign program

The redesign is complete only when:

- users can explain the TecPey product model after the landing page without reading a feature catalog;
- navigation exposes the core product without duplicating every destination;
- Academy always presents a clear next step;
- Mentor and Arena feel connected rather than separate experiments;
- market intelligence is contextual rather than signal-like;
- repeated card-wall layouts are replaced with task-appropriate structures;
- FA/EN behave as one product;
- mobile and RTL are first-class;
- accessibility and reduced motion are preserved;
- visual changes do not weaken security, tenant, data or launch governance;
- release state remains honest.

This document governs the redesign direction. It does not authorize merge, deploy or activation of launch-gated financial capabilities.
