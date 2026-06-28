# TecPey — Dependency Map

**Phase 19 | Module Dependency Graph**
**Date:** 2026-06-28

This document maps dependencies between modules, files, and data stores. Circular dependencies are flagged. Missing abstractions are identified.

---

## 1. Library Dependencies (src/lib/)

### 1.1 Auth & Session Cluster

```
auth-session.ts
    ← imports → jose (external)
    ← imports → academy-auth.ts
    ← imports → academy-session.ts
    ← imports → session.ts

academy-auth.ts
    ← imports → jose (external)

academy-session.ts
    ← imports → jose (external)
    ← imports → db.ts  [via getStudentById query inline]

session.ts
    ← imports → jose (external)
    ← imports → next/headers ("use server")

admin-auth.ts
    ← imports → [no imports — standalone]
```

**Issues:**
- `auth-session.ts` imports from both academy-auth and academy-session — it is a reconciliation layer, not a clean abstraction
- `session.ts` uses `"use server"` making it Node.js only; `auth-session.ts` is edge-compatible — mixed deployment models

---

### 1.2 Database Cluster

```
db.ts
    ← imports → db-schema.ts
    ← exports → withDb()

db-schema.ts
    ← imports → student-cartax.ts      [calls ensureStudentCartaxTables]
    ← imports → phase5-achievement-engine.ts [calls ensurePhase5Tables]
    ← imports → academy-certificates.ts [calls ensureCertificateTables]

student-cartax.ts
    ← imports → [direct pg queries, no withDb()]
    ← exports → ensureStudentCartaxTables(), cleanText()

phase5-achievement-engine.ts
    ← imports → db.ts [uses withDb()]
    ← imports → session.ts
    ← exports → ensurePhase5Tables(), various achievement functions

academy-certificates.ts
    ← imports → db.ts [uses withDb()]
    ← imports → jose (for certificate signing)
    ← exports → ensureCertificateTables(), issueCertificate(), verifyCertificate()
```

**Issues:**
- `student-cartax.ts` does NOT use `withDb()` — direct pg usage outside pool
- `community-career.ts` (not shown above) uses `new Client()` entirely outside pool
- `db-schema.ts` calls three separate "ensure" functions — schema definition is distributed across 3+ files

---

### 1.3 Behavioral Intelligence Cluster

```
behavioral-engine.ts
    ← imports → trading-dna.ts
    ← imports → academy-progress.ts [reads localStorage]
    ← imports → knowledge-graph.ts
    ← imports → [localStorage directly in collectInputs()]
    ← exports → computeBehavioralSnapshot(), DIMENSION_LABELS

trading-dna.ts
    ← imports → trading-arena.ts [reads localStorage]
    ← imports → trading-journal.ts [reads localStorage]
    ← exports → collectTradingDNASignals(), blendWithTrading()

coaching-engine.ts
    ← imports → behavioral-engine.ts
    ← exports → generateCoachingPlan(), getDailyCoachingCard()

smart-review.ts
    ← imports → academy-progress.ts [reads localStorage]
    ← imports → knowledge-graph.ts
    ← exports → getReviewQueue()

spaced-repetition.ts
    ← imports → [localStorage directly]
    ← exports → loadDeck(), saveDeck(), scheduleNextReview()
```

**Issues:**
- `behavioral-engine.ts` → `localStorage` direct read = client-only, untestable server-side
- `trading-dna.ts` → `trading-arena.ts` → `localStorage` = same issue
- No server-side data source. All behavioral intelligence is ephemeral and per-browser.

---

### 1.4 Community Cluster

```
community-profile.ts       [Phase 18 — localStorage]
    ← imports → [localStorage directly]
    ← exports → loadCommunityProfile(), saveCommunityProfile(), createCommunityProfile()

community-leaderboard.ts   [Phase 18 — computed from localStorage]
    ← imports → community-profile.ts
    ← imports → trading-arena.ts [localStorage]
    ← imports → trading-journal.ts [localStorage]
    ← imports → behavioral-engine.ts [localStorage]
    ← exports → getLeaderboard(), computeMyLeaderboardScores()

community-challenges.ts    [Phase 18 — localStorage]
    ← imports → [localStorage directly]
    ← exports → getCurrentChallenge(), joinChallenge(), markChallengeComplete()

community-groups.ts        [Phase 18 — static data, no persistence]
    ← imports → [none]
    ← exports → STUDY_GROUPS, LEVEL_LABEL

community-career.ts        [Phase 9 — PostgreSQL via raw Client]
    ← imports → pg (new Client — NOT withDb())
    ← imports → academy-session.ts
    ← imports → academy-auth.ts
    ← imports → student-cartax.ts
    ← imports → phase5-achievement-engine.ts
    ← exports → PublicLearnerProfile, CareerSnapshot
```

