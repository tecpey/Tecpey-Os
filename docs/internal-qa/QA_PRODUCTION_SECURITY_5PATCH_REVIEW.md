# TecPey Production Security 5-Patch Review

## Scope
This patch focused on the five launch-critical issues found during the previous world-class QA/RedTeam pass:

1. Secure Certificate Issuance
2. Server-side Term Unlock
3. Signed Student Session
4. Production SEO robots/noindex fixes
5. Product language cleanup from technical/internal wording

## Patch 1 — Secure Certificate Issuance

### Fixed
- Certificate issuing no longer trusts `score` or `studentName` from the browser.
- Certificate issuing now reads the verified term result from `academy_term_progress`.
- A certificate can only be issued when the term is officially stored as `status = 'passed'`.
- `CERTIFICATE_SIGNING_SECRET` is now mandatory and must be at least 32 characters.
- Removed unsafe fallback secret `tecpey-local-certificate-secret`.

### Files
- `src/lib/academy-certificates.ts`
- `src/app/api/academy-certificates/route.ts`

## Patch 2 — Server-side Term Unlock

### Fixed
- Added official `academy_term_progress` table.
- Added `/api/academy-term-progress` for reading and submitting term quiz progress.
- Term quiz answers are verified on the server against the canonical academy term data.
- Term unlocking now checks official server progress instead of trusting only browser `localStorage`.
- Local storage remains only for interface continuity, not official authorization.

### Files
- `src/lib/student-cartax.ts`
- `src/app/api/academy-term-progress/route.ts`
- `src/components/academy/TermQuizClient.tsx`
- `src/components/academy/TermGateLink.tsx`
- `src/components/academy/TermAccessGuard.tsx`
- `src/components/academy/AcademyCertificatesClient.tsx`

## Patch 3 — Signed Student Session

### Fixed
- Replaced raw `tecpey_student_id` usage in academy certificate/profile APIs.
- Added signed student session cookie: `tecpey_student_session`.
- Cookie flags: `HttpOnly`, `Secure` in production, `SameSite=Lax`.
- Session signing requires `TECPEY_SESSION_SECRET`, `JWT_SECRET`, or `NEXTAUTH_SECRET` with minimum 24 chars.
- Legacy raw student cookie is deleted after signed session creation.

### Files
- `src/lib/academy-session.ts`
- `src/app/api/academy-student-profile/route.ts`
- `src/app/api/academy-certificates/route.ts`

## Patch 4 — Production SEO Fix

### Fixed
- Removed `/_next/` from robots disallow list so search engines can render CSS/JS correctly.
- Added disallow rules for private/utility areas.
- Added noindex to private academy profile/mentor pages.
- Added dynamic noindex for invalid certificate verification pages.
- Added dynamic noindex for invalid public student profiles.

### Files
- `src/app/robots.ts`
- `src/app/academy/profile/page.tsx`
- `src/app/academy/mentor-coach/page.tsx`
- `src/app/verify/[certificateId]/page.tsx`
- `src/app/student/[studentId]/page.tsx`

## Patch 5 — Product Language Cleanup

### Fixed
- Removed user-facing technical/internal wording such as API market wording, demo data feed references, and file-storage messages.
- Replaced technical pricing copy with product-safe wording: TecPey online market board.
- Removed TradingView demo feed fallback from crypto chart wrapper.

### Files
- `src/app/price/[slug]/page.tsx`
- `src/app/coins/[slug]/page.tsx`
- `src/app/en/coins/[slug]/page.tsx`
- `src/components/crypto/AboutCoin.tsx`
- `src/data/academyWorldClassPlan.ts`
- `src/app/crypto/[symbol]/ChartWrapper.tsx`

## Static QA Results

### Passed
- Changed TS/TSX files passed TypeScript transpile/syntax validation.
- No remaining direct usage of raw `req.cookies.get("tecpey_student_id")` in academy profile/certificate APIs.
- No remaining unsafe certificate fallback secret.
- No `Disallow: /_next/` in robots.
- No TradingView `demo-feed-data` reference.
- No user-facing `API بازار / API مارکت‌برد / academy-leads.json` copy found in UI files.
- Internal link scan found no broken application links; image links were verified in `/public/images`.

### Build Note
Full `npm run check` could not be completed in this sandbox because `node_modules` is not included and local `eslint` is unavailable. Run this on the target machine:

```bash
npm ci
npm run check
npm run build
```

## Required Production ENV

```env
DATABASE_URL=postgresql://...
TECPEY_SESSION_SECRET=<at least 24 chars>
CERTIFICATE_SIGNING_SECRET=<at least 32 chars>
NEXT_PUBLIC_SITE_URL=https://tecpey.ir
NEXT_PUBLIC_API_BACKEND_URL=https://...
NEXT_PUBLIC_API_SOCKET_URL=wss://...
```

## RedTeam Verdict
The five critical production blockers are addressed at code level. The certificate system is no longer browser-score based, term progression has a server-side authority path, student identity is signed, robots is safer for SEO rendering, and technical/internal language leakage was reduced.

Remaining next QA focus:
- Full build on machine with dependencies.
- Database migration smoke test.
- Real quiz pass/fail test with signed session.
- Certificate issue/verify lifecycle test.
- Visual QA on academy term locking and certificate pages.
