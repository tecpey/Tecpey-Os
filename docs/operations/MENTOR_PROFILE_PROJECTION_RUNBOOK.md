# Mentor Profile Projection Runbook

## Purpose

The Mentor profile is a derived, student-global projection. Correctness is based on committed PostgreSQL source-of-truth evidence, not on browser state and not on the request-process lifetime.

Authoritative Academy, Arena and Mentor producers write a `mentor_profile_update_outbox` row inside the same transaction as the source mutation. `scripts/run-mentor-profile-worker.ts` then claims lease coordinates, reloads current authoritative signals from PostgreSQL and commits the profile projection together with processing evidence.

The in-process `scheduleMentorProfileUpdate` path is only a latency accelerator. A crash immediately after the HTTP commit may lose that microtask without losing correctness because the outbox row remains pending.

## Runtime contract

The worker requires the same production database environment as the web process. Optional bounded tuning variables are:

- `MENTOR_PROFILE_WORKER_POLL_MS`: 250–30000 ms, default 1000.
- `MENTOR_PROFILE_WORKER_BATCH_SIZE`: 1–100, default 20.
- `MENTOR_PROFILE_WORKER_CONCURRENCY`: 1–10, default 4.
- `MENTOR_PROFILE_WORKER_LEASE_SECONDS`: 15–300 seconds, default 120.

Install the hardened service only after the exact release has completed database migrations `0105_mentor_profile_update_outbox.sql` and `0107_mentor_profile_dead_letter_resolution.sql`.

Example staging dry-run:

```bash
sudo env \
  TECPEY_DRY_RUN=1 \
  TECPEY_APP_DIR=/srv/tecpey/current \
  TECPEY_ENV_FILE=/etc/tecpey/staging.env \
  TECPEY_RUN_USER=tecpeyadmin \
  TECPEY_RUN_GROUP=tecpeyadmin \
  bash scripts/install-mentor-profile-worker.sh
```

Remove `TECPEY_DRY_RUN=1` only after the generated unit verifies cleanly.

## Operational checks

```bash
systemctl is-enabled tecpey-mentor-profile-worker.service
systemctl is-active tecpey-mentor-profile-worker.service
systemctl status tecpey-mentor-profile-worker.service --no-pager
journalctl -u tecpey-mentor-profile-worker.service -n 100 --no-pager
```

The worker evaluates a bounded aggregate health snapshot approximately once per minute. The snapshot contains queue counts and ages only; it never includes tenant, workspace, learner, conversation, prompt, KYC or portfolio identifiers.

### Internal starting SLO targets

These are engineering starting targets for staging calibration, **not a customer SLA and not a production-grade reliability claim**:

- warning when the ready backlog reaches 50 events or the oldest ready event reaches 60 seconds;
- critical when the ready backlog reaches 500 events or the oldest ready event reaches 300 seconds;
- any **unresolved** terminal projection failure or dead letter is critical; resolved historical evidence remains queryable but does not permanently poison current health;
- an expired processing lease is warning immediately and critical once it is at least 30 seconds overdue;
- any retryable failure is warning until it converges.

The worker emits `MENTOR_PROFILE_BACKLOG` for warning state and `MENTOR_PROFILE_PROJECTION_STALLED` for critical state through the existing platform alert path. That path currently provides structured logging and best-effort webhook delivery; it must not be described as durable incident delivery until the broader operational alerting program proves that property.

A one-shot machine-readable probe is available from the production bundle:

```bash
npm run mentor:profiles:health
```

Exit codes are `0=healthy`, `1=warning`, `2=critical`, and `3=database authority/check failure`. The JSON output contains aggregate counts, reason codes, policy version and queue ages only.

Thresholds must be recalibrated from protected-staging measurements of event arrival rate, projection duration and recovery behavior before any SLA, error-budget or production reliability commitment is made.

Database reconciliation:

```sql
SELECT status, COUNT(*)
FROM mentor_profile_update_outbox
GROUP BY status
ORDER BY status;

SELECT event_type, COUNT(*), MIN(created_at), MAX(created_at)
FROM mentor_profile_update_outbox
WHERE status IN ('pending', 'failed_retryable')
GROUP BY event_type
ORDER BY event_type;

SELECT terminal_reason, COUNT(*), MAX(created_at)
FROM mentor_profile_update_dead_letters
GROUP BY terminal_reason
ORDER BY COUNT(*) DESC;
```

Do not manually rewrite event identity fields, payload hashes, terminal evidence or attempt history. Database triggers deliberately reject identity mutation and dead-letter UPDATE/DELETE.

## Failure and recovery

A worker crash leaves a lease. A later claim cycle automatically recovers expired leases. Retryable failures use bounded exponential backoff; after the configured maximum attempts they become terminal and an append-only dead-letter row is recorded.

A terminal event is evidence that automatic projection did not converge. Repair the underlying authority first. Do not edit the dead letter.

The governed full-current-state repair sweep recomputes the learner profile and then appends a row to `mentor_profile_dead_letter_resolutions` for dead letters that existed **before that repair began**. This anti-race boundary prevents a new terminal event created during the repair from being silently marked resolved. Resolution rows are append-only and the original dead-letter evidence remains immutable for forensics.

A successful repair may therefore change current health from critical to healthy while `deadLettersTotal` remains non-zero. This is intentional: current unresolved incident state and historical failure evidence are different signals. A manual profile edit that bypasses the governed repair path does not clear an incident.

## Deployment gate

Before enabling the service on staging:

1. exact release SHA is known;
2. migration plan hash and migration ledger are green through canonical step 091;
3. `npm run test:mentor-profile-outbox` is green against PostgreSQL 16;
4. `npm run mentor:profiles:health` reports healthy on the migrated candidate before controlled ingestion;
5. service template dry-run passes `systemd-analyze verify`;
6. the worker starts with zero terminal failures;
7. create one controlled Academy assessment and verify source mutation, outbox row, processed attempt and profile projection all converge.

Production remains gated until the same evidence is repeated on the approved candidate SHA.
