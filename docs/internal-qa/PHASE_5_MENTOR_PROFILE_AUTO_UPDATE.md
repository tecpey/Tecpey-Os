# Phase 5 — Mentor Profile Auto-Update + Arena/Quiz Signal Integration

**Date:** 2026-06-24
**Status:** Complete
**TypeScript:** 0 errors | ESLint: 0 errors (111 warnings, unchanged from Phase 4)

---

## Goal

Automatically populate and update `mentor_profiles` from real user behavior — quiz results, academy term progress, trading arena activity, mentor conversation patterns — replacing the static default values that Phase 4 left in place.

---

## Signals collected

### Academy signals (`collectAcademySignals`)
Source tables: `academy_term_progress`, `mentor_challenge_attempts`

| Signal | Derivation |
|---|---|
| `completedTerms` | Count of rows with `status = 'passed'` |
| `avgPassedPercent` | Average `percent` across passed terms |
| `failedTermNumbers` | Term numbers where `status = 'attempted'` (not yet passed) |
| `weakTopics` | `lesson_slug` values from `mentor_challenge_attempts` where `correct/total < 50%` and `total >= 2` |
| `challengeAccuracy` | `correct / total * 100` across all challenge attempts |
| `totalChallengeAttempts` | Total rows in `mentor_challenge_attempts` for this student |

### Trading signals (`collectTradingSignals`)
Source table: `academy_trading_arena_trades` (last 50 trades)

| Signal | Derivation |
|---|---|
| `tradeCount` | Row count |
| `avgRisk` | Average `risk_percent` |
| `avgDiscipline` | Average `discipline_score` |
| `riskFlagRate` | Proportion of trades where `risk_flag = true` (0.0–1.0) |
| `emotionFlags` | Regex scan of `emotion` column: `revenge`, `fear`, `greed`, `fomo` |
| `journalQuality` | `min(100, avg(len(entry_reason) + len(risk_plan)) / 200 * 100)` |
| `repeatedMistakes` | Derived tags: `over_risk`, `no_plan`, `emotional_entry`, `discipline_breach` |

### Conversation signals (`collectConversationSignals`)
Source table: `mentor_conversations` (last 60 user turns)

| Signal | Derivation |
|---|---|
| `primaryGoal` | First matching keyword in full conversation text |
| `psychologyFlags` | Regex: `fomo`, `fear`, `greed`, `revenge` in Farsi + English |
| `careerIntent` | Presence of career/professional trading keywords |
| `repeatedThemes` | Which topic categories appear (risk, TA, security, psychology, fundamentals) |
| `avgUserMessageLength` | Average character count per user turn |

---

## Profile fields computed and written

All fields written to `mentor_profiles` via upsert in `applyMentorProfileUpdate`:

| Field | Logic |
|---|---|
| `level` | `beginner` → `intermediate` (≥2 terms or ≥65% avg) → `advanced` (≥5 terms and ≥70%) |
| `risk_profile` | `high` if avgRisk>5% or riskFlagRate>35%; `low` if avgRisk<2% and riskFlagRate<10%; else `medium` |
| `confidence_score` | 40% from avgPassedPercent + 40% from avgDiscipline + 20% from completion bonus (4 pts/term, capped at 5 terms) |
| `discipline_score` | avgDiscipline from trading if ≥3 trades; else challengeAccuracy from quizzes |
| `learning_style` | `analytical` if ≥10 challenge attempts and <5 trades; `practical` if ≥5 trades and <5 attempts; else `mixed` |
| `weak_areas` | Array of tag strings: `quiz_review`, `term_N_retry`, `topic_<slug>`, `risk_control`, `risk_discipline`, `fomo_management`, `revenge_trading`, `journal_quality`, `emotional_control` |
| `strong_areas` | Array of tag strings: `learning_consistency`, `trade_discipline`, `journal_quality`, `clean_risk_record`, `quiz_mastery`, `practice_commitment` |
| `primary_goal` | Tag string from conversation keywords; fallback: `safe_spot_trading` |
| `updated_at` | Timestamp of the upsert |

---

## Schema additions

Two new columns added to `mentor_profiles` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `src/lib/db-schema.ts` (safe to run on existing deployments):

```sql
ALTER TABLE mentor_profiles ADD COLUMN IF NOT EXISTS discipline_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mentor_profiles ADD COLUMN IF NOT EXISTS learning_style TEXT NOT NULL DEFAULT 'mixed';
```

---

## Files changed

### `src/lib/db-schema.ts` — modified
Two `ALTER TABLE` statements added after the `CREATE TABLE IF NOT EXISTS mentor_profiles` block.

### `src/lib/mentor-memory.ts` — modified
- `MentorProfile` type extended with `disciplineScore: number` and `learningStyle: string`.
- Both `getOrCreateMentorProfile` and `getMentorContext` SELECT lists updated to include the new columns.
- `buildContextPrompt` updated to emit `discipline_score` and `learning_style` in the AI context block.

