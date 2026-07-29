# TecPey Community & Social Learning Layer — v1.0

**Phase 18 | Privacy-First Educational Community**

---

## Overview

The Community Learning Layer transforms TecPey Academy from a solo learning experience into structured, accountability-driven group learning. Every design decision prioritizes student safety, educational integrity, and privacy.

**What this is NOT:**
- Not a social network
- Not a messaging platform
- Not a profit-competition leaderboard
- Not a place to share real trading results

**What it IS:**
- Anonymous behavioral accountability system
- Weekly discipline challenges with simulator integration
- Structured study group interest matching
- Opt-in educational journal sharing
- Consent-gated instructor review dashboard

---

## Architecture

### Data Model

All community data is stored in localStorage (client-side only in Phase 18). No backend calls are made for community features.

**Storage keys:**
- `tecpey-community-profile` — profile, privacy settings, group interests
- `tecpey-challenge-participation` — challenge history

**Shared data sources (read-only):**
- `tecpey-trading-arena` — trading stats for leaderboard scoring
- `tecpey-trading-journal` — journal completion rate
- Academy progress state — lesson completion

---

## Privacy Architecture

### Default State: Private

Every privacy setting defaults to `false` (private):

```typescript
export interface CommunityPrivacySettings {
  leaderboardVisible: boolean;      // default: false
  journalSharingEnabled: boolean;   // default: false
  mentorReviewConsent: boolean;     // default: false
  challengeParticipation: boolean;  // default: true (low-risk)
  studyGroupInterest: boolean;      // default: false
}
```

### Anonymous IDs

Students receive a randomly generated anonymous ID (`T-XXXXXX`) instead of their real identity appearing anywhere in leaderboards or shared content. The format uses a 6-character safe charset (no confusable characters like 0/O, 1/I/l).

### PII Sanitization

Before any journal entry can be shared, it passes through `sanitizeForSharing()`:
- Truncated to 200 chars max per field
- No balance, P&L, or financial data included
- Only behavioral tags and reflection text shared

---

## Leaderboard System

### Anti-Profit Model (Critical)

**Profit-only ranking is forbidden by design.** Leaderboard scores are computed exclusively from behavioral metrics:

| Category | Scoring Formula |
|---|---|
| Discipline | `stopLossRate × 60 + streakBonus × 40` |
| Consistency | `activeDays/30 × 50 + streak × 50` |
| Scenario Mastery | `scenariosPassed/6 × 100` |
| Journal Quality | `journalCompletionRate × 100` |
| Risk Management | `stopLossRate × 60 + (1 - overRiskRate) × 40` |
| Overall | Weighted average of all above |

### Demo Peers

Since the platform is pre-backend, leaderboard entries include 12 deterministic demo peers per category. Generated via LCG seeded on the category name — stable across page loads. All demo entries are clearly labeled `isDemo: true` and display a "نمایشی" badge.

---

## Weekly Challenges

5 challenges cycling weekly based on `Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) % 5`.

| Challenge | Focus | Criteria |
|---|---|---|
| چالش حد ضرر هفته | Discipline | ≥80% stop-loss rate over ≥3 trades |
| چالش صبر و پرهیز از FOMO | Patience | Pass FOMO scenario |
| چالش ژورنال‌نویسی | Reflection | ≥80% journal completion rate |
| چالش ثبات هفتگی | Consistency | 5-day streak |
| چالش تسلط سناریو | Knowledge | Pass beginner BTC scenario |

**Safety rule embedded in every challenge:** A `responsibleTradingNote` field explicitly states no real capital is involved.

---

## Study Groups

5 static demo groups (no backend required):

| Group | Focus | Level | Members |
|---|---|---|---|
| مبانی بیت‌کوین | Bitcoin basics | Beginner | 24 |
| مسترهای ریسک | Risk management | Intermediate | 18 |
| روانشناسی معامله | Trading psychology | Intermediate | 31 |
| انضباط اول | Behavioral discipline | All levels | 42 |
| تحلیل پیشرفته | Advanced analysis | Advanced | 12 |

Group interest requires explicit opt-in (`studyGroupInterest: true`). Expressed interests are stored locally for backend migration.

**No real-time chat. No direct messages.**

---

## Peer Journal Sharing

- Opt-in via toggle (default off)
- Sanitized before display: no PII, no balance data, truncated reflections
- Includes mentor note generated from behavioral flags
- Demo entries (`isDemoEntry: true`) clearly labeled

---

## Instructor Dashboard

Three-stage access flow:
1. Profile required (no anonymous access)
2. Explicit consent gate (`mentorReviewConsent: true`)
3. Consent screens list exactly what will be visible

Shared data on consent:
- Overall behavioral score
- 3 weakest + 2 strongest dimensions
- Risk pattern bars (stop-loss rate, over-risk, revenge, impulse)
- Scenario progress (X/6 passed)
- Weak knowledge map nodes

**Never shared:** exact balance, P&L, private notes, real name.

---

## Community Safety Rules

Embedded in every leaderboard view:

1. هرگز نتایج معاملات واقعی را به اشتراک نگذارید
2. ارائه توصیه سرمایه‌گذاری ممنوع است
3. ادعای سود بالا ممنوع است
4. تبلیغ خدمات خارجی ممنوع است
5. درخواست اطلاعات مالی شخصی ممنوع است
6. رفتار توهین‌آمیز ممنوع است
7. این جامعه برای یادگیری است، نه تبادل سیگنال

---

## Routes

| Route | Component | Auth Required |
|---|---|---|
| `/academy/community` | `CommunityHub` | No |
| `/academy/community/leaderboards` | `LeaderboardView` | Profile (optional) |
| `/academy/community/challenges` | `ChallengeCenter` | No |
| `/academy/community/groups` | `StudyGroups` | Profile + privacy opt-in |
| `/academy/community/journals` | `PeerJournals` | Profile + privacy opt-in |
| `/academy/community/instructor` | `InstructorDashboard` | Profile + consent |

---

## Phase 19 Migration Path

When backend is ready:
1. POST community profile to API on creation/update
2. Replace LCG demo peers with real leaderboard data
3. Activate study group membership flow
4. Backend-sync challenge completions for cross-device persistence
5. Moderation layer before journal entries go live

LocalStorage data keys are already consistent with what a migration would need.
