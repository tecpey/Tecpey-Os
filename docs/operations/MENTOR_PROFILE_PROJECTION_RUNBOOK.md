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

Install the hardened service only after the exact release has completed the governed Mentor/operations migrations through `0109_operational_signal_envelope.sql`, including the outbox, incident resolution, freshness observability and operational signal envelope migrations.

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

Remove `TECPEY_DRY_RUN=1` only after all five generated units verify cleanly: the durable worker, the independent health probe service and timer, plus the shared operational alert/signal delivery service and timer.

## Operational checks

```bash
systemctl is-enabled tecpey-mentor-profile-worker.service
systemctl is-active tecpey-mentor-profile-worker.service
systemctl is-enabled tecpey-mentor-profile-health.timer
systemctl is-active tecpey-mentor-profile-health.timer
systemctl is-enabled tecpey-ops-alert-delivery.timer
systemctl is-active tecpey-ops-alert-delivery.timer
systemctl list-timers --all | grep -E 'tecpey-mentor-profile-health|tecpey-ops-alert-delivery'
systemctl status tecpey-mentor-profile-worker.service --no-pager
systemctl status tecpey-mentor-profile-health.service --no-pager
systemctl status tecpey-ops-alert-delivery.service --no-pager
journalctl -u tecpey-mentor-profile-worker.service -n 100 --no-pager
journalctl -u tecpey-mentor-profile-health.service -n 100 --no-pager
journalctl -u tecpey-ops-alert-delivery.service -n 100 --no-pager
```

The worker evaluates a bounded aggregate health snapshot approximately once per minute. The snapshot contains queue counts and ages only; it never includes tenant, workspace, learner, conversation, prompt, KYC or portfolio identifiers.

The independent `tecpey-mentor-profile-health.timer` runs the same production-bundled probe outside the worker process. This is intentional: a worker can remain an active process while its event loop or database work stops making progress. The independent systemd probe provides a second failure detector instead of asking the component under observation to be its only monitor.

The timer activates 30 seconds after boot (or immediately when enabled after that point), then schedules one check per minute from the prior activation. It uses a small **fixed host-specific randomized delay** and one-second accuracy so repeated checks do not create synchronized host work. It deliberately does **not** use `Persistent=true`: systemd only applies that setting to `OnCalendar=` timers, while this watchdog is monotonic. In the health service, exit code `1` (warning) is declared a successful systemd exit via `SuccessExitStatus=1`; exit code `2` (critical) and `3` (authority/check failure) therefore make the health service fail visibly at the host layer.

### Internal starting SLO targets

These are engineering starting targets for staging calibration, **not a customer SLA and not a production-grade reliability claim**:

- warning when the ready backlog reaches 50 events or the oldest ready event reaches 60 seconds;
- critical when the ready backlog reaches 500 events or the oldest ready event reaches 300 seconds;
- any **unresolved** terminal projection failure or dead letter is critical; resolved historical evidence remains queryable but does not permanently poison current health;
- an expired processing lease is warning immediately and critical once it is at least 30 seconds overdue;
- any retryable failure is warning until it converges.

The worker still emits `MENTOR_PROFILE_BACKLOG` for warning state and `MENTOR_PROFILE_PROJECTION_STALLED` for critical state through the legacy in-process alert path. Warning remains an engineering signal and is not paged by the durable rail. The independent health probe separately writes critical and authority-unavailable conditions into the governed operational signal spool described below, so critical delivery no longer depends on the worker process or PostgreSQL being available.

A one-shot machine-readable probe is available from the production bundle:

```bash
npm run mentor:profiles:health
```

Exit codes are `0=healthy`, `1=warning`, `2=critical`, and `3=database authority/check failure`. The JSON output contains aggregate counts, reason codes, policy version and queue ages only.


### Durable critical signal rail

Critical Mentor health is persisted before delivery as a privacy-minimized operational signal. The signal contains only bounded reason codes plus numeric/boolean/null measurements; it does not contain tenant, workspace, learner, conversation, prompt, KYC or portfolio values.

The independent probe writes to the protected state directory even during a PostgreSQL outage:

