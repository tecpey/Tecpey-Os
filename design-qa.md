# TecPey landing redesign QA

## Evidence

- Approved sources: `/workspace/scratch/29e9238d00e2/upload/BE520287-5ACD-46D4-ADB6-95BA3508D050.jpeg` and the reattached `/workspace/scratch/29e9238d00e2/upload/BE520287-5ACD-46D4-ADB6-95BA3508D050(1).jpeg`.
- Product defect reference: `/workspace/scratch/29e9238d00e2/upload/IMG_5669.jpeg`
- Implemented routes: `/` and `/en` through the shared `TecpeyGrowthStory` composition.
- Source asset retained at original quality: `/public/images/landing/growth-mountain.webp`.
- Production build: passed with the repository's pre-existing missing local `DATABASE_URL` notices and avatar-storage tracing warnings.
- Static, locale-parity, product-boundary, market-containment and public UI authority checks: passed.
- Focused landing and premium-interaction suite: passed (19 tests across content boundaries, governed data, market containment, carousel accessibility and motion-safe icon behavior).

## Previous merged baseline evidence

- PR #642's reviewed implementation head `e27e24953e890ee531f6dc6193ee7e7afc6ee67e` passed its exact-head CI and Public Browser Golden Path.
- Its browser artifact covered Persian and English at `390x844` and `1440x900` in light and dark themes, including responsive navigation, fixed-control clearance, keyboard navigation, reduced-motion degradation and serious/critical accessibility checks.
- That evidence validates the merged mountain-journey baseline only. It does not validate the new carousel, richer market cards or current motion changes, so it is not reused as visual approval for this iteration.

## Implemented fidelity corrections

- [P0 fixed] Removed `story-exchange`, step `09`, and every exchange sign-in or execution CTA.
- [P0 fixed] Restored the skills portfolio as the journey destination after Term 8.
- [P1 fixed] Rebuilt the mountain as the hero scene instead of an isolated image card.
- [P1 fixed] Added visible route milestones on the mountain while keeping the approved source image intact.
- [P1 fixed] Made the narrative an explicit eight-stage growth path: news, market, Academy, Arena and journal, League, the one-month Pro gift, Term 8 and the skills portfolio. The exchange notice is deliberately unnumbered and outside this path.
- [P1 fixed] Replaced generic repeated cards with editorial news, a dense live-data market surface, connected Academy stages, a Trading Arena review flow, League and reward composition, the Pro gift, Term 8 and portfolio close.
- [P1 fixed] Replaced letter placeholders in the live quote cards with the governed branded crypto-asset icons already used by the product.
- [P1 fixed] Increased heatmap legibility with magnitude-aware green/red/neutral data colors and high-contrast labels while retaining a non-visual list alternative.
- [P1 fixed] Added sourced market breadth, average change, displayed-asset Bitcoin share and coverage calculations without fabricating unavailable indicators.
- [P1 fixed] Added displayed-dataset market-cap and 24-hour-volume totals, per-asset rank, 24-hour high/low and source timestamp only when those fields pass finite-value and range-coherence checks.
- [P1 fixed] Added a text-labelled five-state heatmap legend so magnitude and direction are not communicated by colour alone.
- [P1 fixed] Distinguished displayed-dataset Bitcoin share from true whole-market dominance, and kept RSI, altseason and fear-and-greed explicitly unavailable until governed sources and methods exist.
- [P1 fixed] Exposed real Academy evidence mechanics—term assessments, smart review, daily practice and verifiable certificates—instead of relying on broad marketing claims.
- [P1 fixed] Added mobile-specific hero composition, two-column market indicators, two-column curriculum, compact heatmap, bottom-navigation clearance and stacked conversion controls.
- [P2 fixed] Kept explanatory mountain motion, moved the route halo animation to GPU-friendly opacity/transform properties, and added 160 ms press feedback with reduced-motion and reduced-transparency fallbacks.
- [P2 fixed] Preserved the existing moving TecPey background in light and dark modes by using translucent story surfaces.
- [P2 fixed] Replaced the previous outer-neon icon treatment with a shared TecPey premium icon material, standardized Lucide stroke weight and semantic brand/success/warning/danger/neutral tones.
- [P2 fixed] Upgraded the shared theme control, desktop navigation controls and global mobile navigation with 44px targets, direct press feedback and one consistent icon language.
- [P2 fixed] Rebuilt the mobile active-route marker as a restrained cyan material tile with an interruptible directional transition while retaining the active marker under reduced motion.
- [P2 fixed] Added purposeful landing microinteractions for news media, market tiles, curriculum links, disclosure chevrons and refresh state without animating market values themselves.
- [P2 fixed] Motion review reduced the generic reveal to 240ms, normalized press feedback to `scale(.97)`, shortened news-image response to 240ms and kept new transitions on transform/opacity only.
- [P2 fixed] Rebuilt news as a seven-item centred scroll-snap rail: the current story is complete, adjacent stories remain partially visible, and users can navigate by swipe/drag, previous/next controls, keyboard arrows or position dots.
- [P2 fixed] Added deterministic TecPey-owned editorial topic thumbnails to every story, with an explicit editorial-image label so the UI never implies publisher image rights.
- [P2 fixed] Kept carousel motion interruptible and bounded to 220–260ms transform/opacity transitions, disabled hover-only effects on touch devices and supplied a reduced-motion path. Autoplay is intentionally absent to preserve reading control.

## Content and state review

- News preserves canonical article links, source attribution, publication time, category, learning impact, related lesson and refresh/error/empty states.
- Market preserves freshness filtering, source/quote currency provenance, heatmap/list modes, metric selection, Bitcoin exclusion and no-estimate behavior.
- League preserves consent-governed private rankings, monthly/all-time selection, signed-out/error/empty states and explicitly non-entitled planned rewards.
- Arena remains virtual and makes no real-money or profit claim.
- The one-month Pro gift remains planned, eligibility-qualified and independent of League rank.
- The exchange appears only as a non-interactive future-product notice outside the educational path.

## Visual comparison status

The Next application reached a healthy local ready state, but the cloud browser returned `ERR_CONNECTION_REFUSED` for `terminal.local:4173`. The production checks can still validate source, types, tests and build output, but no implementation screenshot could be captured. Therefore same-viewport desktop/mobile and light/dark comparison, browser interaction checks, motion feel and browser-console inspection remain blocked. No visual-pass claim is made.

## Remaining acceptance pass

1. Capture Persian and English desktop views at the approved reference width.
2. Capture mobile views near the supplied iPhone screenshot width in both themes.
3. Inspect hero crop, RTL wrapping, sticky chapter navigation, heatmap controls and fixed bottom navigation.
4. Exercise news swipe, arrows, keyboard and dots; then test links, market map/list, metric selector, Bitcoin exclusion, League loading and theme switching.
5. Inspect the browser console, fix any P0/P1/P2 findings and recapture.

final result: blocked
