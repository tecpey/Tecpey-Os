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

Install the hardened service only after the exact release has completed database migration `0105_mentor_profile_update_outbox.sql`.

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

The worker emits a reconciliation count approximately once per minute. Healthy steady state normally has `processing=0`, `failed_retryable=0` and `failed_terminal=0` between bursts. Pending rows may briefly appear during normal ingestion.

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

A terminal event is evidence that automatic projection did not converge. Repair the underlying authority first. Do not edit the dead letter. After the defect is fixed, use a separately reviewed replay/repair operation that creates a new authoritative source reference or recomputes the profile under explicit operator evidence.

## Deployment gate

Before enabling the service on staging:

1. exact release SHA is known;
2. migration plan hash and migration ledger are green;
3. `npm run test:mentor-profile-outbox` is green against PostgreSQL 16;
4. service template dry-run passes `systemd-analyze verify`;
5. the worker starts with zero terminal failures;
6. create one controlled Academy assessment and verify source mutation, outbox row, processed attempt and profile projection all converge.

Production remains gated until the same evidence is repeated on the approved candidate SHA.
