# TecPey Official Journal Reflection Challenge Authority

Issue: #217  
Parent: #160

## Bounded pilot

Only `journal-reflection-week` version `journal-reflection-v1` is an official challenge in this slice. Every scenario-based, risk-rate, lesson, streak, XP, badge, reward, leaderboard, scholarship and instructor outcome remains unsupported and fail closed.

## Server-owned cycle

The active cycle is derived from PostgreSQL time and the UTC ISO week:

- starts Monday at `00:00:00 UTC`;
- ends the next Monday at `00:00:00 UTC`;
- has a key such as `2026-W30`;
- cannot be supplied or shifted by the browser clock.

Commands must reference the current server cycle key. A stale or future cycle fails explicitly. This pilot must be evaluated before the current UTC cycle closes; post-cycle grace evaluation is intentionally out of scope until a separate finalization worker is designed.

## Enrollment

Enrollment is created only after:

1. a strict canonical Academy session;
2. a verified tenant/workspace/student principal binding;
3. account-owned `challenge_participation` consent;
4. CSRF, rate-limit, bounded-body and idempotency checks.

`started_at` is issued by PostgreSQL. Trades and reflections before that timestamp never count retroactively.

## Evidence calculation

The authority accepts no client score, count, timestamp, PnL or completion claim.

For the enrolled student it:

1. loads owned Trading Arena attempts;
2. validates every execution snapshot with the canonical Arena execution-state validator;
3. selects closed trades whose `closedAt` is at or after enrollment and before the evaluation/cycle boundary;
4. loads reflections in the same evidence window;
5. validates each reflection row;
6. requires the reflection's attempt/trade identity and immutable asset, PnL, PnL rate, closure reason, close time and mentor flags to match the canonical closed trade exactly.

Any corrupted or orphaned reflection makes the authority unavailable; it is never ignored as a partial success.

## Completion rule

Completion requires both:

- at least 3 eligible closed trades; and
- reflection coverage of at least 80 percent.

The decision uses integer arithmetic:

`validReflectionCount * 5 >= eligibleClosedTradeCount * 4`

Examples:

- 3/3 completes;
- 3/2 does not complete;
- 4/3 does not complete;
- 4/4 completes;
- 5/4 completes.

The database repeats this invariant as a check constraint. A completed enrollment is immutable.

## Command evidence

Join and evaluate commands use the shared `api_command_receipts` authority, scoped by tenant, student principal, operation and idempotency key. Exact retries replay the committed response. A reused key with a different request hash conflicts.

Domain evidence is also written to append-only `academy_community_challenge_events` records for joined, evaluated and completed transitions.

## Privacy and tenant isolation

Enrollment identity includes tenant, workspace, principal type and student principal, with a foreign key to the canonical principal binding. Reads and commands use the verified context rather than tenant or student identifiers from the request body.

The API is private, no-store and varies by cookie.

## Rewards

This pilot emits:

- XP: `0`;
- badge: `null`;
- financial reward: `null`;
- reward status: `disabled`.

Official completion must not enter Mentor scoring, reputation, leaderboard, scholarship, instructor review or financial reward systems until those authorities are separately implemented and approved.

## Failure behavior

- missing Academy identity: `401`;
- malformed command or cycle key: `400`;
- missing consent, stale cycle, not joined, in-progress or idempotency conflict: explicit `409`;
- missing tenant authority, PostgreSQL outage or evidence corruption: `503`;
- no localStorage, demo, filesystem or browser-computed fallback.

## Known bounded follow-ups

- normalized/indexed closed-trade evidence for large long-lived Arena histories;
- post-cycle finalization/grace worker;
- retention and account-deletion policy for append-only challenge evidence;
- official scenario challenge authorities;
- audited XP, badge and reward issuance;
- canonical reputation/leaderboard projection;
- Instructor role and grant authority.
