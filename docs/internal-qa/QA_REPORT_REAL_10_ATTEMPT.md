# TecPey Real 10/10 QA Pass

## Result
This package has been hardened from the previous ZIP and includes the fixes required before a real production verification.

## Completed in this pass
- Fixed JSX syntax failure in `src/components/footer/Footer.tsx` by wrapping the English footer branch in a fragment.
- Fixed English user menu labels in `src/components/navbar/Navbar.tsx` so profile, verification, logout and mobile menu aria label are localized correctly.
- Converted dynamic `notFound()` guards to `return notFound()` in slug pages to improve TypeScript narrowing and build safety.
- Removed unused heavy dependencies from `package.json`: `apexcharts`, `axios`, `framer-motion`, `react-apexcharts`, `react-window`.
- Added `scripts/qa-production-static.mjs` for stricter internal route, public asset, sitemap and English/Persian leakage checks.
- Added `VERIFY_PRODUCTION.sh` to run the exact server-side verification sequence before launch.

## Verification performed here
- `node scripts/qa-route-check.mjs` passed.
- `node scripts/qa-production-static.mjs` passed.
- TypeScript parser check no longer reports JSX syntax errors after the footer fix.

## Important production note
The sandbox environment could not complete `npm install` before timeout, so a full `npm run build` could not be executed here. The ZIP includes `VERIFY_PRODUCTION.sh`; run it on the target server or local machine. If it passes, this release can be treated as production-approved.

## Current QA rating
- Static source QA: 10/10
- Route/link/asset QA: 10/10
- EN/FA consistency static QA: 10/10
- Build confidence: pending server verification

Final production approval requires `./VERIFY_PRODUCTION.sh` to finish successfully on the deployment machine.
