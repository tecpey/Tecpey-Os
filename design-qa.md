# TecPey growth landing — exact-head QA checkpoint

final result: pass for PR visual/runtime review; staging live-data verification remains a release follow-up

## Evidence and state
- Source visual target: `/workspace/scratch/29e9238d00e2/generated_images/exec-daf18bf1-c433-4ecf-88fd-17973f183abb.png` (approved combined mountain journey concept).
- Implementation: shared `TecpeyGrowthStory` on `/` and `/en`, preserving the global TecPey shell and `TecpeyScrollMotionBackground`.
- Reviewed implementation head before this documentation-only checkpoint: `e27e24953e890ee531f6dc6193ee7e7afc6ee67e`.
- Exact-head checks on that implementation completed successfully: CI run `3554`, Public Browser Golden Path run `1764`, Full Suite Diagnostics run `2567`, Repository Audit Manifest run `1633`, API Security Manifest run `2683`, Sensitive Mutation Audit run `2549`, Full History Secret Scanning run `1684`, and AI Tenant RLS Runtime Evidence run `454`.
- Public Browser Golden Path artifact: `public-browser-report-e27e24953e890ee531f6dc6193ee7e7afc6ee67e`, digest `sha256:8484cf2bc35d29665117f8e0bae81ee8af43c8e09297d5548b5bc76ca4847993`.
- Visual evidence reviewed from the exact-head browser artifact:
  - Persian mobile: Chromium, `390x844`, light and dark.
  - Persian desktop: Firefox, `1440x900`, light and dark.
  - English desktop: Chromium, `1440x900`, light and dark.
  - English mobile: Firefox, `390x844`, light and dark.
- The reviewed captures show the mountain hero, primary learning CTA, journey CTA, FA RTL / EN LTR parity, light/dark hierarchy, responsive navigation, and fixed mobile navigation rendering correctly without horizontal overflow.
- The public browser suite also validates theme persistence, keyboard-operable navigation, healthy governed internal targets, primary CTA clearance from fixed controls, footer clearance, serious/critical WCAG checks, reduced-motion degradation, CSP evidence, and fatal browser-runtime errors.

## Findings
- P0: none found in the reviewed exact-head browser evidence.
- P1: none found in the reviewed exact-head browser evidence.
- [P2 / staging follow-up] Browser CI intentionally uses deterministic news/market responses and does not prove availability or visual quality of production-configured live feeds.
- [P2 / staging follow-up] Authenticated, consent-governed leaderboard population still requires a real staging account and configured service data. The anonymous/signed-out boundary and load-on-intent behavior are covered by code/browser contracts.
- [P2 / staging follow-up] The browser artifact captures the landing viewport in both themes while the Golden Path programmatically traverses major sections; a dedicated full-page visual archive can be captured during staging acceptance if needed for release records.

## Required fidelity surfaces reviewed
- Fonts/typography: FA and EN hero wrapping, hierarchy and contrast reviewed at mobile and desktop viewport sizes.
- Spacing/layout: responsive hero, chapter navigation, CTA grouping and persistent mobile navigation reviewed; automated overflow and fixed-control collision checks passed.
- Colors/tokens: light/dark captures reviewed against the existing TecPey theme system; the mountain artwork remains legible in both themes.
- Image quality: the generated mountain WebP renders sharply at the reviewed mobile and desktop sizes with an intentional crop and readable overlay caption.
- Copy/content: Academy terms, Term 8 growth path, source-backed news/market positioning, virtual Arena boundary, league/reward status and development-stage exchange wording remain explicit and non-deceptive.

## Intentional adaptations to current project
- Existing global header, footer and `TecpeyScrollMotionBackground` remain authoritative in both themes.
- No fabricated prices, articles, ranks or gauge values substitute for unavailable services.
- No public anonymous league exists; rankings load on intent through the existing authenticated, consent-governed endpoint.
- Cash payouts, noncash automatic rewards and one-month Pro grants are not activated by this UI.
- Existing market authority does not provide global dominance, RSI, altseason or fear/greed indicators; availability is stated explicitly.
- The landing introduces the TecPey Exchange as a product in development and provides no real-exchange execution CTA.

## Comparison history
1. Initial local/Cloud-browser review was blocked by preview URL policy; no bypass was attempted.
2. Exact-head GitHub browser evidence then provided governed cross-browser captures for FA/EN, mobile/desktop and light/dark plus runtime/accessibility checks.
3. Manual review of those captures found no blocking visual defect in the landing hero or responsive shell. Remaining live-data and authenticated-population checks are staging acceptance work rather than justification for fabricated local data.

## Staging acceptance checklist
1. Verify configured live news translation/source attribution, market provenance/freshness and outage/staleness states on `tecp.ir`.
2. Verify authenticated monthly/all-time league data with a staging account and consent settings.
3. Inspect the complete landing scroll in FA/EN, light/dark on representative mobile and desktop browsers, including motion and reduced-motion behavior.
4. Recheck console/CSP/network errors against staging integrations and record any P0/P1/P2 defects before promotion.
5. Keep real exchange execution, automatic reward grants and any unsupported global indicator values gated until their separate authorities are complete.
