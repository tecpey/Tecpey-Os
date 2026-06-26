# Phase 7 — Mentor Widget Profile Integration

**Date:** 2026-06-24
**Status:** Complete
**TypeScript:** 0 errors | ESLint: 0 errors, 111 warnings (unchanged from Phase 6)

---

## Goal

Migrate `GlobalAiMentorWidget` from client-side localStorage profile to server-side `mentor_profiles` and `mentor_insights`, and surface a new server-driven "Learning DNA" section showing weak areas, strong areas, learning style, confidence, and discipline.

---

## Files changed

### `src/hooks/useMentorInsights.ts` — **new** (~115 lines)

Custom hook for fetching `GET /api/mentor-insights`.

| Feature | Detail |
|---|---|
| Stale-while-revalidate | Module-level cache (5-min TTL); stale data shown immediately while revalidating in background |
| Loading state | `loading: true` only on first fetch when no stale data; hidden during background revalidation |
| Error state | `error: "unavailable"` on 401/429/network failure; widget handles gracefully |
| AbortController | Cleans up in-flight request on unmount |
| Retry | `retry()` bypasses cache and triggers fresh fetch |
| No duplicate fetches | Module-level cache shared across all mounted instances |

**Types exported:**
- `MentorInsightsProfile` — the server profile shape
- `MentorInsightItem` — a single insight snapshot
- `MentorInsightsData` — `{ profile, insights }`
- `UseMentorInsightsReturn` — `{ data, loading, error, retry }`

**Security:** No secrets, no tokens. Fetch is a plain GET to the app's own API. 401 returns `null` silently.

---

### `src/components/academy/GlobalAiMentorWidget.tsx` — modified (~+90 lines / -30 lines)

**Imports added:**
- `Brain` from `lucide-react` (Learning DNA icon)
- `useMentorInsights` from `@/hooks/useMentorInsights`

**Constants removed:**
- `profileKey` (`tecpey-ai-mentor-dna-${locale}`) — no longer needed

**Helpers added** (before component function):
- `TAG_LABELS: Record<string, [string, string]>` — bilingual fa/en label map for all known server tags (weak areas, strong areas, primary goal tags)
- `formatMentorTag(tag, locale)` — converts a server tag string to human-readable label; handles `term_N_retry` and `topic_<slug>` patterns; prettifies unknown tags as fallback; never throws
- `LEARNING_STYLE_LABELS` — bilingual map for `analytical | practical | mixed`
- `formatLearningStyle(style, locale)` — converts learning style tag to display label

