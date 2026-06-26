# Phase 4 — AI Mentor Memory Engine

**Date:** 2026-06-24
**Status:** Complete
**TypeScript:** 0 errors | ESLint: 0 errors (111 warnings — down from 117 pre-phase)

---

## Goal

Transform the AI Mentor from a stateless, localStorage-only chatbot into a server-backed memory engine that personalizes responses using academy progress, trading-arena signals, and structured per-student memories persisted in PostgreSQL.

---

## Database tables added (4 new tables)

All DDL lives in `src/lib/db-schema.ts` (inside `initSchema`) — never inside request handlers.

### `mentor_profiles`
One row per student. Aggregated learning state: level, risk profile, goal, weak/strong areas, confidence score. Auto-upserted on first AI mentor interaction.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `student_id` | UUID FK → `academy_students` | `ON DELETE CASCADE`, `UNIQUE` |
| `level` | TEXT | `beginner` / `intermediate` / `advanced` |
| `risk_profile` | TEXT | `low` / `medium` / `high` |
| `primary_goal` | TEXT | |
| `weak_areas` | TEXT[] | |
| `strong_areas` | TEXT[] | |
| `confidence_score` | INTEGER | 0–100 CHECK |
| `last_active_at` | TIMESTAMPTZ | touched on every mentor interaction |

### `mentor_conversations`
Individual conversation turns. Pruned to 200 most-recent rows per student.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `student_id` | UUID FK | `ON DELETE CASCADE` |
| `role` | TEXT | `user` / `assistant` / `system` |
| `content` | TEXT | sanitized before insert |
| `locale` | TEXT | `fa` / `en` |
| `term_number` | INTEGER | nullable |

Index: `mentor_conversations_student_idx` on `(student_id, created_at DESC)`

### `mentor_memories`
Structured, categorized, importance-weighted memory entries.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `student_id` | UUID FK | `ON DELETE CASCADE` |
| `category` | TEXT | CHECK: `academy` / `trading` / `psychology` / `risk` / `discipline` / `goals` / `career` / `mistakes` |
| `content` | TEXT | max 2000 chars after sanitization |
| `importance` | INTEGER | CHECK: `1` / `5` / `10` / `100` |
| `expires_at` | TIMESTAMPTZ | nullable, for future TTL support |

Index: `mentor_memories_student_idx` on `(student_id, importance DESC, created_at DESC)`

### `mentor_insights`
Periodic insight snapshots generated from memories. Read-only for students.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `student_id` | UUID FK | `ON DELETE CASCADE` |
| `insight_type` | TEXT | `session_summary` (extensible) |
| `content` | TEXT | aggregated snapshot text |
| `generated_at` | TIMESTAMPTZ | |

Index: `mentor_insights_student_idx` on `(student_id, generated_at DESC)`

---

## Files changed

### `src/lib/db-schema.ts` — modified
Added DDL for all 4 mentor tables + 3 indexes inside `initSchema()`. They are created only once per process via the existing `schemaInit` guard in `db.ts`.

### `src/lib/mentor-memory.ts` — new
Canonical server-only helper library. No `"use server"`, no `next/headers`. Importable from API routes.

| Export | Description |
|---|---|
| `getOrCreateMentorProfile(studentId)` | Upsert mentor profile, touch `last_active_at`. Returns null if DB unavailable. |
| `saveMentorConversation(studentId, role, content, locale, termNumber?)` | Insert turn, prune to 200 rows. Fire-and-forget — swallows errors. |
| `getMentorContext(studentId)` | Parallel fetch of profile, last 12 turns, top 20 memories, full term progress, last 20 trading signals. Returns empty context if DB unavailable. |
| `saveMentorMemory(studentId, category, content, importance)` | Insert structured memory. |
| `generateMentorInsights(studentId)` | Aggregate memories → insight text → persist to `mentor_insights`. Local computation only (no AI call). |
| `buildContextPrompt(ctx)` | Serialize `MentorContext` into a compact Farsi prompt block for injection into the AI system instructions. |

### `src/app/api/ai-mentor/route.ts` — modified
- Imports `getMentorContext`, `getOrCreateMentorProfile`, `saveMentorConversation`, `buildContextPrompt` from `mentor-memory`.
- On each authenticated request:
  1. Loads DB mentor context in parallel with profile upsert (non-blocking).
  2. Persists the user question (fire-and-forget).
  3. Injects `buildContextPrompt(ctx)` into the OpenAI system instructions — includes profile, academy progress, trading signals, and top memories.
  4. Persists the assistant answer (fire-and-forget).
- Client-sent localStorage history is kept as a UI fallback with a `TODO(mentor-memory)` comment marking the future removal date.
- No change to fallback/localFallback behavior; local dev still works without OpenAI key.

### `src/app/api/academy/mentor-memory/route.ts` — modified
- Replaced `getStudentSessionFromRequest` with `getCanonicalSession` (Phase 2 unification).
- Extracted `const studentId = session.studentId` after null guard.

### `src/app/api/mentor-memory/route.ts` — new
Three handlers in one file:

