# TecPey Free Crypto Course Pillar Evidence - 2026-08-16

**Status:** Implemented on branch `agent/enterprise-product-qa-hardening-free-course`
**Scope:** `/academy/free`, `/en/academy/free`, `sitemap.xml` source
**Intent:** Convert the free Academy route from a redirect into a crawlable SEO/GEO/AEO pillar for "دوره رایگان ارز دیجیتال" and "free crypto course" intent.

## Implemented

- Replaced `/academy/free` redirect with a Persian public course landing page.
- Replaced `/en/academy/free` redirect with an English parity course landing page.
- Added direct route metadata: canonical, hreflang, OpenGraph and Twitter card.
- Added visible AEO/GEO answer blocks for:
  - what the course includes;
  - whether it is enough for trading;
  - no-signal/no-profit/no-financial-advice boundary.
- Added JSON-LD with `Course`, `FAQPage` and `BreadcrumbList` using `safeJsonLd`.
- Added internal links to Academy, signup, security, risk and curriculum routes.
- Added relation links to News, Coins and Trading Tools so the page connects education to entity context without trade pressure.
- Added `/academy/free` and `/en/academy/free` to the generated sitemap source.

## Safety Boundaries

- The page does not promise profit, market readiness or trading success.
- Coin, tool and news links are framed as learning context, not buy/sell pressure.
- The CTA keeps signup available while preserving crawlable educational content before account creation.

## Local Verification

Passed:

- `git diff --check`
- `node scripts/qa-route-check.mjs` (`175 pages indexed`)
- `node scripts/check-release-gate-coverage.mjs`
- `node scripts/check-coin-growth-automation.mjs`
- `node scripts/check-tool-growth-automation.mjs`
- `node scripts/check-repository-audit-authority.mjs`
- `node scripts/repository-audit-manifest.test.mjs`
- `node scripts/generate-repository-audit-manifest.mjs`
- Static source check confirms both routes no longer call `redirect`.
- Static source check confirms both routes expose direct metadata, OpenGraph, Twitter metadata, `safeJsonLd`, `Course`, `FAQPage` and `BreadcrumbList`.
- Static source check confirms `src/app/sitemap.ts` includes `/academy/free` and `/en/academy/free`.

## Audit Linkage

- The free-course pillar is now connected to the shared organic-growth profile contract used by news, coin and tool automation.
- `src/lib/organic-growth-automation.ts` is explicitly classified as product-ui Batch 10 in the repository audit policy.
- Batch 1A audit evidence was refreshed for Policy v17 so exact-head manifest generation rejects stale or unclassified growth sources.

Blocked in this sandbox:

- `npm ci --no-audit --no-fund`
- `npm run typecheck`
- `next build`

Reason: this fresh sandbox clone has no `node_modules`, and npm 11.9.0 attempts to create `/root/.npm` even with `HOME=/tmp` and `npm_config_cache=/tmp/npm-cache`; `/root` is read-only here. Dependency-based validation must run in CI or a workspace with writable npm cache.