**Effects removed (TODO #2 + profile write resolved):**
- `useEffect` that read localStorage profile (`profileKey`) — **resolved**, was `TODO(mentor-memory)`
- `useEffect` that wrote profile to localStorage — **removed** (no longer persisting profile to localStorage)

**Effects added:**
- One-time server sync: when `serverProfile` arrives from hook, copies `level`, `riskProfile`, `weakAreas[0]`, `primaryGoal`, `confidenceScore` into local `profile` state. Protected by `serverSyncedRef` — runs once only, leaving subsequent user button-clicks (level selector, risk selector) as ephemeral local overrides.

**`ask()` payload change:**
- `weakAreas` now sends `serverProfile?.weakAreas` (all areas) instead of `[profile.weakArea]` (one)
- `confidence`, `riskProfile`, `goal`, `level` prefer server values with local fallback

**JSX changes:**
- Existing "Learning profile" panel: `profile.weakArea` and `profile.goal` wrapped in `formatMentorTag(...)` — prevents raw server tag strings ("risk_control", "safe_spot_trading") appearing in UI
- `mentorQuickActions`: formatted `weakLabel` used in suggested question strings

**Learning DNA section (new, in empty-state panel):**
- Renders only when `serverProfile !== null` and at least one area exists
- Shows: Strong Areas (green pills), Weak Areas (amber pills), Learning Style (cyan pill), Confidence % (bar), Discipline % (bar)
- All labels via `formatMentorTag` / `formatLearningStyle` — no hardcoded locale assumptions
- RTL-compatible via parent `dir={isEn ? "ltr" : "rtl"}` already on container
- Graceful degradation: shows "Mentor profile unavailable" note when `insightsError` is set and no server data is available
- Hidden when chat history exists (pre-existing empty-state design preserved)

**Preserved (unchanged):**
- Chat history localStorage read/write (2 effects — see TODO audit below)
- All animations (typing stream, scroll)
- All existing UI layout and component structure
- Level selector buttons (still work as ephemeral session overrides)
- Risk profile buttons (same)
- Academy profile gate and display name fetch
- Telegram support link

---

## TODO(mentor-memory) audit

| Location | Status | Detail |
|---|---|---|
| `GlobalAiMentorWidget.tsx:315` — localStorage profile read | **RESOLVED** (Phase 7) | Effect removed; replaced with server sync from `useMentorInsights` |
| `GlobalAiMentorWidget.tsx` — localStorage profile write | **RESOLVED** (Phase 7) | Effect removed; profile is no longer written to localStorage |
| `GlobalAiMentorWidget.tsx:315` — localStorage **history** read | **REMAINING** (intentional) | The 30-day condition ("Phase 4 must be live 30+ days, all sessions carry a studentId") has not yet been met. History stays in localStorage until Phase 8. |
| `ai-mentor/route.ts:226` — client-sent history fallback | **REMAINING** (intentional) | Same condition. Server-side conversation context from Phase 4 supplements but does not yet replace client-sent history. |

**Summary:** 2 resolved, 2 remaining (both intentionally guarded by the 30-day adoption condition), 0 deprecated.

---

## Learning DNA tag label coverage

All tags currently produced by `mentor-signals.ts` are mapped:

| Tag | Farsi | English |
|---|---|---|
| `quiz_review` | مرور آزمون | Quiz Review |
| `risk_control` | کنترل ریسک | Risk Control |
| `risk_discipline` | انضباط ریسک | Risk Discipline |
| `fomo_management` | کنترل FOMO | FOMO Management |
| `revenge_trading` | معامله انتقامی | Revenge Trading |
| `journal_quality` | کیفیت ژورنال | Journal Quality |
| `emotional_control` | کنترل احساسات | Emotional Control |
| `learning_consistency` | ثبات یادگیری | Learning Consistency |
| `trade_discipline` | انضباط معامله | Trade Discipline |
| `clean_risk_record` | ریسک پاک | Clean Risk Record |
| `quiz_mastery` | تسلط آزمون | Quiz Mastery |
| `practice_commitment` | تعهد تمرین | Practice Commitment |
| `safe_spot_trading` | ورود امن به معامله اسپات | Safe Spot Trading |
| `passive_income` | درآمد غیرفعال | Passive Income |
| `futures_trading` | معامله فیوچرز | Futures Trading |
| `academy_completion` | تکمیل آکادمی | Academy Completion |
| `professional_trading` | معامله حرفه‌ای | Professional Trading |
| `term_N_retry` | مرور ترم N | Retry Term N |
| `topic_<slug>` | (slug as-is) | (slug as-is) |
| unknown | prettified | Prettified |

Adding a new tag in `mentor-signals.ts` requires a matching entry in `TAG_LABELS` in the widget.

---

## Security impact

| Concern | Assessment |
|---|---|
| New network request | GET `/api/mentor-insights` — existing authenticated endpoint, no new attack surface |
| Data exposed in client | Only the student's own profile; auth enforced server-side; no cross-student access |
| Module-level cache | In-process memory only; cleared on page reload; not shared across users |
| Tag injection | All tags are enum-like strings from server DB (set by internal `mentor-signals.ts`); `formatMentorTag` never passes raw content to `dangerouslySetInnerHTML` |

---

## Backward compatibility risks

| Risk | Severity | Notes |
|---|---|---|
| Server profile not yet computed (new student) | Low | Widget falls back to `defaultMentorProfile(locale)` until first server sync; UI functional immediately |
| `learningStyle` tag not in `LEARNING_STYLE_LABELS` | Low | `formatLearningStyle` returns raw string as fallback |
| New tag from `mentor-signals.ts` not in `TAG_LABELS` | Low | `formatMentorTag` prettifies unknown tags gracefully ("risk_foo" → "Risk Foo") |
| Server unavailable | Low | `insightsError: "unavailable"` triggers graceful "Mentor profile unavailable" note; chat still works |
| `completedTerms` in `ask()` payload | Low | Stays as `[1]` default from `defaultMentorProfile`; server already has real term data via `getMentorContext` |

---

## Production readiness

| Dimension | Status |
|---|---|
| localStorage fully retired for profile | ✅ Yes |
| Mentor profile server-driven | ✅ Yes — level, risk, weakAreas, strongAreas, learningStyle, confidenceScore, disciplineScore |
| Mentor chat history server-driven | ❌ Not yet (30-day condition pending) |
| Learning DNA production ready | ✅ Yes — RTL, bilingual, graceful empty/error states |
| TypeScript clean | ✅ 0 errors |
| ESLint clean | ✅ 0 new warnings |

---

## Remaining risks

| Risk | Severity | Notes |
|---|---|---|
| First-session profile is empty (no signals yet) | Medium | New student sees default values until first quiz/trade/AI turn triggers Phase 6 events and recomputes |
| `topic_<slug>` tags displayed as English slugs in Farsi UI | Low | Lesson slugs are locale-neutral; a Phase 8 lesson-title lookup could resolve this |
| Chat history still in localStorage | Medium | Privacy risk: chat persists in browser storage. Phase 8 should retire localStorage history and use `mentor_conversations` |
| Server sync `useRef` not reset on locale change | Low | If user switches locale, `serverSyncedRef.current` stays `true` and the new locale's default profile is not re-synced from server. Unlikely in practice (locale switch reloads the route). |

---

## Next recommended phase

**Phase 8 — Retire localStorage Chat History:**
- Fetch last N messages from `GET /api/mentor-memory?category=conversation` (or a new `GET /api/mentor-conversations`) to pre-populate widget chat history on open.
- Remove localStorage history read/write effects in `GlobalAiMentorWidget` once Phase 4 has been live for 30+ days.
- Resolve both remaining `TODO(mentor-memory)` entries.
- Add TTL cleanup for expired `mentor_memories.expires_at` rows (cron job).
- Implement locale-aware lesson-title lookup for `topic_<slug>` tag display.