| Method | Behavior |
|---|---|
| `GET` | Returns student's memories. Filters: `?category=<cat>`, `?minImportance=<n>`. Max 100 rows. |
| `POST` | Save a memory. Body: `{ category, content, importance? }`. Rate-limited to 20/min. |
| `DELETE` | Delete a memory by `?id=<uuid>`. Student can only delete their own rows (enforced by WHERE clause). |

### `src/app/api/mentor-insights/route.ts` — new
`GET /api/mentor-insights`
- Returns last 5 insight snapshots.
- `?generate=1` triggers a fresh `generateMentorInsights()` before returning.
- Rate-limited to 30/min.

### `src/components/academy/GlobalAiMentorWidget.tsx` — modified
Added `TODO(mentor-memory)` comments on both localStorage `useEffect` blocks to mark them as temporary UI fallbacks. No behavioral change — localStorage still used as-is until Phase 4 adoption is complete.

---

## Memory categories and importance levels

| Category | Meaning |
|---|---|
| `academy` | Quiz scores, term completion, lesson insights |
| `trading` | Simulator decisions, patterns, outcomes |
| `psychology` | Emotional state, FOMO/fear/revenge patterns |
| `risk` | Risk management behaviors observed |
| `discipline` | Discipline score trends |
| `goals` | Stated learning/career goals |
| `career` | Career ambitions in crypto/finance |
| `mistakes` | Documented repeated errors |

| Importance | Level |
|---|---|
| `1` | Minor — background context |
| `5` | Normal — standard memory |
| `10` | Important — surfaces first in prompts |
| `100` | Critical — always injected, prefixed `[CRITICAL]` |

---

## Security impact

| Concern | Mitigation |
|---|---|
| Cross-student memory access | All DB queries include `WHERE student_id = $N::uuid` — server-enforced |
| Anonymous access | All endpoints require `session.studentId` from canonical session |
| Secret exposure in errors | DB errors return only `"storage_unavailable"` — no stack traces or SQL |
| Text injection via content | `cleanText()` + max-length caps on all user input before DB insert |
| Rate limiting | Read: 60/min, Write: 20/min, Delete: 20/min, Insights: 30/min |
| Old `NEXT_LOCALE` cookie | No longer issued; `tecpey_locale` is the new canonical cookie |
| Conversation pruning | Auto-prune keeps max 200 turns per student — no unbounded growth |
| Insight generation cost | `generateMentorInsights` is purely local computation — no AI call |

---

## Remaining risks

| Risk | Severity | Notes |
|---|---|---|
| `getCanonicalSession` called in every mentor turn | Low | Small overhead; mitigated by connection pool |
| `mentor_profiles.weak_areas` not yet auto-updated from quiz results | Medium | Currently always `{}` until manually set via future phase |
| Client-sent localStorage history still injected into prompt | Low | Intended as UI fallback; labeled with TODO for removal |
| No TTL enforcement on `mentor_memories.expires_at` | Low | Column exists; a cron job needs to run `DELETE WHERE expires_at < NOW()` |
| Conversation persistence failure silently swallowed | Acceptable | Fire-and-forget design; user experience unaffected |
| `mentor_insights` content is Farsi-only | Low | `buildContextPrompt` generates Farsi; EN prompt still readable by model |

---

## Context injection flow (per mentor request)

```
Request arrives (authenticated)
        │
        ▼
getMentorContext(studentId)  ←── parallel with getOrCreateMentorProfile()
        │
        ├── mentor_profiles          (level, risk, goal, weak/strong areas)
        ├── mentor_conversations     (last 12 turns, chronological)
        ├── mentor_memories          (top 20 by importance)
        ├── academy_term_progress    (all terms)
        └── academy_trading_arena_trades  (last 20, aggregated)
        │
        ▼
buildContextPrompt(ctx)  →  injected into OpenAI system instructions
        │
        ▼
AI generates personalized response
        │
        ├── saveMentorConversation("user", question)    [non-blocking]
        └── saveMentorConversation("assistant", answer) [non-blocking]
```

---

## API reference

```
GET  /api/mentor-memory                    – list memories (auth required)
POST /api/mentor-memory                    – save a memory (auth required)
DEL  /api/mentor-memory?id=<uuid>          – delete a memory (auth required, own only)

GET  /api/mentor-insights                  – list insight snapshots
GET  /api/mentor-insights?generate=1      – generate + return fresh insight

GET  /api/academy/mentor-memory            – legacy: returns computed summary from term+trade data
```

---

## Recommended next phase

**Phase 5 — Mentor Profile Auto-Update:**
- After each quiz submission, auto-update `mentor_profiles.weak_areas`, `confidence_score`, and `level` based on term progress data.
- After each trading-arena trade, auto-update `risk_profile` and save a `risk` or `discipline` memory if thresholds are crossed.
- Wire `GET /api/mentor-insights` into the mentor widget sidebar to show the student their own insight history.
- Remove `TODO(mentor-memory)` localStorage reads after the 30-day cutover period.
