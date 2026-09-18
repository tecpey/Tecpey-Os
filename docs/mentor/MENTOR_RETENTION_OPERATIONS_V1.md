# Mentor Privacy & Retention Operations v1

The Mentor retention worker is a **daily, bounded, auditable** cleanup path for
student Mentor memory/history. It exists so retention labels are enforced by
runtime operations rather than documentation alone.

## Privacy authority

Migration `0104_mentor_privacy_retention_authority.sql` makes external AI
provider use default-off at the database layer. Existing preference rows with
`external_provider_enabled = TRUE` but no `consented_at` evidence are reset to
false. Explicitly consented rows are preserved.

## Retention authority

The worker deletes, in bounded `FOR UPDATE SKIP LOCKED` batches:

- `mentor_memories` whose `expires_at` is in the past;
- `mentor_conversations` labelled `mentor_history_90d` after 90 days.

Database unavailability is not treated as a successful zero-delete run.
A drain-limit hit is persisted as partial failure and exits non-zero so operations
can investigate backlog growth.

## Scheduler

The systemd timer runs daily at **03:35 UTC**, uses `Persistent=true` for
catch-up after downtime, and adds a bounded randomized delay. The service runs as
the non-root TecPey runtime user with `ProtectSystem=strict`,
`NoNewPrivileges=true`, private temporary storage and an empty capability set.

Install after the release is deployed:

```bash
sudo env \
  TECPEY_APP_DIR=/srv/tecpey/current \
  TECPEY_ENV_FILE=/etc/tecpey/staging.env \
  TECPEY_RUN_USER=tecpey \
  bash /srv/tecpey/current/scripts/install-mentor-retention-scheduler.sh
```

Verify:

```bash
systemctl status tecpey-mentor-retention.timer --no-pager
systemctl list-timers tecpey-mentor-retention.timer --all --no-pager
journalctl -u tecpey-mentor-retention.service -n 100 --no-pager
```

A staging activation is complete only after a real successful oneshot run has
written `platform_operational_job_runs` evidence for
`mentor-retention-cleanup`.
