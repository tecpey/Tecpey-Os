# TecPey Public UI Interaction Foundation

## Scope

This bounded recovery slice addresses confirmed public-surface defects from owner-provided localhost evidence. It is not the final TecPey landing redesign and it does not close the complete public UI/UX program tracked in issue #80.

## Corrected boundaries

- The Light/Dark control renders from `resolvedTheme`, communicates the active state and exposes an explicit Persian/English action.
- Visitors without an Academy profile see a real TecPey Mentor entry point and a locked educational value/onboarding state rather than no widget.
- Profile-ready users continue to use the existing personalized `GlobalAiMentorWidget`; the public entry hands off instead of creating a second personalized authority.
- Knowledge Center uses logical RTL/LTR alignment, a bounded visible panel, menu semantics, Escape dismissal, route-close behavior and a mobile accordion contract.
- Trading Arena and AI Mentor are discoverable from shared navigation and Footer paths.
- Footer content is visible without IntersectionObserver or animation success.
- Persian trust/registration content is Persian, and pending items explicitly avoid implying approval.

## Explicitly not complete

- Final world-class landing information architecture and visual redesign.
- A dedicated public Trading Arena landing section.
- Full English Trading Arena product parity; the temporary English route safely bridges to the authoritative current Arena while the English product surface is built.
- Real browser automation and visual-regression screenshots.
- Full public-route link crawler and responsive matrix.

These remain mandatory follow-up slices under #80.

## Quality gate

`npm run ui:public:check` prevents regression of the first interaction/visibility contracts. It supplements, but does not replace, browser-level interaction and screenshot evidence.
