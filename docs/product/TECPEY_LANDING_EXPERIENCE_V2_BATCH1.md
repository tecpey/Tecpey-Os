# TecPey Landing Experience V2 — Batch 1

Status: implementation candidate
Branch: `codex/landing-experience-v2`
Scope: Hero / journey spine / sticky chapter navigation / mobile safe-area authority

## Intent

Batch 1 establishes the visual and interaction frame before deeper section redesign. It deliberately avoids News-pipeline ownership and does not alter provider, enrichment, materialization, publication, IndexNow, timer or deployment behavior.

## Acceptance authority

### Hero and journey
- Mountain remains full-bleed and functions as the product map.
- Journey nodes stay visually connected to one coherent route across desktop and mobile crops.
- Route labels remain subordinate to the primary Academy CTA and do not overlap headline/copy.
- No Exchange CTA or stage 9 may enter the journey.

### Mobile shell
- Reserve explicit bottom clearance for the fixed TecPey navigation plus device safe area.
- Sticky chapter navigation must remain horizontally usable without precision dragging.
- Focused/interacted controls must be able to scroll clear of fixed bottom chrome.
- 320, 360/375, 390/393 and 430 CSS-pixel widths are mandatory visual evidence widths before Ready.

### Motion and material
- Motion communicates state only and must collapse under `prefers-reduced-motion`.
- Translucent UI has an opaque fallback under reduced-transparency preference.
- No animation is permitted on market values themselves.

## Verification required before Ready

- TypeScript / ESLint / production build.
- Existing public UI and design-authority gates.
- `landing-v2-safe-area-authority.test.ts`.
- FA + EN, RTL + LTR.
- Light + dark.
- Mobile + desktop exact-head screenshots.
- Reduced-motion evidence.
- No P0/P1 overlap, crop, focus, safe-area or horizontal-scroll defect.

A green build alone is not a visual pass.
