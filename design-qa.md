# TecPey growth landing — draft QA checkpoint

final result: blocked

## Evidence and state
- Source visual target: `/workspace/scratch/29e9238d00e2/generated_images/exec-daf18bf1-c433-4ecf-88fd-17973f183abb.png` (approved combined mountain journey concept).
- Implementation: shared `TecpeyGrowthStory` on `/` and `/en`.
- Implementation screenshot: unavailable. The Cloud browser first returned connection refused; after the development server restarted, it explicitly rejected the preview under its URL security policy. No alternate browser surface or policy workaround was attempted.
- Viewport, implementation pixel size and device density: not captured.
- Intended states: mobile and desktop, FA/EN, light/dark, news/market loading, empty, error and populated states, private league signed-out and signed-in states.
- Full-view and focused region comparisons: blocked; no visual pass asserted.
- Browser interactions and console verification: not completed.

## Findings
- [P1] Visual acceptance is incomplete. Compare the approved target with same-state desktop and mobile captures before removing draft status.
- [P1] Populated live news/market and authenticated leaderboard UI require runtime verification against configured services. Tests of data transformation do not establish feed availability.

## Required fidelity surfaces
- Fonts/typography: existing project fonts retained; wrapping, contrast and visual hierarchy require capture.
- Spacing/layout: responsive CSS and constrained columns implemented; mobile overflow and persistent navigation require capture.
- Colors/tokens: existing theme tokens and translucent motion surfaces retained; light/dark readability requires capture.
- Image quality: generated mountain WebP used as an asset; actual crop and sharpness require capture.
- Copy/content: Academy term topics matched to `academyPath.ts` and `academyPathEn.ts`; source-backed data, planned Pro/rewards, virtual Arena and development-stage exchange boundaries preserved. Visual text density remains unreviewed.

## Intentional adaptations to current project
- Existing global header, footer and `TecpeyScrollMotionBackground` remain authoritative in both themes.
- No fabricated prices, articles, ranks or gauge values substitute for unavailable services.
- No public anonymous league exists; rankings load on intent through the existing authenticated, consent-governed endpoint.
- Cash payouts, noncash automatic rewards and one-month Pro grants are not activated by this UI.
- Existing market authority does not provide global dominance, RSI, altseason or fear/greed indicators; availability is stated explicitly.

## Comparison history
No visual comparison was possible. Code checks are not counted as design-QA iterations.

## Implementation checklist
1. Restore an authorized browser preview connection.
2. Capture and compare FA/EN at mobile and desktop sizes in both themes.
3. Verify motion visibility, reduced-motion behavior, keyboard access, filters, market links, news attribution, league loading/closing and authentication boundaries.
4. Verify populated services and outage/staleness states; inspect browser console.
5. Fix any P0/P1/P2 findings, recapture, and update this report before approval.