- `signals/pending`: not yet delivered or waiting for bounded retry;
- `signals/delivered`: successfully handed to the configured webhook;
- `signals/quarantine`: corrupt files, terminal HTTP failures or retries that exhausted the bounded attempt budget.

Within each configurable dedupe window (default one hour), the **first observation** for the same detector service, component, severity and reason-code set becomes the durable signal. Later observations in that same window replay the same signal identity instead of creating an alert storm. A later window creates a new reminder identity if the critical condition still exists.

The signal spool is filesystem-first and does not require PostgreSQL to enqueue or deliver. PostgreSQL copies of signal and delivery-attempt evidence are best-effort mirrors for audit/recovery; the local spool/archive remains the outage-safe delivery authority when database persistence is unavailable.

Delivery is performed by `tecpey-ops-alert-delivery.service` from the production bundle, not by `tsx`. Its preflight validates only the state directory, HTTPS webhook, bearer shape and bounded delivery settings; it deliberately does **not** depend on `DATABASE_URL` or Community Challenge configuration. The one-minute monotonic timer scans both the legacy job-alert spool and the new signal spool. Per-signal `nextAttemptAt` plus capped exponential backoff with deterministic jitter prevents that scan cadence from becoming a retry storm.

Webhook requests use the stable signal ID as `Idempotency-Key`. HTTP 408/425/429 and 5xx are retryable; terminal HTTP responses are quarantined. No response body is persisted.

Useful inspection commands:

```bash
find /var/lib/tecpey/ops/signals/pending -maxdepth 1 -type f -print
find /var/lib/tecpey/ops/signals/delivered -maxdepth 1 -type f -print
find /var/lib/tecpey/ops/signals/quarantine -maxdepth 1 -type f -print
systemctl status tecpey-ops-alert-delivery.timer --no-pager
journalctl -u tecpey-ops-alert-delivery.service --since '-30 minutes' --no-pager
```

A quarantined critical signal is an operator incident. Do not delete it to manufacture green health; diagnose the webhook/configuration failure, preserve the file as evidence, and use a reviewed recovery procedure.

Thresholds must be recalibrated from protected-staging measurements of event arrival rate, projection duration and recovery behavior before any SLA, error-budget or production reliability commitment is made.

These queue/lease signals are **white-box preventive indicators**, not a substitute for a learner-facing reliability SLI. Promotion to a paging SLO requires protected-staging evidence for a user-relevant indicator such as the fraction of authoritative learning events whose Mentor profile projection converges within the agreed freshness target. Once enough baseline data exists, use multi-window / multi-burn-rate alerting rather than a single instantaneous threshold: fast windows for urgent budget burn, slower windows for sustained degradation, and ticket/log routing for non-urgent conditions. Until that evidence exists, warning remains an engineering signal and critical remains a fail-closed host condition rather than an advertised SLA breach.


### Freshness calibration evidence

Use the read-only calibration collector to measure actual projection convergence before defining a learner-facing SLO:

```bash
npm run mentor:profiles:freshness
```

Optional bounded inputs are:

- `MENTOR_PROFILE_FRESHNESS_LOOKBACK_SECONDS`: 300–86400, default 3600;
- `MENTOR_PROFILE_FRESHNESS_TARGET_SECONDS`: 1–3600, default 60;
- `MENTOR_PROFILE_FRESHNESS_MIN_SAMPLES`: 1–1000000, default 50.

The collector uses a **matured-event denominator**: an outbox event enters the sample only after it has had the full configured target interval to converge. Every matured event is counted, including pending, retryable and terminal outcomes; therefore backlog or failure cannot disappear from the SLI through survivorship bias. A good event is one processed on or before its own create+target deadline. Aggregate output includes eligible sample count, processed/valid/invalid latency counts, within-target and missed-target counts/ratio, plus p50, p95 and max create→processed latency for valid completed events. It does not return tenant, workspace, learner, conversation or prompt identifiers. Exit `0` means enough valid observations were collected, exit `1` means the denominator is still statistically thin, exit `2` means timestamp evidence is internally invalid, and exit `3` means database/calibration authority was unavailable.

