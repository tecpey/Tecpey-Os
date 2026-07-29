# TecPey QA - Academy Auth/Register Final Fix

## Problem
Academy signup could fail on localhost when the app was run with `npm run start` or when `DATABASE_URL` was missing, invalid, or still set to a placeholder. The old API rejected local JSON storage in production mode, so local testing could not create academy accounts or academy profiles.

## Fixes
- Academy auth now falls back to local JSON storage on localhost when PostgreSQL is unavailable.
- Academy profile creation now falls back to local JSON storage on localhost when PostgreSQL is unavailable.
- Placeholder `DATABASE_URL` values containing `CHANGE_ME` no longer cause registration to fail.
- DB connection failures fall back to local storage on localhost instead of returning a generic server error.
- Added `TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE=true` to local env example.
- Frontend now shows specific signup/login error messages instead of one generic failure.

## Security
- Local JSON fallback is allowed for localhost/dev/test only.
- Production server still requires real storage unless explicitly enabled by env.
- Academy auth cookie remains HttpOnly and signed.

## Test path
1. `/academy/signup`
2. Create academy account
3. Redirect to `/academy/onboarding`
4. Create academy profile
5. Redirect to `/academy/profile`
6. Mentor / Trading Arena / Smart Center should unlock only after academy profile exists.
