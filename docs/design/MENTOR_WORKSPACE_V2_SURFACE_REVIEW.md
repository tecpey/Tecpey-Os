# Mentor Workspace v2 — conversation-first surface slice

PR: #703. This is a partial implementation, not a completed acceptance claim.

## Design decision

Persian-first learning workspace. Retain the official blue/cyan identity and the
existing mentor assets. Make conversation primary, with a one-third office on
desktop and an explicitly expandable office on compact screens. Do not imply
new intelligence, verified achievements, Rive activation or Pro entitlement.

| Before | After | Why |
| --- | --- | --- |
| Permanent history rail consumes conversation width | History available from every screen size in a native modal | More room for readable conversation; browser-owned modal focus/inertness |
| Office occupies 340–390px before mobile chat | Compact presence with an explicit office disclosure | Reach the learning task without first scrolling past scenery |
| Empty state only asks a generic question | Three localized educational draft starters | Explain useful tasks without automatically calling a model |
| Small message/support text | Larger message typography and visible privacy/support links | Improve reading and make controls discoverable |
| Research mode is not visible in the composer | Active mode plus query-only egress notice | Show what context a submitted query will use |

## Research applied

- W3C APG modal dialog pattern: initial focus, contained tab order, Escape,
  labelled dialog and focus restoration:
  https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- Native dialog behavior (W3C H102):
  https://www.w3.org/WAI/WCAG21/Techniques/html/H102
- WCAG 2.2 target size: 24 CSS px minimum subject to exceptions; this slice
  prefers 44px controls, without claiming that target size alone proves AA:
  https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- Reflow at 320 CSS px is a required browser acceptance check:
  https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- Reduced-motion preferences:
  https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html

## Verification boundaries

Local checks passed: `tsc --noEmit`, targeted ESLint, frontend style authority,
`git diff --check`, and 21 tests across workspace policy, workspace surface,
stage direction and Academy workspace recovery. These do not replace CI.

Source-contract tests are not interaction tests. The isolated fixture compiled,
but the cloud browser blocked localhost and local-file previews. No screenshot,
mobile keyboard, focus-loop, Safari, contrast or full application browser pass
is claimed. Fixture mocks are outside the repository and are not shipped.

## Still required before Ready

- FA/EN desktop and 320/390px browser inspection, keyboard, Escape/focus return,
  office disclosure, mobile keyboard/bottom-nav and reduced-motion tests.
- Light-theme inspection; current surface intentionally retains the existing
  dark workspace treatment pending visual validation.
- #702 signed Rive v2 asset/runtime acceptance; current renderer stays unchanged.
- #699/#701 integration for Pro, Council and advanced research authorities.
- Governed achievements/freshness and complete action/degraded-state coverage.
- Mini-Arena modal interaction and English execution parity verification.
- Exact-head CI, independent review, zero unresolved findings and explicit
  release authorization. No merge or environment mutation in this slice.
