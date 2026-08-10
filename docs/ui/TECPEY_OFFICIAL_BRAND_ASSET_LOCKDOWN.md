# TecPey Official Brand Asset Lockdown

Status: governed runtime brand source

This document records the official brand asset decision after the visual identity audit and PR #353 merge.

## Official Selections

| Purpose | Source | Runtime Output |
| --- | --- | --- |
| Canonical TP icon | `docs/assets/brand/source/tecpey-tp-icon-uploaded.png` | `public/images/tecpey-logo.png` |
| Compact icon reference | `docs/assets/brand/source/tecpey-tp-icon-compact-uploaded.png` | Reference only |
| Persian/English lockup | `docs/assets/brand/source/tecpey-lockup-uploaded.png` | `public/images/brand/tecpey-lockup-fa-en.png` |
| White/checker lockup | `docs/assets/brand/source/tecpey-lockup-white-uploaded.jpeg` | Not approved for runtime UI |

## Runtime Rules

- Render TecPey marks through `src/components/brand/TecpeyMark.tsx`.
- Use `variant="icon"` for navbar, app icons, metadata, Academy, Arena and compact product surfaces.
- Use `variant="lockup"` only on spacious brand surfaces where the full Persian/English lockup remains legible.
- Do not recolor, stretch, crop, add shadows to, or regenerate the TP mark without a separate brand review.
- Runtime icons, favicons, PWA icons, README previews and SEO logo metadata must stay derived from the same canonical icon.

## Guardrail

`npm run ui:public:check` runs `scripts/check-brand-asset-authority.mjs`. The guard verifies:

- canonical icon hash and dimensions;
- runtime alias and derived icon dimensions;
- manifest icon coverage;
- source reference hashes;
- official source selections;
- lockup access through `TecpeyMark`;
- footer use of the governed lockup variant.