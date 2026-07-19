# TecPey Repository Hygiene Baseline — 2026-07-19

**Status:** Initial evidence inventory; no deletion authorization  
**Source:** `npm run audit:hygiene:json` on PR #64  
**Schema:** 1  
**Related:** #26

## 1. Baseline summary

The corrected repository inventory scanned:

- **1,599 tracked files**;
- **1,037 runtime source files**;
- **17 source-like reference files under `docs/`**;
- **327 framework, server, script and test entrypoints**.

The inventory currently reports:

- **0 suspicious backup/editor/temporary artifacts**;
- **2 zero-byte vendor CSS files** requiring ownership verification;
- **6 files at or above 250 KB**;
- **1 declared dependency without detected ownership: `lucide`**;
- **31 unreachable runtime-source candidates**;
- **3 duplicate-basename groups**, all currently explained by domain/framework naming;
- runtime marker counts of **83 `localStorage`**, **6 `sessionStorage`**, **2 IndexedDB**, **14 TODO**, **1 FIXME**, **0 HACK** and **44 legacy** occurrences.

Counts are inventory signals. They do not prove that a file, package or marker is removable.

## 2. Immediate conclusions

### Confirmed repository condition

- No tracked `.bak`, `.old`, `.tmp`, editor-swap or duplicate-copy artifact was found.
- The repository is not dominated by generated junk or accidental backup files.
- Cleanup value is concentrated in superseded feature generations, dependency ownership and browser-persistence migration—not broad mass deletion.

### Dependency candidate

`lucide` has no detected runtime import, configuration owner, script owner or implicit framework role. `lucide-react` is a different package and is actively used.

Classification: **A-verification candidate**.  
Required next evidence before removal:

1. exact repository import/search review;
2. governed `npm uninstall lucide` and lockfile regeneration;
3. exact-head TypeScript, ESLint, all guards, tests and production Build;
4. before/after install or lockfile impact.

This baseline does not uninstall it.

## 3. Source candidate classification

### A-verification: likely superseded and suitable for focused deletion proof

These candidates have no detected route/import reachability and appear replaced by current production paths:

#### Previous landing-page generation

- `src/app/home/about/About.tsx`
- `src/app/home/blog/Blog.tsx`
- `src/app/home/faq/FaqSection.tsx`
- `src/app/home/hero/Hero.tsx`
- `src/app/home/hero/PriceCard.tsx`
- `src/app/home/mainService/MainServices.tsx`
- `src/app/home/priceList/PriceListSection.tsx`
- `src/app/home/socials/Socials.tsx`
- `src/app/home/swap/SwapSection.tsx`

The current root page imports `TecpeyEnterpriseLanding` directly. This group should be verified and removed together in a small landing-generation cleanup PR if no route, registry, story or deployment consumer exists.

#### Previous crypto chart generation

- `src/app/crypto/[symbol]/ChartWrapper.tsx`
- `src/components/crypto/LivePriceChart.tsx`

The current crypto route renders `TradingViewChart` directly. If final reference and runtime checks confirm the older Chart.js path is dead, this removal may also allow review of `chart.js` and `react-chartjs-2` dependency ownership.

#### Superseded Trading Arena dashboard

- `src/components/academy/trading-arena/TradingArenaDashboard.tsx`

The production route now uses the authoritative execution client. This file must receive one final import/test/guard review before deletion because it belongs to a financially sensitive domain.

#### Additional isolated UI/data candidates

- `src/components/academy/AcademyMentorFloatingCTA.tsx`
- `src/components/academy/AcademyStudentDashboard.tsx`
- `src/components/markets/MarketsFilters.tsx`
- `src/components/skeletons/PriceCardSkeletone.tsx`
- `src/components/ui/Skeleton.tsx`
- `src/data/academyMentorQuestionGuides.ts`
- `src/data/languages.ts`

These require feature-owner verification and should not be deleted as one mixed group.

### B: transitional/quarantined

- `src/components/academy/trading-arena/ScenarioPlayer.tsx`
- `src/lib/trading-scenarios.ts`

The production scenario route intentionally does not import the browser-authoritative scenario engine. The files preserve previous scenario behavior while the server-owned replay/scenario contract remains unfinished.

Removal condition:

- scenario product requirements are extracted into an authoritative specification; and
- either the new server implementation exists or the product scope explicitly retires the old scenarios.

Until then they remain quarantined and must never be reconnected to production execution.

### C/D: platform foundations or unresolved ownership

- `src/lib/entity.ts`
- `src/lib/i18n-locale.ts`
- `src/lib/mentor-cleanup.ts`
- `src/lib/permission.ts`
- `src/lib/platform-types.ts`
- `src/lib/product-registry.ts`
- `src/lib/route-guards.ts`
- `src/lib/security/api-key-auth.ts`
- `src/lib/session-refresh.ts`
- `src/lib/tenant-service.ts`

Several names align with future multi-tenant, developer-platform, identity and lifecycle capabilities. Static unreachability is insufficient evidence for deletion. Each requires architecture-owner review against #20 and the platform roadmap.

## 4. Vendor and large-file boundary

### Zero-byte files

- `public/charting_library/bundles/2666.fbb750fd312778403036.css`
- `public/charting_library/bundles/2666.fbb750fd312778403036.rtl.css`

Classification: **D — unresolved vendor ownership**.  
They may be intentional placeholders referenced by a vendor manifest. Do not delete without browser/runtime and manifest verification.

### Large files

The largest tracked files are primarily:

- TradingView/charting-library vendor bundles and TypeScript declarations;
- `src/data/glossaryTerms.json`;
- `package-lock.json`.

Large size alone is not a cleanup defect. Optimization requires proving actual loading, cache/compression behavior and product ownership.

## 5. Browser-persistence debt

Raw marker counts are not equal to authoritative-state violations. Existing CI authority guards remain the source for approved baselines and forbidden paths.

Next classification must separate:

1. prohibited durable domain authority;
2. one-time migration bridge with removal gate;
3. disposable UI preference/cache;
4. offline command queue requiring server reconciliation;
5. references inside tests or documentation strings.

No broad search-and-delete is permitted.

## 6. Duplicate basenames

The three duplicate groups are currently legitimate:

- domain-specific `engine.ts` files for trading, wallet confirmation and wallet fee;
- FA/EN `not-found.tsx` framework routes;
- domain-specific trading and wallet `types.ts`.

No rename is required solely to make filenames globally unique.

## 7. Ordered cleanup queue

1. Verify and remove the unowned `lucide` package in a dependency-only PR.
2. Verify the old landing generation and delete it in one focused PR.
3. Verify the previous Chart.js path; remove files and then reassess chart dependencies.
4. Verify and remove the superseded Trading Arena dashboard without touching quarantined scenario requirements.
5. Review isolated UI/data candidates one feature at a time.
6. Review platform-foundation candidates with #20 and developer-platform architecture owners.
7. Classify remaining browser-persistence lines by authority class.

## 8. Baseline rule

This document records the review queue at one commit. Every cleanup PR must regenerate the JSON artifact and record before/after counts. A lower file count is not success unless product behavior, recoverability, authority and CI evidence remain intact.
