# Community Challenge Finalization Scheduler Runbook

Issue: #223  
Predecessor: #221 / PR #222  
Parent program: #160

## Status boundary

This repository contains deployable and tested scheduler assets. Merging them does **not** prove that a production host has installed or enabled the timers. Production activation is complete only after an operator runs the installer on the intended host and captures the verification evidence in this runbook or the release record.

The scheduler changes only the operational execution of the existing official `journal-reflection-week` finalizer. It does not enable XP, badges, financial rewards, scenario challenges, leaderboard/reputation, Mentor scoring or Instructor grants.

## Components

- `tecpey-community-challenge-finalizer.service`: hardened one-shot finalization job.
- `tecpey-community-challenge-finalizer.timer`: hourly UTC timer at minute 05 with persistent catch-up.
- `tecpey-ops-alert-delivery.service`: hardened one-shot delivery of pending operational alerts.
- `tecpey-ops-alert-delivery.timer`: retries pending alerts every five minutes.
- `platform_operational_job_runs`: immutable PostgreSQL run evidence.
- `platform_operational_alerts`: immutable alert evidence.
- `platform_operational_alert_delivery_attempts`: immutable delivery-attempt evidence.
- `TECPEY_OPS_STATE_DIR`: private server-local last-run and alert spool.

## Timing contract

The finalizer timer uses:

```ini
OnCalendar=*-*-* *:05:00 UTC
Persistent=true
RandomizedDelaySec=60
AccuracySec=30s
```

The hourly cadence gives prompt post-rollover finalization and bounded catch-up. `Persistent=true` instructs systemd to run a missed activation after the host returns. The service is `Type=oneshot`; systemd does not start another instance of the same unit while it is active.

The alert-delivery timer starts after boot and runs every five minutes.

## Required production environment

The selected environment file must be a regular non-symlink file, inaccessible to other users and not group-writable or group-executable. It must contain:

```bash
DATABASE_URL=postgresql://...
TECPEY_OPS_ALERT_WEBHOOK_URL=https://alerts.example.com/tecpey
TECPEY_OPS_ALERT_BEARER_TOKEN=replace-with-provider-token
TECPEY_OPS_STATE_DIR=/var/lib/tecpey/ops
COMMUNITY_CHALLENGE_FINALIZATION_BATCH=100
COMMUNITY_CHALLENGE_FINALIZATION_MAX_BATCHES=10
TECPEY_OPS_ALERT_BATCH_SIZE=20
TECPEY_OPS_ALERT_TIMEOUT_MS=10000
TECPEY_OPS_ALERT_MAX_ATTEMPTS=10
```

The installer validates the required database and HTTPS alert settings without printing their values. The bearer token is optional only when the selected alert provider authenticates through another approved mechanism.

## Pre-install checks

1. Confirm the intended Git commit and release artifact.
2. Confirm migration 0050 has been reviewed and backup/rollback procedures are available.
3. Confirm the runtime user exists, is not `root`, owns no unnecessary privileged files and can read the application and environment file.
4. Confirm the state directory is an absolute non-root path and is not a symlink.
5. Confirm the alert webhook is HTTPS and points to the approved operator channel or incident platform.
6. Run the production environment gate from the application directory:

```bash
npm run ops:scheduler:env-check
```

7. Run installer dry-run:

```bash
sudo env \
  TECPEY_DRY_RUN=1 \
  TECPEY_APP_DIR=/srv/tecpey/current \
  TECPEY_RUN_USER=tecpey \
  TECPEY_RUN_GROUP=tecpey \
  TECPEY_ENV_FILE=/etc/tecpey/runtime.env \
  TECPEY_OPS_STATE_DIR=/var/lib/tecpey/ops \
  TECPEY_NPM_BIN=/usr/bin/npm \
  bash scripts/install-community-challenge-scheduler.sh
```

Dry-run renders all units into a temporary directory and runs `systemd-analyze verify`; it does not write units, create the state directory or enable timers.

## Install

After dry-run passes:

```bash
sudo env \
  TECPEY_APP_DIR=/srv/tecpey/current \
  TECPEY_RUN_USER=tecpey \
  TECPEY_RUN_GROUP=tecpey \
  TECPEY_ENV_FILE=/etc/tecpey/runtime.env \
  TECPEY_OPS_STATE_DIR=/var/lib/tecpey/ops \
  TECPEY_NPM_BIN=/usr/bin/npm \
  bash scripts/install-community-challenge-scheduler.sh
```

The installer is idempotent. It renders and verifies the units, creates the private state directory with mode `0700`, installs unit files, reloads systemd, enables both timers and starts one alert-delivery pass.

## Installation verification

Capture the following output in the deployment evidence:

```bash
systemctl is-enabled tecpey-community-challenge-finalizer.timer
systemctl is-active tecpey-community-challenge-finalizer.timer
systemctl is-enabled tecpey-ops-alert-delivery.timer
systemctl is-active tecpey-ops-alert-delivery.timer
systemctl list-timers --all | grep -E 'tecpey-community-challenge-finalizer|tecpey-ops-alert-delivery'
systemctl cat tecpey-community-challenge-finalizer.service
systemctl cat tecpey-community-challenge-finalizer.timer
systemctl cat tecpey-ops-alert-delivery.service
systemctl cat tecpey-ops-alert-delivery.timer
```

Expected evidence:

