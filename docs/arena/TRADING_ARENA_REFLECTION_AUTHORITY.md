# Trading Arena Reflection Authority

Status: **P0 implementation contract**  
Parent: #53 / #45  
Authority: PostgreSQL + validated Trading Arena Execution V2 state

## Purpose

Post-trade reflections are durable learning evidence. They are not browser notes and must remain available across devices. A reflection is valid only when an authenticated Academy student owns the Arena attempt and the referenced closed trade exists in that attempt's validated Execution V2 aggregate.

## Non-negotiable invariants

1. PostgreSQL is the only durable source of truth.
2. The client never supplies financial evidence. Asset, PnL, PnL rate, closure reason, closure timestamp and Mentor flags are copied from the validated closed trade by the server.
3. One current reflection exists per `(student_id, attempt_id, closed_trade_id)`.
4. Every mutation carries `expectedRevision` and an `Idempotency-Key`.
5. A reused idempotency key may replay only the exact same normalized request; a different request returns `409 idempotency_key_reused`.
6. A stale revision returns `409 revision_conflict` with the current authoritative reflection when available. No silent overwrite is permitted.
7. The reflection write, immutable command result, student event and learning event commit in one database transaction.
8. Mentor profile refresh is scheduled only after a committed non-replayed write.
9. Missing database authority, invalid/corrupt execution state, an unowned attempt or a forged trade ID fails closed.
10. Legacy browser reflections are untrusted and are not auto-imported.

## Migration 0022

Add `0022_trading_arena_reflections.sql` to `src/lib/db-migrate-user-state.ts`, after migration 0021.

### `academy_trading_arena_reflections`

Required columns:

- `id UUID PRIMARY KEY`
- `student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE`
- `attempt_id UUID NOT NULL REFERENCES academy_trading_arena_attempts(id) ON DELETE CASCADE`
- `closed_trade_id TEXT NOT NULL`
- `revision BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1)`
- user-authored fields: `decision_review`, `learned_lesson`, `emotional_review`, `mistake_tags JSONB`, optional `next_action_commitment`
- immutable server evidence: `evidence_asset`, `evidence_realized_pnl`, `evidence_realized_pnl_rate`, `evidence_closure_reason`, `evidence_closed_at`, `evidence_mentor_flags JSONB`
- `created_at`, `updated_at`
- unique `(student_id, attempt_id, closed_trade_id)`
- strict length, JSON type, enum and tag-count constraints
- indexes for student history, attempt lookup, Mentor review and recent updates

### `academy_trading_arena_reflection_commands`

Required columns:

- immutable command row with `student_id`, `attempt_id`, `closed_trade_id`
- `idempotency_key`, `expected_revision`, normalized `request_hash`
- `result_revision`, `result_response JSONB`, `created_at`
- unique `(student_id, attempt_id, idempotency_key)`
- strict hash/key/JSON constraints

The command table stores replayable committed responses and must never be updated in place.

## API contract

Endpoint: `/api/trading-arena/reflections`

All responses use `Cache-Control: no-store, max-age=0`.

### GET

- requires canonical Academy session;
- accepts an `attemptId` query parameter;
- verifies the attempt belongs to the authenticated student;
- validates its persisted Execution V2 state before returning reflection rows;
- returns the authoritative reflection list and attempt identity;
- does not create Arena attempts or mutate execution state.

### POST

Body:

```json
{
  "attemptId": "uuid",
  "closedTradeId": "server trade id",
  "expectedRevision": 0,
  "decisionReview": "...",
  "learnedLesson": "...",
  "emotionalReview": "...",
  "mistakeTags": ["late-entry"],
  "nextActionCommitment": "..."
}
```

Headers:

- `Idempotency-Key`: required, 8–120 safe characters.

Transaction order:

1. acquire a reflection-specific advisory lock for student + attempt + trade;
2. lock and verify the owned attempt;
3. validate Execution V2 state and find `closedTradeId`;
4. normalize the request and calculate SHA-256 request hash;
5. check command replay before revision validation;
6. reject reused key with different hash;
7. insert on `expectedRevision = 0`, or update with `WHERE revision = expectedRevision`;
8. copy immutable evidence from the server trade;
9. insert the immutable command result;
10. append `academy_student_events` and `learning_events`;
11. commit;
12. schedule Mentor refresh only for a new committed write.

Successful responses include `reflection` and `idempotentReplay`.

## Controlled input

Supported mistake tags are a fixed server enum:

- `late-entry`
- `early-exit`
- `oversized-position`
- `missing-stop-loss`
- `moved-stop-loss`
- `fomo-entry`
- `revenge-trade`
- `ignored-plan`
- `poor-risk-reward`
- `overtrading`
- `none`

Rules:

- tags are normalized, deduplicated and sorted;
- `none` cannot coexist with another tag;
- maximum five tags;
- required narrative fields reject empty/whitespace-only text;
- user-authored text is cleaned and bounded before hashing and persistence.

## Client behavior

- render the editor directly below each closed-trade evidence card;
- hydrate reflections from the server by active attempt ID;
- preserve draft text after network/5xx failure;
- retain the exact pending idempotency identity after an ambiguous result;
- while an unresolved identity exists, only an exact retry is allowed;
- on `revision_conflict`, reconcile the authoritative row without silently discarding the local draft;
- never write reflections to localStorage/sessionStorage/IndexedDB;
- remain keyboard accessible, responsive and Persian-first.

## Required evidence

- parser and normalization tests;
- migration constraint and registry tests;
- exact-retry and different-request blocking tests;
- forged/unowned trade negative tests;
- reused-key and stale-revision tests;
- concurrent first-write test with one committed row;
- committed event and post-commit Mentor scheduling tests;
- Arena authority guard enforcing endpoint, revision and idempotency boundaries;
- exact-head TypeScript, ESLint, all guards, full tests and production build.
