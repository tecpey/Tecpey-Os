# TecPey Core Rebuild Phase 2 — Academy Profile + Dashboard

## Scope
- Replaced the old localStorage-heavy student dashboard surface with a cleaner Academy OS dashboard.
- Dashboard now reads the official academy profile and term progress APIs.
- Added local development fallback for term progress so localhost testing can pass terms without PostgreSQL.
- Kept Smart Center gated behind an active academy profile.

## User journey covered
1. `/academy/signup`
2. `/academy/onboarding`
3. `/academy/profile`
4. `/academy/term-1`
5. submit quiz
6. return to `/academy/profile` and see updated term path

## Production rule
Local progress fallback is only for local/dev testing. Production should use PostgreSQL-backed `academy_term_progress`.

## Next phase
Phase 3 should focus on Mentor Memory Engine and real Trading Arena foundations.
