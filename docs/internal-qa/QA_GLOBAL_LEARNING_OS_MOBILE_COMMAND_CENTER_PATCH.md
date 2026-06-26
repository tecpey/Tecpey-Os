# TecPey Global Learning OS / Mobile-Ready Command Center Patch QA

## Scope
This patch turns the latest TecPey Academy build into a mobile-ready Learning OS foundation instead of adding isolated page-level features.

## Implemented modules

### 1. Event Driven Core
- Added `src/lib/learning-os.ts`.
- Added `learning_events` table.
- Added `recordLearningEvent()` for academy, mentor, simulator, notification and achievement events.
- Designed for Web, Android, iOS and future global clients through API events rather than browser-only state.

### 2. Adaptive Mentor Challenge Engine
- Added `academy_question_bank`.
- Added `mentor_challenge_attempts`.
- Added `/api/mentor-challenge` GET/POST.
- GET never exposes `correct_option` to the client.
- POST validates the answer server-side, records first answer, attempt number, response time and confidence.
- Added `MentorChallengeBox` UI inside term pages.

### 3. Learning Brain
- Added `learning_brain_profiles`.
- Added learning velocity, attention, decision score, risk appetite, emotional stability, confidence and discipline.
- `refreshLearningBrain()` updates profile from trusted server events.

### 4. Intelligent Notification Engine
- Added `notification_center`.
- Added `/api/notifications` and `/api/notifications/read`.
- Added `NotificationCenter` UI.
- Added academy notification page: `/academy/notifications`.
- Notification model supports `in_app`, `push`, `email`, `telegram` and is mobile-ready.

### 5. Device Token Foundation
- Added `device_tokens` table.
- Added `/api/device-token` for future Web Push, Android FCM and iOS APNS registration.

### 6. Achievement OS
- Added `achievement_catalog` and `student_achievements`.
- Added default achievements: first lesson, first quiz, streak, certificate, risk master, simulator journalist and community rising.
- Achievements can trigger notifications automatically.

### 7. Simulator Pro Integration
- Simulator decision API now emits Learning OS events.
- Simulator decisions can award the `simulator-journalist` achievement when the user records reason + risk plan.

### 8. Command Center
- Added `/command-center` as a protected admin/SaaS-ready route.
- Added `/api/command-center/summary`.
- Added `/api/command-center/campaign` for admin-created in-app/push-ready campaigns.
- Production protection: use `TECPEY_ADMIN_TOKEN` header `x-tecpey-admin-token`.
- Recommended future deployment: `admin.tecpey.ir` can point to this route/app section.

### 9. Mobile / Global readiness
- Added env placeholders for Android package, iOS bundle, FCM and APNS.
- Notification architecture is channel-based and not browser-only.
- Event APIs are stateless and token/session-ready.

## QA results
- TypeScript: `npx tsc --noEmit` passed.
- Route QA: passed, 140 pages indexed.
- Static production QA: passed, 140 routes, 0 issues.
- Targeted ESLint on new files: passed with only hook dependency warnings in two client components; no blocking errors.
- Full `next build`: compilation completed successfully, but the command timed out during Next's post-compile TypeScript phase in this environment. Standalone `tsc --noEmit` passed.
- Env check fails in sandbox because production env values are intentionally not set.

## Admin route guidance
For the current web release, the admin panel is available at `/command-center` and must be protected with `TECPEY_ADMIN_TOKEN`.
For production hardening and brand separation, the recommended final address is:

- `admin.tecpey.ir` → Command Center
- `www.tecpey.ir` → Public user product
- `api.tecpey.ir` → API gateway in later backend split

## Remaining recommended next steps
1. Add real Admin Auth / RBAC instead of token-only protection.
2. Connect FCM/APNS providers after Android/iOS app creation.
3. Add Question Bank CMS inside Command Center.
4. Add Notification Campaign audience builder UI.
5. Add OpenAI-assisted question generation with moderation before approval.