This output is **not an SLO pass/fail result**. Capture it on protected staging over representative Academy, Arena and Mentor workloads, compare multiple windows and traffic levels, then define the actual freshness SLI/error budget. If paging is later enabled, use a multi-window / multi-burn-rate policy so a short transient spike does not page while a sustained user-visible freshness regression cannot hide behind a long average.

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

SELECT
  (SELECT COUNT(*) FROM mentor_profile_update_dead_letters) AS dead_letter_history,
  (SELECT COUNT(*) FROM mentor_profile_dead_letter_resolutions) AS resolved_history;
```

Do not manually rewrite event identity fields, payload hashes, terminal evidence or attempt history. Database triggers deliberately reject identity mutation and dead-letter UPDATE/DELETE.

## Failure and recovery

A worker crash leaves a lease. A later claim cycle automatically recovers expired leases. Retryable failures use bounded exponential backoff with deterministic per-event jitter. The jitter is derived from the outbox identity and attempt number, so concurrent failures do not all wake on the same second while replay and tests remain deterministic. After the configured maximum attempts, the event becomes terminal and an append-only dead-letter row is recorded.

A terminal event is evidence that automatic projection did not converge. Repair the underlying authority first. Do not edit the dead letter.

The governed full-current-state repair sweep recomputes the learner profile and then appends a row to `mentor_profile_dead_letter_resolutions` for dead letters that existed **before that repair began**. This anti-race boundary prevents a new terminal event created during the repair from being silently marked resolved. Resolution rows are append-only and the original dead-letter evidence remains immutable for forensics.

A successful repair may therefore change current health from critical to healthy while the append-only dead-letter table remains non-empty. This is intentional: the hot health probe reads only current actionable incident state; historical failure/resolution totals remain forensic evidence queried separately. A manual profile edit that bypasses the governed repair path does not clear an incident.

## Deployment gate

Before enabling the service on staging:

1. exact release SHA is known;
2. migration plan hash and migration ledger are green through canonical step 093;
3. `npm run test:mentor-profile-outbox` and `npm run test:ops-signals` are green against PostgreSQL 16 and the filesystem spool;
4. `npm run mentor:profiles:health` reports healthy on the migrated candidate before controlled ingestion;
5. `npm run mentor:profiles:freshness` produces valid aggregate calibration evidence or explicitly reports insufficient data;
6. worker, independent health probe/timer and operational delivery service/timer all pass the installer dry-run and `systemd-analyze verify`;
7. the initial one-shot health probe succeeds (healthy, or warning only when an explicitly understood staging condition exists) and the timer is enabled/active;
8. the worker starts with zero unresolved terminal failures;
9. create one controlled Academy assessment and verify source mutation, outbox row, processed attempt and profile projection all converge;
10. stop the worker in a controlled staging drill, create bounded test backlog, verify the independent health service transitions to critical without relying on worker self-reporting, verify one durable signal appears under `signals/pending` or `signals/delivered`, then restore the worker and verify health converges again.

Production remains gated until the same evidence is repeated on the approved candidate SHA.

## Watchdog failure drill

Run this only in protected staging with a controlled test learner and no production traffic.

```bash
sudo systemctl stop tecpey-mentor-profile-worker.service
# create the approved bounded test signal/backlog through the normal application path
sudo systemctl start tecpey-mentor-profile-health.service || true
systemctl status tecpey-mentor-profile-health.service --no-pager
journalctl -u tecpey-mentor-profile-health.service --since '-10 minutes' --no-pager
```

Expected behavior:

- warning exit `1` is retained as a successful systemd execution so transient early pressure does not produce a false unit failure;
- critical exit `2` or authority failure `3` makes the health service fail and is visible to host monitoring;
- restarting the worker drains the bounded backlog;
- a later independent probe returns healthy after convergence;
- the drill must not mutate or delete dead-letter history to manufacture a green result.

This watchdog is an **independent failure detector** and critical/authority-unavailable outcomes now enter the governed durable operational signal rail. Host monitoring must still treat a failed `tecpey-mentor-profile-health.service` as actionable because filesystem exhaustion, permission failure or a broken local runtime can prevent even the outage-safe spool from being written. Warning-only health remains non-paging until a measured freshness SLO/error budget justifies a broader alert policy.