**Issues:**
- Two parallel community modules: `community-career.ts` (server, DB) and `community-profile.ts` (client, localStorage)
- `community-career.ts` creates its own `pg.Client` instead of using the shared pool
- `community-leaderboard.ts` is an aggregate of localStorage reads — it cannot run server-side

---

### 1.5 Mentor AI Cluster

```
mentor-memory.ts
    ← imports → db.ts [withDb()]
    ← exports → getMentorMemory(), updateMentorMemory()

mentor-signals.ts
    ← imports → db.ts [withDb()]
    ← exports → collectMentorSignals(), MentorSignalProfile

mentor-events.ts
    ← imports → mentor-signals.ts
    ← imports → db.ts [withDb()]
    ← exports → emitLearningEvent(), runMentorProfileUpdateSafely()
    [TODO: replace in-process async with durable queue]

mentor-cleanup.ts
    ← imports → db.ts [withDb()]
    ← exports → runMentorCleanup()
```

**This cluster is clean.** Uses `withDb()` consistently. No localStorage dependency.

---

### 1.6 Academy Progress Cluster

```
academy-progress.ts        [localStorage]
    ← imports → [localStorage directly, DOM events]
    ← exports → loadProgress(), markLessonCompleted(), completeQuiz()

knowledge-graph.ts         [static data]
    ← imports → [none]
    ← exports → CONCEPT_NODES, ConceptNode

learning-os.ts
    ← imports → academy-progress.ts [localStorage]
    ← exports → LearningOS (class)

offline-sync.ts
    ← imports → [fetch, localStorage]
    ← exports → syncOfflineEvents()
```

---

## 2. API Route → Library Dependencies

### 2.1 Academy Auth Routes

```
/api/academy-auth/        → academy-auth.ts, db.ts, rate-limit.ts, csrf.ts
/api/academy/auth/login   → academy-auth.ts, db.ts (duplicate path?)
/api/academy/auth/logout  → academy-auth.ts
/api/academy/auth/me      → academy-auth.ts, academy-session.ts
/api/academy/auth/register → academy-auth.ts, db.ts, rate-limit.ts
```

**Issue:** `/api/academy-auth/` and `/api/academy/auth/` are parallel. Both appear in codebase. Potential dead route.

---

### 2.2 Mentor Routes

```
/api/ai-mentor            → behavioral-engine [?], anthropic [raw fetch]
/api/ai-mentor-v2         → anthropic [raw fetch], behavioral context inline
/api/mentor-conversations → mentor-memory.ts, db.ts
/api/mentor-insights      → mentor-signals.ts, db.ts
/api/mentor-memory        → mentor-memory.ts, db.ts
/api/mentor-profile/recompute → mentor-signals.ts, db.ts
/api/mentor-challenge     → db.ts, phase5-achievement-engine.ts
```

---

### 2.3 Community Routes

```
/api/community/profile    → community-career.ts [raw pg Client]
/api/community/hall-of-fame → community-career.ts [raw pg Client]
```

**Note:** Phase 18 community components are client-side only (no API routes). Phase 18 community-profile.ts writes to localStorage, not to `/api/community/profile`. These are two separate systems serving the same conceptual domain.

---

## 3. Component → Library Dependencies

### 3.1 High-Dependency Components