### `src/lib/mentor-signals.ts` — **new**
Canonical signal collection and profile computation library.

| Export | Description |
|---|---|
| `collectAcademySignals(studentId)` | Reads term progress + challenge attempts, returns `AcademySignals` |
| `collectTradingSignals(studentId)` | Reads trading arena trades, returns `TradingSignals` |
| `collectConversationSignals(studentId)` | Scans mentor conversation turns, returns `ConversationSignals` |
| `computeMentorProfileUpdate(academy, trading, conversation)` | Pure function — derives `MentorProfileUpdate` from signals, no DB writes |
| `applyMentorProfileUpdate(studentId)` | Runs all three collectors in parallel, computes update, upserts `mentor_profiles` |

### `src/app/api/mentor-insights/route.ts` — modified
`?generate=1` now:
1. Calls `applyMentorProfileUpdate(studentId)` to recompute all signals and flush to DB.
2. Calls `generateMentorInsights(studentId)` to produce a text snapshot.
3. Returns both `insights[]` and the full `profile` snapshot in a single response.

### `src/app/api/mentor-profile/recompute/route.ts` — **new**
`POST /api/mentor-profile/recompute`
- Auth: `session.studentId` from canonical session — callers cannot target other students.
- Rate-limited: 6 requests/min (full DB scan per call).
- Returns: computed `MentorProfileUpdate` on success, `503` when DB unavailable.

---

## API reference

```
POST /api/mentor-profile/recompute           – recompute own mentor profile from live signals
GET  /api/mentor-insights                    – return insights + profile snapshot (read-only)
GET  /api/mentor-insights?generate=1         – recompute profile + generate fresh insight
```

---

## Signal → weak_area tag mapping (for UI localization)

| Tag | Trigger condition |
|---|---|
| `quiz_review` | avgPassedPercent < 70 and completedTerms > 0 |
| `term_N_retry` | Term N has status=attempted but not passed |
| `topic_<slug>` | Lesson slug with <50% success rate in challenge attempts |
| `risk_control` | avgRisk > 5% |
| `risk_discipline` | riskFlagRate > 30% |
| `fomo_management` | "fomo" detected in conversation text |
| `revenge_trading` | "revenge" detected in conversation text |
| `journal_quality` | journalQuality < 40 with ≥3 trades |
| `emotional_control` | "emotional_entry" in repeatedMistakes |

> **TODO(i18n-mentor):** Weak area and strong area tags are currently stored in English tag format.
> A future phase should add a locale-aware lookup table (e.g. `fa: { quiz_review: "مرور آزمون" }`)
> for display in student-facing UI. The AI prompt injected by `buildContextPrompt` renders them
> in the Farsi context block and the model translates them naturally.

---

## Security impact

| Concern | Mitigation |
|---|---|
| Cross-student profile update | `applyMentorProfileUpdate` takes only `studentId` from `session.studentId` — never from request body |
| Anonymous access | All endpoints require `session.studentId` |
| DB error exposure | All errors return generic `"storage_unavailable"` — no stack traces or SQL |
| Text from conversations | `cleanText()` applied to `primaryGoal` before DB write; tags are enum-like strings not from user input |
| Rate limiting | Recompute: 6/min; Insights: 30/min |
| Signal collection failure | Each collector returns an empty struct on DB unavailable — never throws into the caller |

---

## Remaining risks

| Risk | Severity | Notes |
|---|---|---|
| `weak_topics` from challenge attempts not yet locale-specific | Low | Uses `lesson_slug` (locale-neutral) |
| No TTL enforcement on `mentor_memories.expires_at` | Low | Cron job needed; column exists since Phase 4 |
| `collectConversationSignals` reads only last 60 turns | Low | Window may miss older goal statements |
| Profile recompute is a full scan — expensive at high student counts | Medium | Rate-limited; consider partial update triggers in Phase 6 |
| `learning_style` heuristic is coarse | Low | Adequate for MVP; can be refined with LLM classification later |
| localStorage fallback still in widget | Low | TODO comment placed in Phase 4; target removal after 30-day window |

---

## Next recommended phase

**Phase 6 — Event-Driven Profile Updates:**
- Hook into quiz submission (`/api/academy-term-progress POST`) to call `applyMentorProfileUpdate` after each test.
- Hook into trading arena submission (`/api/trading-arena POST`) to call `applyMentorProfileUpdate` after each trade.
- This eliminates the need for explicit `?generate=1` calls and keeps profiles always fresh.
- Wire `GET /api/mentor-insights?generate=0` into the mentor widget sidebar so students can see their profile.
- Implement the `i18n-mentor` TODO: locale-aware weak/strong area label lookup.
