# TecPey Final RedTeam QA — Academy OS V3 + Trading Arena

## Verdict
This pass focused on the hardest user-journey risks: anonymous access, local fallback bypass, Smart Center visibility, academy profile creation, mentor gating, term gating and Trading Arena readiness.

## Critical fixes applied in this QA pass

### 1. Removed device-profile bypass
Previous versions could trust `localStorage` key `tecpey-academy-device-profile` as a valid academy profile fallback. That could let a user unlock Smart Center, mentor or Trading Arena without a real server-side academy profile.

Fixed in:
- `src/components/navbar/Navbar.tsx`
- `src/components/academy/TermAccessGuard.tsx`
- `src/components/academy/AcademyStudentDashboard.tsx`
- `src/components/academy/GlobalAiMentorWidget.tsx`
- `src/components/academy/TradingArenaProClient.tsx`
- `src/components/academy/AcademyOnboardingClient.tsx`
- `src/app/api/academy-student-profile/route.ts`

Result: Academy access now depends on cloud/session profile only.

### 2. Smart Center no longer appears for visitors or incomplete academy users
The global mentor/Smart Center floating entry is now hidden until a real academy profile is confirmed by `/api/academy-student-profile`.

Result: Visitor sees normal site navigation only. Logged-in user without academy profile sees “Create academy profile” flow. Academy user sees Smart Center.

### 3. Academy onboarding now requires TecPey account login
Creating an academy identity now requires either:
- a valid main TecPey user session, or
- an existing signed academy student session.

Unauthenticated users are sent to the login/register gate first.

### 4. Device storage fallback disabled on profile API
`POST /api/academy-student-profile` no longer returns `storage: device` fallback when database is unavailable. It fails closed with 503.

Result: no fake/local academy identity can become a product identity.

## Remaining red-team concerns

### Build confidence
`package-lock.json` and `.npmrc` are registry-clean, but full `npm ci && npm run check && npm run build` must be run on the target Mac/server. In this sandbox, dependency install could not complete within tool constraints.

### Main-account session dependency
The academy onboarding now expects `user_session` to exist for first-time profile creation. If TecPey’s real auth domain uses a different cookie/session bridge, this must be aligned before production.

### Trading Arena datafeed
TradingView advanced chart is wired to `NEXT_PUBLIC_API_BACKEND_URL/api/v1/chart/spot`. The UI is production-shaped, but live chart quality depends on the final market-board/chart API implementation.

## Scored QA matrix

| Area | Score | Notes |
|---|---:|---|
| Visitor gating | 9.4 | Smart Center hidden for visitors |
| Academy onboarding | 8.8 | Correct flow; auth bridge must match production |
| Smart Center gating | 9.2 | Server profile only |
| Mentor gating | 9.1 | No global mentor before academy profile |
| Term gating | 9.0 | No local profile bypass |
| Trading Arena UX | 8.6 | Strong UI; final chart API required |
| Trading Arena data integrity | 8.0 | Journal persists locally + server API; needs full server portfolio engine later |
| Security trust boundary | 8.9 | Local fallback removed |
| Release confidence | 7.4 | Full dependency/build test still required on target machine |

## Required production test sequence

```bash
npm run ci:safe
npm run check
npm run build
```

Then manually test:
1. Visitor: no Smart Center in header/floating widget.
2. Visitor → Academy term: blocked and routed to academy profile/login flow.
3. Visitor → Mentor: no floating mentor shown.
4. Logged-in user without profile: header shows Create academy profile, not Smart Center.
5. Create profile: must require valid TecPey login.
6. After profile creation: Smart Center appears, mentor opens, term 1 unlocks.
7. Trading Arena: locked before profile, opens after profile.
8. Wrong quiz answers: correct option must not be revealed instantly.
