# Academy Progress Authority Migration Report

**Status:** implementation candidate for Issue #28  
**Authority version:** `server_projection_v1`

## Security correction

The generic `POST /api/academy-state` mutation surface is retired. The endpoint is now a GET-only read projection and rejects direct XP, badge, lesson-score, module-score and term-pass commands with HTTP 405.

## New authority chain

1. Official lesson assessments are identified by canonical curriculum lesson IDs.
2. Submitted answers are graded again on the server; client-reported scores are ignored.
3. Assessment commands are serialized per learner and lesson with a PostgreSQL advisory transaction lock.
4. Identical commands are replay-safe through a SHA-256 command ledger.
5. XP and badges are inserted into an append-only reward ledger with a database uniqueness constraint on `(student_id, locale, reward_key)`.
6. Term assessments continue to be server-graded and now use the same command and reward authority.
7. `/api/academy-state` rebuilds the learner projection from normalized lesson, term and reward evidence and materializes it for cross-device reads.
8. Mentor refresh is scheduled only after authoritative lesson or term commands.

## Legacy reconciliation

Before a legacy Academy state document is replaced by the server projection, its JSON is captured exactly once in `academy_progress_legacy_snapshots` with a SHA-256 digest and `quarantined` status. Mutable legacy values are preserved for audit but are not silently treated as earned rewards.

## Idempotency and concurrency

- Reward uniqueness: `(student_id, locale, reward_key)`
- Semantic command uniqueness: `(student_id, command_type, request_hash)`
- Optional transport idempotency: `(student_id, idempotency_key)` where supplied
- Lesson and term commands use transaction-scoped advisory locks
- Projection writes are hash-aware and do not increment revisions when evidence has not changed

## Compatibility

The existing `academy_state_documents` and `academy_student_cartax` records remain available as read models. Current consumers continue to receive the same `AcademyProgressState` shape. Browser storage is not introduced and the former client reward mutation queue is removed.

## Remaining follow-up

Flashcard scheduling remains server-persisted, but flashcard-session XP is intentionally disabled until reviews are converted from whole-deck replacement to canonical, server-applied review commands. This prevents preserving a cosmetic reward at the cost of a new trust gap.
