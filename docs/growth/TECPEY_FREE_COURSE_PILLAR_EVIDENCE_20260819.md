# TecPey Free Crypto Course Pillar Evidence - 2026-08-19

**Status:** Implemented on branch `claude/takpay-detailed-analysis-2oml56` (recreation of the work first drafted in PR #465).
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

## Verification

- `git diff --check`
- Both routes no longer call `redirect`.
- Both routes expose direct metadata, OpenGraph, Twitter metadata, `safeJsonLd`, `Course`, `FAQPage` and `BreadcrumbList`.
- `src/app/sitemap.ts` includes `/academy/free` and `/en/academy/free`.
- Full typecheck and production build run in CI on the exact commit.
