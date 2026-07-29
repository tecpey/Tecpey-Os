# TecPey Official Journal Reflection Challenge Authority

Issues: #217, #221, #223  
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

The direct one-batch command remains available for controlled repair and testing:

`npm run community:challenge:finalize`

The production scheduler entrypoint is:

`npm run community:challenge:finalize:scheduled`

The scheduled orchestrator:

- uses the same finalization authority;
- drains bounded batches under one stable run ID;
- stops when the queue is drained, a row fails closed or the configured maximum batch count is reached;
- preserves healthy committed finalizations when a later row or operational-evidence write fails;
- writes an immutable PostgreSQL run projection when database authority is available;
- writes a private atomic last-run file on the server;
- emits no alert for a healthy empty or healthy completed run;
- emits a warning for `partial_failure` and a critical alert for `authority_unavailable`.

Result and exit behavior:

- `succeeded` / `0`: authority available, bounded drain completed and no failure;
- `authority_unavailable` / `1`: PostgreSQL/finalizer authority unavailable and no completion is claimed;
- `partial_failure` / `2`: healthy rows may be committed, but one or more rows failed, the drain bound was reached, or operational evidence could not be committed.

## systemd scheduling authority

Deployable assets are stored under `deploy/systemd/`:

- `tecpey-community-challenge-finalizer.service` is a hardened `Type=oneshot` service;
- `tecpey-community-challenge-finalizer.timer` runs hourly at minute 05 UTC and uses `Persistent=true` for catch-up after downtime;
- `tecpey-ops-alert-delivery.service` delivers pending operational alerts;
- `tecpey-ops-alert-delivery.timer` retries every five minutes.

The services run under an explicit non-root identity, use a read-only application directory, can write only the configured operational state directory, have no Linux capability set and apply systemd process/filesystem/kernel hardening.

The repository provides an idempotent installer and a no-write dry-run. Repository presence does not prove installation on a production host. Host activation must be verified according to [`COMMUNITY_CHALLENGE_SCHEDULER_RUNBOOK.md`](../operations/COMMUNITY_CHALLENGE_SCHEDULER_RUNBOOK.md).

## Operational evidence

Migration 0050 adds append-only evidence for:

- scheduled job runs;
- operator alerts;
- alert delivery attempts.

Run evidence contains only the run ID, job/unit/host, timestamps, classification, bounded counts, drain flag, approved enrollment fingerprints and controlled reason codes. Student, tenant and principal identifiers, environment values, raw exceptions and stack traces are forbidden.

Exact replay with the same identity and content is accepted. Divergent content under the same run, alert or attempt identity fails closed.

## Outage-safe alert spool

The server-local state directory contains:

- `community-challenge-finalization-last-run.json`;
- `alerts/pending/`;
- `alerts/delivered/`;
- `alerts/quarantine/`.

Spool files are bounded JSON, written with mode `0600` through an atomic temporary-file/fsync/rename sequence. Managed directories use mode `0700`. Symlinks, non-files, oversized files and invalid payloads are rejected or quarantined.

Alert delivery:

- requires HTTPS outside explicit test mode;
- uses a stable `Idempotency-Key`;
- supports an optional bearer token without logging it;
- never reads or logs response bodies;
- archives 2xx responses as delivered;
- retries 408, 425, 429, 5xx, timeout and network failures with bounded exponential backoff;
- quarantines terminal 4xx responses and exhausted attempts.

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
- missing PostgreSQL/context/evidence authority: `503` for request paths and exit `1` for the scheduler;
- isolated finalizer failure or bounded drain exhaustion: exit `2`;
- pending alerts survive database or provider outage in the private local spool;
- no localStorage, demo or browser-computed fallback.

## Remaining bounded follow-ups

- verify installation and alert receipt on each production/staging host as deployment evidence;
- normalized/indexed closed-trade evidence for large histories;
- retention/account-deletion policy for append-only challenge and operational evidence;
- official scenario challenge authorities;
- audited XP, badge and reward issuance;
- canonical reputation/leaderboard projection;
- Instructor role and grant authority.
