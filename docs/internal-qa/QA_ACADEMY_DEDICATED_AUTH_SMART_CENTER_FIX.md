# QA — Dedicated Academy Auth + Smart Center Fix

## Fixed
- Removed the floating Smart Center from academy layout for visitors.
- Smart Center now appears only in the top navbar after an academy profile exists.
- Added dedicated academy login/signup routes:
  - `/academy/login`
  - `/academy/signup`
  - `/en/academy/login`
  - `/en/academy/signup`
- Academy onboarding no longer sends users to exchange login/signup.
- Academy profile API accepts a dedicated academy auth session, separate from exchange account.
- Local development fallback profile storage was added under `storage/academy-profiles.local.json` when `DATABASE_URL` is not set. This fallback is disabled in production.
- Academy CTAs under academy pages now point to academy-specific signup.

## Build checks
- `npm install` passed.
- `npm run check` passed with warnings only, no TypeScript errors.
- `npm run build` started compiling but timed out in the sandbox environment; no TypeScript error was found before timeout.

## Required env
- `TECPEY_ACADEMY_AUTH_SECRET`
- `TECPEY_SESSION_SECRET`
- `JWT_SECRET`

## Manual test flow
1. Open `/academy` as visitor: no floating Smart Center.
2. Click signup in academy: `/academy/signup`.
3. Create academy account.
4. Redirect to `/academy/onboarding`.
5. Create display name / username / avatar.
6. Redirect to `/academy/profile`.
7. Navbar shows Smart Center.
8. Mentor and terms unlock.
