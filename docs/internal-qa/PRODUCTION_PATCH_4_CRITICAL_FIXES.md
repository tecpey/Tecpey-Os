# TecPey Production Critical Patch — 4 Fixes

This patch closes the four launch blockers found in the final QA pass.

## 1) Docker storage permission fixed

`Dockerfile` now creates `/app/storage`, assigns it to the non-root `nextjs` user and exposes it as a volume. JSONL fallbacks for academy leads no longer fail with permission errors in Docker production.

## 2) Build-readiness validation path

Run before deployment:

```bash
npm ci
npm run check
npm run build
```

The previously visible JSX closing-tag issue in `AcademyStudentDashboard.tsx` has been corrected.

## 3) Redis-backed rate limiting

The following API routes now use a shared rate limiter:

- `/api/ai-mentor`
- `/api/academy-lead`
- `/api/academy-specialized-lead`
- `/api/academy-student-profile`

Production Redis mode uses Redis REST-compatible envs:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Fallback mode is in-memory so the site does not go down if Redis is temporarily unavailable. For multi-instance production, configure Redis REST before launch.

## 4) PostgreSQL Student Cartax

New endpoint:

```http
GET/POST /api/academy-student-profile
```

New DB-backed tables are auto-created when `DATABASE_URL` exists:

- `academy_students`
- `academy_student_cartax`
- `academy_student_events`

The academy dashboard now syncs progress, XP, completed terms, badges, mentor snapshot and simulator status to the central student cartax. If `DATABASE_URL` is missing, local progress remains preserved and the UI shows local fallback mode.

## Required production env

```env
DATABASE_URL=postgresql://...
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
OPENAI_API_KEY=sk-...
AI_MENTOR_MODEL=gpt-4o-mini
NEXT_PUBLIC_API_BACKEND_URL=https://your-real-admin-api
NEXT_PUBLIC_API_SOCKET_URL=wss://your-real-market-socket/spot
```
