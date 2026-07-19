# Academy Progress Authority

**Status:** Implemented production-hardening contract  
**Scope:** Academy XP, lesson completion, term progression, badges, streak and learner projection

## Authority hierarchy

1. Canonical curriculum and server-side graders determine assessment outcomes.
2. `academy_lesson_assessment_attempts` stores immutable, idempotent assessment attempts.
3. `academy_reward_events` is the append-only reward entitlement ledger.
4. `academy_term_progress` remains the authoritative term-assessment record.
5. `academy_state_documents.progress` is a rebuildable read projection, not a mutation API.
6. Browser memory is disposable and may only accept a projection returned by the server.

`POST /api/academy-state` is permanently fail-closed. Clients may never submit XP, badges, scores, lesson completion or term-pass commands.

## Legacy migration policy

The first projection rebuild freezes the previous progress document in `academy_progress_legacy_snapshots` together with the current reward-event cursor. The frozen snapshot is used as a one-time continuity baseline. New rewards are calculated only from ledger events created after that cursor, preventing historical data loss and preventing projection rebuilds from compounding XP.

Legacy baseline data is retained with explicit provenance; it is never mutable through the public client contract.

## Reward rules

| Event | XP | Idempotency source |
|---|---:|---|
| Official lesson section completed | 10 | term + section |
| Official lesson answer recorded | 5 | term + section |
| V2 lesson assessment passed | 30 | lesson ID |
| V2 lesson perfect-score bonus | 50 | lesson ID |
| Official term passed | 500 | term number |
| Badge entitlement | 0 | badge code |

A perfect V2 lesson therefore yields 80 XP total, not two overlapping full rewards.

## Replay and concurrency guarantees

- Lesson assessment submissions require an idempotency key.
- Reusing a key with a different normalized answer payload returns `idempotency_conflict`.
- Reward uniqueness is enforced by a database unique constraint.
- Per-lesson and per-term advisory locks serialize grading writes.
- A per-student/locale projection advisory lock serializes snapshot capture and rebuilds.
- Replaying a valid request returns the stored server result and never issues reward twice.

## Operational verification

Every pull request must pass:

- production environment contract
- TypeScript and ESLint
- browser persistence guard
- Admin authentication boundary guard
- Academy server authority guard
- full automated tests
- production build

The Academy authority guard fails CI if generic client mutation helpers or unverified Flashcard XP are reintroduced.

Merge evidence is valid only when the successful Quality Checks run is attached to the exact pull-request head SHA being merged. Results from earlier commits, diagnostic branches or temporary workflows do not satisfy this gate.

## Follow-up gates

- durable Mentor update queue instead of in-process fire-and-forget updates
- authoritative Flashcard review-event protocol before any Flashcard XP is restored
- module-assessment server grading and reward issuance
- reconciliation dashboard for projection, snapshot and ledger drift
- migration drills on a production-like database backup
