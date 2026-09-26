# Experience: global FA/EN mobile accessibility + launch gate

**Base main:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** Final integration track after feature PRs stabilize; non-conflicting safety/accessibility fixes may land incrementally.

## Global quality bar

- Authority-sensitive state is server-owned, tenant-bound and fail-closed; clients cannot create entitlement, identity, mastery, rank or safety truth.
- No fabricated intelligence without named authority + provenance/freshness.
- Content-first design; glass only for navigation/controls/light overlays; no glass-on-glass.
- WCAG 2.2 AA minimum, 44px preferred primary targets, visible focus, no focus obscuration, reduced-motion/transparency-safe behavior.
- FA/EN parity, RTL/LTR correctness, logical CSS and bidi isolation.
- Schema validation, CSRF/rate limits, session/tenant checks, idempotency/replay defense, audit logs and negative tests.
- Structured logs, explicit degraded states, authority reason codes and freshness timestamps.
- TypeScript, ESLint, unit/integration/security/browser tests, repository audit and exact-head CI.
- Immutable exact-SHA staging-first release with rollback proof; Production requires separate explicit approval.


## Objective
Perform the final cross-product quality pass so TecPey behaves as one coherent system across FA/EN, mobile/desktop and normal/degraded states.

## Surfaces
Landing, Login/Register, Academy, Living Profile, Account/KYC/Pro, Mentor Workspace, Market/Research Intelligence, Arena/League, Notifications, News/Markets and core navigation.

## Research-derived experience gates

Primary references:
- Apple Liquid Glass overview: https://developer.apple.com/documentation/technologyoverviews/liquid-glass
- WCAG 2.2: https://www.w3.org/TR/wcag/
- WCAG 2.2 focus appearance: https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance

Implementation consequences:
- translucent/glass styling establishes hierarchy around navigation/controls; it is not a default content-card material;
- primary product content remains readable when transparency/reduced-transparency preferences remove visual effects;
- WCAG 2.5.8's 24×24 CSS px minimum/spacing rule is the compliance floor; TecPey uses 44px preferred primary mobile targets;
- any drag/swipe interaction has a single-pointer non-drag alternative (WCAG 2.5.7), including news carousels and chart controls;
- sticky headers/bottom bars are tested against focus-not-obscured behavior at mobile keyboard and browser zoom states;
- focus appearance is measured in browser tests; glow/shadow alone is not treated as a reliable focus indicator;
- reduced motion preserves semantic state and task completion, not merely “slower animation”;
- visual regression captures normal, loading, empty, error, degraded, locked, offline and reduced-motion states where applicable.

## Design acceptance
- Content hierarchy first; Liquid Glass-like treatment limited to functional navigation/control layer.
- Shared spacing/radius/type/icon/action-placement tokens.
- Mobile is reprioritized, never merely scaled desktop.
- Bottom/sticky UI never obscures focus or important CTAs.
- 44px preferred primary targets and WCAG 2.2 AA minimum.
- Reduced motion/transparency support.
- Designed loading/skeleton/error/empty/degraded/locked/guest/offline states.
- FA/EN semantic parity and bidi safety; no untranslated system errors.
- Safari PWA offline/update/cache/safe-area behavior.
- Performance budgets for LCP/INP/CLS, JS/bundle growth and Rive runtime/assets.
- Visual regression matrix across representative mobile/desktop widths and light/dark modes.
- Automated + manual accessibility checks: landmarks, headings, labels, focus, popup ownership, contrast, motion, keyboard and screen-reader announcements.
- Analytics exclude sensitive Mentor/KYC payloads.

## Machine-readable launch gate
Aggregate exact-head CI, browser evidence, migrations, security manifests, accessibility, performance, staging health and open blocker count into a verifiable release-readiness report. Production remains a separate explicit decision.

## Acceptance
No P0/P1 defect, no known broken FA/EN route, exact-head staging smoke green, current rollback evidence, independently verifiable launch report.

## Delivery discipline
This Draft PR begins as an implementation contract. Code, migrations, tests and evidence are added to this same branch. It cannot become Ready until each acceptance item is implemented or explicitly split into a named follow-up PR.

## Release boundary
Opening this PR authorizes no merge, Staging mutation or Production mutation.