```
InstructorDashboard.tsx
    ← imports → behavioral-engine.ts [localStorage]
    ← imports → community-leaderboard.ts [localStorage]
    ← imports → trading-arena.ts [localStorage]
    ← imports → trading-journal.ts [localStorage]
    ← imports → knowledge-graph.ts
    ← imports → academy-progress.ts [localStorage]
    ← imports → community-profile.ts [localStorage]
    → 7 localStorage-dependent imports

LearningInsightsDashboard.tsx
    ← imports → behavioral-engine.ts [localStorage]
    ← imports → coaching-engine.ts
    ← imports → knowledge-graph.ts
    ← imports → academy-progress.ts [localStorage]
    ← imports → smart-review.ts [localStorage]
```

These components cannot be server-rendered. They must be client-only, which prevents SSR personalization.

---

## 4. Circular Dependency Analysis

| Chain | Status |
|---|---|
| `behavioral-engine` → `trading-dna` → `trading-arena` | Not circular ✓ |
| `behavioral-engine` → `academy-progress` → (no behavioral import) | Not circular ✓ |
| `community-leaderboard` → `behavioral-engine` → `trading-dna` | Not circular ✓ |
| `db-schema` → `phase5-achievement-engine` → `db` → `db-schema` | **CIRCULAR** ⚠️ |

**Circular issue:** `db-schema.ts` calls `ensurePhase5Tables()` from `phase5-achievement-engine.ts`. If `phase5-achievement-engine.ts` imports `db.ts` (which it does), and `db.ts` calls `db-schema.ts` (which it does via `initSchema`), this creates:

```
db.ts → db-schema.ts → phase5-achievement-engine.ts → db.ts
```

This is mitigated by the lazy initialization pattern (`schemaInit` promise), but it is architecturally fragile.

**Fix:** Move schema definition out of library files and into dedicated migration SQL files. `phase5-achievement-engine.ts` should not contain DDL.

---

## 5. External Dependency Map

| External | Used by | Risk |
|---|---|---|
| `anthropic` (raw fetch) | `ai-mentor/route.ts`, `ai-mentor-v2/route.ts` | No official SDK used — raw fetch is brittle to API changes |
| `pg` (PostgreSQL) | `db.ts`, `community-career.ts`, `student-cartax.ts` | `community-career.ts` and `student-cartax.ts` bypass pool |
| `jose` | `academy-auth.ts`, `academy-session.ts`, `session.ts`, `academy-certificates.ts` | Clean — no issues |
| `next-intl` | `i18n/`, route layouts | Clean |
| `@tanstack/react-query` | `hooks/` | Clean |
| Redis (Upstash REST) | `rate-limit.ts` | Falls back to in-memory silently |
| `qrcode` | `academy-certificates/qr/` | Clean |

---

## 6. Data Store Dependencies

| Data store | Consumers | Issues |
|---|---|---|
| PostgreSQL (pool) | Most server-side lib files via `withDb()` | ✓ Clean pool usage except community-career.ts |
| PostgreSQL (raw Client) | `community-career.ts` | ⚠️ Bypasses pool |
| localStorage (academy) | `academy-progress.ts`, `spaced-repetition.ts`, `smart-review.ts` | ⚠️ No server sync |
| localStorage (trading) | `trading-arena.ts`, `trading-journal.ts`, `trading-dna.ts` | ⚠️ No server sync |
| localStorage (community) | `community-profile.ts`, `community-challenges.ts` | ⚠️ No server sync |
| localStorage (behavioral) | `behavioral-engine.ts` reads from above | ⚠️ Aggregate of all above |
| Redis (Upstash) | `rate-limit.ts` | ✓ Optional with fallback |
| Anthropic API | `ai-mentor/route.ts`, `ai-mentor-v2/route.ts` | ⚠️ No retry, no fallback |

---

## 7. Target Dependency Graph (Phase 22+)

After Phase 22, the target is:

```
All behavioral data → PostgreSQL (via SyncLayer)
SyncLayer → writes server-first, caches locally
behavioral-engine.ts → accepts studentId, fetches from DB
community-leaderboard.ts → aggregates from DB, no localStorage
trading-arena.ts → writes to /api/v1/trading/arena, reads from server

All API routes → /api/v1/* (versioned)
All API routes → validate input with Zod first
All API routes → use withDb() for DB access
All DB access → tenant-scoped (AND tenant_id = $tenantId)
```

The target dependency graph has NO circular dependencies, NO localStorage as source of truth, and NO raw pg Client usage outside `withDb()`.
