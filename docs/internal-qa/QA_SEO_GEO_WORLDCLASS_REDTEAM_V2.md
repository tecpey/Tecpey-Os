# TecPey SEO/GEO World-Class RedTeam V2

## Scope
Full review of the latest SEO/GEO Growth Engine patch with focus on organic discoverability, crawlability, index quality, internal linking, structured data, user-visible copy, and trust risk.

## Critical findings fixed

1. User-visible SEO/internal wording was still present:
   - `صفحات آموزشی قابل ایندکس`
   - `صفحه قیمت قابل ایندکس`
   - `برای جذب کاربر ارگانیک`
   These were removed from public UI and replaced with user-first product language.

2. Static `/public/sitemap.xml` did not include the new `/learn/*` and `/price/*` growth pages. Because static public assets can be served directly in production setups, the static sitemap was regenerated to include the new growth engine URLs.

3. `robots.txt` in `/public` was weaker than the dynamic `robots.ts`. It now blocks `/api`, build/storage paths and auth redirects.

4. Auth redirect pages were indexable by default. Added `robots: { index: false, follow: false }` metadata to login/signin/signup FA/EN pages.

5. `tsconfig.json` had path aliases without an explicit `baseUrl`. Added `baseUrl: "."` to reduce build-resolution risk.

6. Learning and price detail pages lacked breadcrumb structured data. Added `BreadcrumbList` schema to strengthen entity understanding and SERP context.

7. Learning hub depth was too small for a serious topic cluster. Added four high-intent pages:
   - `/learn/wallet-security`
   - `/learn/risk-management`
   - `/learn/technical-analysis-basics`
   - `/learn/ai-crypto-mentor`

## QA checks performed

- Scanned public UI text for SEO/internal phrases: PASS
- Verified `organicSeo.ts` TypeScript syntax with global `tsc`: PASS for syntax/data file
- Regenerated static sitemap: 167 URLs
- Growth pages in sitemap: 9 learning pages, 16 price pages
- Public robots updated: PASS
- Dynamic sitemap updated with EN pages and expanded static paths: PASS
- Full build was not run because project dependencies are not installed in this environment.

## Remaining strategic opportunities

1. Add English `/en/learn` and `/en/price` equivalents for global visibility.
2. Add author/reviewer bios for E-E-A-T on education pages.
3. Add canonical strategy for `/crypto/[symbol]` vs `/price/[slug]` to avoid thin/overlapping price intent.
4. Add real live price blocks into `/price/[slug]` once market-board API is connected.
5. Add `lastReviewed` / `dateModified` content governance fields for YMYL trust.
6. Add Persian long-tail pages for `آموزش تتر در ایران`, `انتقال تتر با شبکه ترون`, `امنیت حساب صرافی`, `اشتباهات رایج مبتدیان رمزارز`.

## Verdict
SEO/GEO foundation moved from content patch to a real growth engine, but the next global-level leap is bilingual topical authority + real market data + E-E-A-T editorial governance.
