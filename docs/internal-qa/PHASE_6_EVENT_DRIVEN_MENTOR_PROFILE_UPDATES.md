# Phase 6 — Event-Driven Mentor Profile Updates

**Date:** 2026-06-24
**Status:** Complete
**TypeScript:** 0 errors | ESLint: 0 errors (111 warnings, unchanged)

---

## Goal

Hook `applyMentorProfileUpdate` into real user-action routes so `mentor_profiles` is kept fresh automatically — without requiring the student or client to call `?generate=1` or `POST /api/mentor-profile/recompute` explicitly.

---

## Pre-coding inspection findings

| Route | File | Relevant exit points |
|---|---|---|
| Quiz submission | `src/app/api/academy-term-progress/route.ts` | Two success returns: local-fallback path (line ~197) and DB-success path (line ~200) |
| Trading arena write | `src/app/api/trading-arena/route.ts` | Two success returns: DB-success (one-line guard+return) and local-fallback |
| AI mentor response | `src/app/api/ai-mentor/route.ts` | One success path (after `extractOutputText`); three fallback paths intentionally excluded |

**Decision**: hooks fire only on actual-success exits, not on error returns, rate-limit blocks, or AI fallbacks. This prevents unnecessary recomputes when nothing meaningful changed.

---

## Files changed

### `src/lib/mentor-events.ts` — **new**

Thin dispatcher that wraps `applyMentorProfileUpdate` in a safe, non-blocking call.

| Export | Signature | Behavior |
|---|---|---|
| `runMentorProfileUpdateSafely` | `async (studentId, reason) → void` | Awaits the update; catches and logs all errors; never throws |
| `scheduleMentorProfileUpdate` | `(studentId, reason) → void` | Calls `void runMentorProfileUpdateSafely(...)` — returns immediately |

Logging format (safe — no message content, no secrets):
```
[mentor-profile] updated | studentId=<uuid> reason=<reason>         // dev only
[mentor-profile] update failed | studentId=<uuid> reason=<reason> err=<first 120 chars of error message>
```

A `TODO(mentor-queue)` comment marks exactly where a durable queue enqueue call should replace the in-process `void` when infrastructure warrants it.

### `src/app/api/academy-term-progress/route.ts` — modified
- Import: `scheduleMentorProfileUpdate` from `@/lib/mentor-events`
- Hook added before local-fallback return → reason: `"academy_progress_updated"`
- Hook added before DB-success return → reason: `"quiz_submitted"`

### `src/app/api/trading-arena/route.ts` — modified
- Import: `scheduleMentorProfileUpdate` from `@/lib/mentor-events`
- DB-success guard (`if (result.enabled && result.value) return ...`) expanded to a block; hook inserted before return → reason: `"trading_trade_created"`
- Local-fallback return: hook inserted before return → reason: `"trading_trade_created"`

### `src/app/api/ai-mentor/route.ts` — modified
- Import: `scheduleMentorProfileUpdate` from `@/lib/mentor-events`
- `void saveMentorConversation(...)` and `scheduleMentorProfileUpdate(...)` grouped into a single `if (studentId)` block for clarity
- Hook fires only on the live-AI-success path → reason: `"mentor_conversation_saved"`
- Fallback paths (`guided_from_academy`, `safe_guidance`, `available`) do **not** trigger a recompute — no new behavioral data was produced

---

## Event reasons

| Reason | Fired from | Trigger condition |
|---|---|---|
| `quiz_submitted` | `academy-term-progress` POST | Quiz DB write succeeded and `result.value.blocked === false` |
| `academy_progress_updated` | `academy-term-progress` POST | Quiz local-file write succeeded (dev-only path) |
| `trading_trade_created` | `trading-arena` POST | Trade DB or local-file write succeeded |
| `mentor_conversation_saved` | `ai-mentor` POST | AI returned a live answer (not a fallback) |

---

## Blocking vs non-blocking

| Route | Blocking? | Mechanism |
|---|---|---|
| `academy-term-progress` POST | **Non-blocking** | `scheduleMentorProfileUpdate` returns `void` immediately; update runs as background microtask |
| `trading-arena` POST | **Non-blocking** | Same |
| `ai-mentor` POST | **Non-blocking** | Same; conversation saves are also non-blocking `void` |

The HTTP response is returned before the profile update completes. Latency impact on the student: **zero**.

---

## Safety behavior if mentor update fails

1. `runMentorProfileUpdateSafely` catches all thrown errors inside a `try/catch`.
2. The error is logged with `console.error` (studentId + reason + first 120 chars of message — no SQL, no secrets, no user content).
3. The calling route is unaffected — it has already returned its response.
4. The profile remains at its last successfully computed state.
5. The next event trigger (next quiz, next trade, next AI reply) will retry automatically.

---

## Timing / eventual-consistency note

For `ai-mentor`: `saveMentorConversation` is itself fire-and-forget. The profile update is scheduled at the same moment, so the current conversation turns may not yet be in the DB when `collectConversationSignals` runs. This is acceptable:
- Conversation signals are cumulative — earlier turns are already persisted.
- The current turn will be present the next time the profile is recomputed.
- This keeps the pattern simple without coordination overhead.

---

## API reference (unchanged from Phase 5)

```
POST /api/mentor-profile/recompute           – explicit manual recompute (6/min)
GET  /api/mentor-insights                    – read-only insights + profile.updatedAt
GET  /api/mentor-insights?generate=1         – manual recompute + fresh insight snapshot
```

Automatic recomputes via Phase 6 events are additive — the manual endpoints remain fully functional.

---

## Remaining risks

| Risk | Severity | Notes |
|---|---|---|
| In-process `void` is not durable | Medium | If the server process dies mid-update, the recompute is lost. The next event retriggers it. Acceptable until queue infrastructure is added. |
| No deduplication / debounce | Low | A student who submits 3 trades rapidly will trigger 3 parallel recomputes. Each is a fast 3-query parallel read. No correctness issue; last write wins. |
| `mentor_conversation_saved` fires on every successful AI reply | Low | Each recompute reads ~60 conversation turns + 50 trades + 200 challenge attempts. Cost is low; rate-limited by the AI mentor's own 12 req/min limit. |
| `TODO(mentor-queue)` not yet implemented | Low | Acceptable for current scale; revisit when student count exceeds ~10k active/day. |
| Weak-area tags are locale-neutral strings | Low | `TODO(i18n-mentor)` in `mentor-signals.ts` marks the translation gap. |

---

## Next recommended phase

**Phase 7 — Mentor Widget Profile Integration:**
- Fetch `GET /api/mentor-insights` (without `?generate=1`) in `GlobalAiMentorWidget` to replace localStorage profile with server-side `mentor_profiles` data.
- Retire the `TODO(mentor-memory)` localStorage `useEffect` blocks in the widget.
- Display `weakAreas` and `strongAreas` in the widget sidebar as a "Your Learning DNA" section.
- Implement the `TODO(i18n-mentor)` locale-aware tag label lookup for Farsi UI display.
