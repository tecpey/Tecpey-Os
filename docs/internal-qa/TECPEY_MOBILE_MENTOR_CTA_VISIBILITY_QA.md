# TecPey Mobile Mentor CTA Visibility QA

## Patch
- Removed the `hidden md:inline-flex` rule that hid the floating AI Mentor button on mobile.
- Added mobile-first fixed positioning with safe-area support.
- Kept desktop placement unchanged visually.
- Added higher z-index so the CTA remains visible above academy cards and mobile content.

## Expected result
- FA mobile: `از مربی هوشمند بپرس` is visible.
- EN mobile: `Ask AI Mentor` is visible.
- CTA links to `/academy/ai-guide` and `/en/academy/ai-guide`.
