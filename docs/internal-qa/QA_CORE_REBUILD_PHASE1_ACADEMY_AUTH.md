# TecPey Core Rebuild - Phase 1 QA

## Scope
Phase 1 locks the independent TecPey Academy identity journey before rebuilding Mentor, Trading Arena, Offline-first and Admin SaaS.

## Fixed / Rebuilt
- Added dedicated Academy Auth API routes:
  - `POST /api/academy/auth/register`
  - `POST /api/academy/auth/login`
  - `POST /api/academy/auth/logout`
  - `GET /api/academy/auth/me`
  - `GET /api/academy/auth/username?username=...`
- Updated Academy signup/login form to call dedicated Academy Auth routes instead of the old mixed route directly.
- Fixed desktop Navbar auth links: inside Academy pages, Login/Signup now point to Academy auth, not exchange auth.
- Preserved Exchange auth for non-academy pages.
- Added `npm run qa:academy-core` to test:
  - register
  - auth cookie
  - auth/me
  - profile pre-check
  - profile create
  - student session cookie
  - profile read

## Intended Journey
`/academy/signup -> /academy/onboarding -> /academy/profile -> /academy/term-1`

## Guardrails
- Smart Center must stay hidden until academy profile exists.
- Mentor, terms and Trading Arena should depend on Academy Profile, not exchange account.
- TecPey ID remains internal; user-facing identity is display name + username + avatar.

## Manual Test
```bash
npm run ci:safe
npm run check
npm run build
npm run dev
npm run qa:academy-core
```

## Notes
This is Phase 1 of the clean rebuild. It stabilizes Academy Auth and the identity journey. Next phases should rebuild:
1. Student Dashboard Core
2. Mentor Memory Engine
3. Trading Arena Core
4. Offline Queue / Sync Engine
5. Admin SaaS Command Center