- both timers are `enabled` and `active`;
- finalizer next activation is minute 05 UTC;
- finalizer timer contains `Persistent=true`;
- services run under the approved non-root identity;
- `ProtectSystem=strict`, `NoNewPrivileges=true`, filesystem restrictions and empty capability bounding set are present;
- only the application is read-only and the operational state directory is writable.

## Controlled first execution

Run the one-shot service through systemd, not directly as root:

```bash
sudo systemctl start tecpey-community-challenge-finalizer.service
sudo systemctl status tecpey-community-challenge-finalizer.service --no-pager
journalctl -u tecpey-community-challenge-finalizer.service --since '-10 minutes' --no-pager
```

Then inspect the privacy-minimized last-run projection:

```bash
sudo -u tecpey cat /var/lib/tecpey/ops/community-challenge-finalization-last-run.json
```

The file must not contain a database URL, webhook token, raw error, student ID, tenant ID or principal ID.

Verify PostgreSQL evidence:

```sql
SELECT run_id, job_name, scheduler_unit, host_name, result_status,
       started_at, completed_at, batches_processed, selected_count,
       finalized_completed_count, finalized_not_completed_count,
       failure_count, drain_limit_reached
  FROM platform_operational_job_runs
 WHERE job_name = 'community-challenge-finalization'
 ORDER BY completed_at DESC
 LIMIT 10;
```

## Result interpretation

### `succeeded` / exit 0

The finalizer authority was available, the bounded drain completed and no enrollment failed. Empty runs are healthy and produce no operator alert.

### `partial_failure` / exit 2

At least one enrollment failed closed, the configured drain limit was reached, or finalization succeeded but PostgreSQL operational evidence could not be committed. Healthy enrollment results remain committed. A warning alert is written to the local pending spool and, when PostgreSQL is available, to `platform_operational_alerts`.

Inspect:

```bash
journalctl -u tecpey-community-challenge-finalizer.service --since '-2 hours' --no-pager
find /var/lib/tecpey/ops/alerts/pending -maxdepth 1 -type f -name '*.json' -printf '%f\n'
```

Use only the approved enrollment fingerprints and reason codes for investigation. Do not attempt to infer or log student identities.

### `authority_unavailable` / exit 1

The finalizer could not use its PostgreSQL authority. No challenge result is claimed. A critical alert is persisted to the local spool even when database evidence cannot be written.

Check database connectivity, migration state and service environment without printing secrets:

```bash
sudo systemctl start tecpey-ops-alert-delivery.service
journalctl -u tecpey-ops-alert-delivery.service --since '-2 hours' --no-pager
```

## Alert-delivery behavior

- 2xx: moved from `alerts/pending` to `alerts/delivered`.
- 408, 425, 429, 5xx, timeout or network failure: remains pending with bounded exponential backoff.
- terminal 4xx or exhausted attempts: moved to `alerts/quarantine`.
- exact reruns use the stable `Idempotency-Key` and do not redeliver an archived item.
- response bodies are never read or logged.

Manual bounded delivery pass:

```bash
sudo systemctl start tecpey-ops-alert-delivery.service
journalctl -u tecpey-ops-alert-delivery.service --since '-10 minutes' --no-pager
```

Quarantined items require operator review. Never edit a pending or archived JSON file in place. Preserve it as evidence and create a documented recovery action.

## Monitoring checks

At minimum, infrastructure monitoring should alert when:

- the finalizer timer is inactive or disabled;
- no `platform_operational_job_runs` record exists within the expected hourly window plus deployment tolerance;
- the latest result is `authority_unavailable` or `partial_failure`;
- pending alert count grows across multiple delivery intervals;
- quarantine contains any item;
- service start-limit protection is reached;
- filesystem space or inode capacity for the state directory is low.

Suggested heartbeat query:

```sql
SELECT completed_at, result_status, failure_count, drain_limit_reached
  FROM platform_operational_job_runs
 WHERE job_name = 'community-challenge-finalization'
 ORDER BY completed_at DESC
 LIMIT 1;
```

## Deployment rollback

Rollback disables new scheduling before removing units. It does not delete immutable PostgreSQL evidence or spool files.

```bash
sudo systemctl disable --now tecpey-community-challenge-finalizer.timer
sudo systemctl disable --now tecpey-ops-alert-delivery.timer
sudo systemctl stop tecpey-community-challenge-finalizer.service || true
sudo systemctl stop tecpey-ops-alert-delivery.service || true
sudo rm -f \
  /etc/systemd/system/tecpey-community-challenge-finalizer.service \
  /etc/systemd/system/tecpey-community-challenge-finalizer.timer \
  /etc/systemd/system/tecpey-ops-alert-delivery.service \
  /etc/systemd/system/tecpey-ops-alert-delivery.timer
sudo systemctl daemon-reload
sudo systemctl reset-failed
```

Preserve `/var/lib/tecpey/ops` and the PostgreSQL evidence tables until retention and legal policy explicitly authorize deletion.

## Application rollback

If an application release is rolled back while the timer remains installed, confirm that the target release still contains these package commands:

- `ops:scheduler:env-check`
- `community:challenge:finalize:scheduled`
- `ops:alerts:deliver`

If not, disable both timers before switching the application symlink or directory.

## Incident evidence checklist

Record:

- host and service unit;
- timer state and next/last activation;
- release commit;
- operational run ID;
- result classification and counts;
- approved failure fingerprints and reason codes;
- alert ID and delivery status;
- remediation and recovery verification.

Never record environment-file contents, `DATABASE_URL`, bearer token, raw stack traces, student identity or tenant/principal identifiers.
