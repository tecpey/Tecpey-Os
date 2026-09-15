# TecPey Showcase v2 — Screenshot Provenance

**Purpose:** durable provenance for the high-resolution product screenshots embedded in `README.md` and `README.fa.md`.

These assets are real browser captures from TecPey's governed Public Browser Golden Path. They are not generated UI, mockups, or reconstructed marketing screens. Showcase v2 replaces the earlier 320/480px lossy thumbnails with 1440px derivatives designed to keep interface typography and product detail inspectable on GitHub.

## Source authority

- Repository: `tecpey/Tecpey-Os`
- Accepted product head: `9f3a8fa0c9d43c2f34cacfa24935d9ec300c4baa`
- Workflow: **Public Browser Golden Path**
- Workflow run: **#1857**
- Run ID: `34941100324`
- Artifact ID: `10385133433`
- Artifact: `public-browser-report-9f3a8fa0c9d43c2f34cacfa24935d9ec300c4baa`
- Artifact digest: `sha256:c19f333728019d1053cd4707a842c94e79c89949cdbb2f36baa400d0305d4b23`
- Artifact created: `2026-09-15T07:24:05Z`
- Artifact expiry: `2026-09-22T07:24:04Z`

On this exact head, CI, Public Browser Golden Path, Full Suite Diagnostics, Repository Audit Manifest, API Security Manifest, Sensitive Mutation Audit, Full History Secret Scanning, and AI Tenant RLS Runtime Evidence all completed successfully.

## Durable README assets

| Asset | Browser source | Source dimensions | Source SHA-256 | Derivative dimensions | Derivative SHA-256 | Transformation |
|---|---|---:|---|---:|---|---|
| `landing-fa-9f3a8fa0.webp` | `firefox-fa-desktop/data/569c18a464a038540040a14206a855639a360b14.png` | 1440×900 | `040ccd3eb0ac4d66a43afbb73b64322eb67df383fc1b96be5916f31f4883c021` | 1440×900 | `c7fc7b8d4b47af50abb62a8bb48b75ea5b2bdb35ad6a9268d31a57488cfafa5a` | WebP quality 94; no resize/crop |
| `landing-en-9f3a8fa0.webp` | `chromium-en-desktop/data/d36ea02a71bf10ccac8d75651a6d2cfcbdfd5443.png` | 1440×900 | `b298e46acebdba895f9c03c0f4cd62c368d62addd14383f8bbdc63fc7e16932e` | 1440×900 | `0eaa133b8f139a19078c60365115f0cb5e1904e3eb3adb04aac09d720fd6118f` | WebP quality 94; no resize/crop |
| `academy-fa-9f3a8fa0.webp` | `firefox-fa-desktop/data/ac5b6733a4677212ee244f617f0afbc8d47173a8.png` | 1440×12943 | `55504cd839f4f7fd0652ca7a454b20f217d4be2209d1c6879bd6f140ba028ccb` | 1440×1350 | `d9ec660773c5d3b93d2597d3fdaf3f3c36619facb900072b4dc3cb6b21209aaa` | top viewport crop only + WebP quality 94 |
| `mentor-fa-9f3a8fa0.webp` | `firefox-fa-desktop/data/9a50aa4cf2bc06e05be47418939524da504a3499.png` | 1440×2624 | `9c6b3f98c2d15768dcd54ac01e344a74c0da94f764b3ecd043bd3c1ffb47ba73` | 1440×1350 | `bb1ef2e1f8044a5484bc4130142f2ce6ec211b3a9f53f2ea5a0f972a8521d269` | top viewport crop only + WebP quality 94 |
| `arena-fa-9f3a8fa0.webp` | `firefox-fa-desktop/data/ff457a3bc8fdc9b4ec388fdc0e481ddabd4c0789.png` | 1440×1977 | `99d8923bb12fb7a3bf18267f6d7942879b5aa5ee8f5d7502d90ed31e71f444d4` | 1440×1350 | `8dd42a7422cfcfba10e7b633517d83c344383d39a1bf45a19c4713628ff97d77` | top viewport crop only + WebP quality 94 |

The crops remove only content below the documented viewport boundary. No UI text, controls, balances, charts, states, visual effects, or product claims were added, removed, redrawn, or composited. The WebP conversion is a storage/rendering optimization only.

## Quality policy

README showcase images should remain readable at repository-page scale. New showcase assets should normally preserve the 1440px browser capture width and avoid tiny derivatives that destroy interface typography. Any future replacement must document its exact source head, workflow/run, source hash, derivative hash, dimensions, and transformation.

## Evidence boundary

A screenshot proves only the UI state captured by that browser workflow at that exact commit. It does not by itself prove production activation, provider credentials, live external feeds, custody, real-money Exchange operation, deposits/withdrawals, regulatory approval, or current protected-staging health.

Use the README for product orientation, this file for visual provenance, exact-head workflows for code acceptance, and `docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md` for the release decision.
