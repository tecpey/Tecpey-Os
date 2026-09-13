# TecPey Showcase Screenshot Provenance

**Purpose:** provenance and evidence-boundary manifest for the real product screenshots embedded in the root README files.

The committed showcase assets are **not mockups, generated UI, or manually reconstructed marketing screens**. They are resized WebP derivatives produced from real browser screenshots captured by TecPey's governed GitHub Actions browser workflow.

## Source capture authority

- Repository: `tecpey/Tecpey-Os`
- Product PR: **#642 — `feat(landing): bilingual mountain growth journey with source-backed market and news`**
- Source branch: `codex/landing-growth-story-mobile`
- Exact source head: `c28ec91f397fb4f1580d2b6d2499d867c176fa77`
- Merge commit on `main`: `c4751708ae6c1d2f2877ed64e7de36e5b963a045`
- Workflow: **Public Browser Golden Path**
- Workflow run ID: `34728930569`
- Run number: `1766`
- Artifact ID: `10308332406`
- Artifact name: `public-browser-report-c28ec91f397fb4f1580d2b6d2499d867c176fa77`
- Artifact digest: `sha256:86c616485897b933ef510a43fccf6e334c07db6c558e9faae672727a45171175`
- Artifact created: `2026-09-13T00:54:00Z`
- Workflow artifact retention: **7 days**

The exact source head completed the governed CI, Public Browser Golden Path, Full Suite Diagnostics, Repository Audit Manifest, API Security Manifest, Sensitive Mutation Audit, Full History Secret Scanning, and AI Tenant RLS Runtime Evidence workflows successfully before merge.

## Committed durable derivatives

| Repository asset | Original capture | Original dimensions | Original SHA-256 | Environment | Transformation |
|---|---|---:|---|---|---|
| `landing-fa-dark-c28ec91.webp` | `firefox-fa-desktop/data/1c489d1597448d10578fbde8f4462f81bec2f382.png` | `1440×900` | `014ee4455feb446b338f4757c0f36aaa78ceb8dc364ed939952f92e1dd87936d` | Firefox · Persian · desktop · dark | resized and lossy WebP-compressed only |
| `trading-arena-fa-dark-c28ec91.webp` | `firefox-fa-desktop/data/921fe630657930710615529e288471c7a251df69.png` | `1440×1977` | `8b7da4ee7430187ff2c726a493162cdc7b65ba0246416dee0956b7aab7ead5ca` | Firefox · Persian · desktop · dark | resized and lossy WebP-compressed only |

No product text, controls, balances, charts, layout elements, states or visual claims were added to the derivative images. Optimization was limited to resize/compression for repository and README performance.

The README renders the committed derivatives **at or below their intrinsic widths** (`480px` for the landing derivative and `320px` for the Arena derivative) so GitHub does not upscale them and blur interface details. Each rendered image links to the committed asset itself.

## Retention boundary — important

The GitHub Actions artifact is **ephemeral evidence**, not a permanent review store. The workflow uses a 7-day retention window, so the full-resolution browser originals must not be described as continuing pixel-level authority after that artifact expires.

Accordingly:

- the repository-hosted WebP derivatives are the durable showcase assets;
- source path, original dimensions, source SHA-256, workflow/run identity and artifact digest remain as durable provenance metadata;
- while the artifact is retained, reviewers can compare the committed derivatives with the full-resolution originals;
- after artifact expiry, this manifest preserves traceability but **does not claim that the unavailable originals can still be independently pixel-inspected**;
- a future documentation/evidence change that requires permanent full-resolution inspection should commit lossless/full-resolution captures or place them in an approved durable evidence store with immutable identity and retention policy.

This boundary is intentional and avoids turning a short-lived CI artifact into a false long-term evidence claim.

## Additional captures observed in the source artifact

During the artifact retention window, the source browser report contained real captures for Academy, Mentor/personalized AI, authentication, responsive mobile/desktop states, light/dark themes, and Persian/English surfaces. These are useful runtime review inputs while retained, but they are **not referenced as permanent evidence after expiry unless separately preserved**.

## Evidence boundary

A screenshot proves only the UI state captured by that browser workflow at that exact commit. It does **not** by itself prove:

- live provider credentials or populated external feeds;
- an authenticated production user session;
- production custody or real-money Exchange activation;
- withdrawal/deposit availability;
- regulatory approval;
- Safari/PWA acceptance unless separately evidenced;
- current protected-staging health after the source run.

Reviewers should use the root README for product orientation, this manifest for screenshot provenance and retention limits, exact-head CI for code acceptance, and `docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md` for the release decision.
