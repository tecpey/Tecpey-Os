# TecPey Official Journal Reflection Challenge Authority

Issues: #217, #221  
Parent: #160

## Bounded pilot

Only `journal-reflection-week` version `journal-reflection-v1` is official. Scenario, risk-rate, lesson, streak, XP, badge, reward, leaderboard, scholarship, Mentor scoring and instructor outcomes remain unsupported and fail closed.

## Server-owned cycle

The active cycle is derived from PostgreSQL time and the UTC ISO week:

- starts Monday at `00:00:00 UTC`;
- ends the next Monday at `00:00:00 UTC`;
- has a key such as `2026-W30`;
- cannot be supplied or shifted by the browser clock.

Interactive commands must reference the current server cycle. After rollover, ended `active` enrollments are handled only by the post-cycle finalizer.

## Enrollment

Enrollment requires a strict Academy session, verified tenant/workspace/student principal binding, account-owned challenge consent, CSRF, rate limiting, bounded JSON and idempotency. `started_at` is PostgreSQL-issued; earlier activity never counts.

## One evidence authority

Interactive evaluation and post-cycle finalization both call `calculateOfficialJournalChallengeEvidence`. No worker-specific scoring implementation exists.

The authority:

1. loads owned Trading Arena attempts;
2. validates every execution snapshot;
3. selects closed trades at or after enrollment and before the exclusive evidence boundary;
4. loads reflections created inside the same boundary;
5. validates each reflection;
6. requires attempt/trade identity, asset, PnL, PnL rate, closure reason, close time and mentor flags to match the canonical closed trade exactly.

Corrupt, duplicate or orphaned evidence fails closed.

## Completion rule

Completion requires at least 3 eligible closed trades and at least 80 percent exact reflection coverage:

`validReflectionCount * 5 >= eligibleClosedTradeCount * 4`

- 3/3 completes;
- 3/2 does not;
- 4/3 does not;
- 4/4 completes;
- 5/4 completes.

## Terminal states

An enrollment has one of three states:

- `active`: no finalization fields;
- `completed`: threshold satisfied, `completed_at` and `finalized_at` present;
- `not_completed`: threshold not satisfied, `completed_at` absent and worker-issued `finalized_at` present.

`completed` and `not_completed` are terminal and immutable. PostgreSQL constraints repeat the threshold and provenance rules.

Interactive completion uses `finalization_source = interactive`. Post-cycle results use `finalization_source = worker` plus a UUID `finalization_run_id`.

## Post-cycle finalizer

The scheduler-ready command is:

`npm run community:challenge:finalize`

Optional batch size:

`COMMUNITY_CHALLENGE_FINALIZATION_BATCH=100`

The worker:

- uses PostgreSQL `NOW()`;
- selects only ended active enrollments;
- uses a bounded batch with `FOR UPDATE SKIP LOCKED`;
- calculates evidence from immutable `started_at` through exclusive `cycle_ends_at`;
- processes each row under an independent savepoint;
- commits one terminal result and one append-only finalization event atomically;
- reports only enrollment fingerprints and controlled reason codes;
- skips terminal rows on rerun.

Exit behavior:

- `0`: authority available and no per-row failures;
- `1`: PostgreSQL/finalizer authority unavailable;
- `2`: batch committed healthy rows but one or more isolated enrollments failed closed.

An external scheduler should run the command repeatedly after UTC rollover. The worker is idempotent and safe for concurrent runners.

## Finalization events

Worker results emit exactly one of:

- `finalized_completed`;
- `finalized_not_completed`.

A partial unique index allows only one finalization event per enrollment. Event evidence includes the cycle, evidence window, finalization run, counts, coverage, threshold, result and explicit `rewardsEnabled: false`.

## Latest result read model

`GET /api/community/profile?view=journal-reflection-history` is authenticated, strict-revocation, tenant/principal-bound, rate-limited, private and no-store. It returns only the latest ended terminal result for the authenticated student through the already governed Community route.

The browser parser recomputes coverage and threshold coherence. Invalid payloads, nonzero rewards or contradictory status fail closed. No browser history or demo fallback exists.

## Command evidence

Join and interactive evaluate commands use `api_command_receipts`. Exact retries replay; changed requests using the same key conflict. Domain events remain append-only.

## Privacy and tenant isolation

Enrollment identity includes tenant, workspace, principal type and student principal, with a foreign key to canonical bindings. Finalizer errors expose only SHA-256-derived fingerprints. APIs never accept tenant or student identifiers from client bodies.

## Rewards

Every current and finalized result emits:

- XP: `0`;
- badge: `null`;
- financial reward: `null`;
- reward status: `disabled`.

Completion must not enter Mentor, reputation, leaderboard, scholarship, instructor or financial systems until separate authorities are approved.

## Failure behavior

- missing Academy identity: `401`;
- malformed interactive command: `400`;
- consent/cycle/idempotency conflict: `409`;
- missing PostgreSQL/context/evidence authority: `503`;
- finalizer isolates corrupt rows and returns exit code `2`;
- no localStorage, filesystem, demo or browser-computed fallback.

## Remaining bounded follow-ups

- normalized/indexed closed-trade evidence for large histories;
- finalization scheduling and operational alerting in deployment infrastructure;
- retention/account-deletion policy for append-only evidence;
- official scenario challenge authorities;
- audited XP, badge and reward issuance;
- canonical reputation/leaderboard projection;
- Instructor role and grant authority.
