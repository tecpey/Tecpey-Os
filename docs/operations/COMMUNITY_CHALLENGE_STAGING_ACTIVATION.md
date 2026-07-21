# Community Challenge Scheduler — Staging Activation Evidence

Issue: #227  
Predecessor: #223 / PR #224  
Related product parent: #160

## Status boundary

This document defines how an authorized operator proves that the Community Challenge finalizer scheduler is installed and healthy on the intended **staging host**.

Repository code, CI success, an enabled workflow or a generated template does not prove host activation. Activation is accepted only when the protected staging workflow runs on the intended self-hosted runner and produces an evidence artifact that passes the offline verifier.

This workflow cannot target production. Production activation requires a separate approved change, environment and evidence record.

## What the evidence proves

An accepted v1 artifact proves, for one exact release commit and one collection window:

- the workflow checkout and deployed application checkout use the same exact `main` commit;
- the deployed checkout has no tracked-file modifications;
- the workflow runs under the expected non-root runtime user and group;
- the runtime environment file and operational state directory are private and are not symlinks;
- the four installed systemd units byte-match templates rendered from the selected release;
- the finalizer and alert-delivery timers are enabled and active;
- the application health endpoint reports HTTP 200, `health=ok`, production runtime mode, matching commit, PostgreSQL `ok`, Redis `ok` and tracked migrations;
- migration `0050_operational_job_evidence.sql` exists in PostgreSQL;
- the latest Community Challenge scheduler run is recent and `succeeded`;
- no pending or quarantined operational alert exists;
- when requested, one uniquely identified `staging-alert-verification` probe reached the existing alert delivery archive;
- the JSON evidence has both an internal canonical digest and a detached file digest.

The artifact does not prove application business-flow correctness beyond these checks and does not authorize real-money operation.

## Privacy boundary

The evidence bundle contains no:

- environment-file content;
- database URL or credentials;
- alert webhook URL or bearer token;
- raw hostname or IP address;
- raw systemd journal output;
- student, tenant or principal identity;
- raw exception or stack trace.

The host is represented only by an HMAC-SHA-256 fingerprint. The HMAC key remains in the private runtime environment file.

## Required staging host layout

Use an immutable release directory, not a moving symlink, for evidence collection. Example:

```text
/srv/tecpey/releases/<40-char-commit>/
/etc/tecpey/staging.env
/var/lib/tecpey-staging/ops/
/etc/systemd/system/
/usr/bin/npm
```

The application directory supplied to the workflow must be a regular directory and a clean Git checkout at the exact selected release SHA. A path such as `/srv/tecpey/current` is not accepted when it is a symlink; pass the resolved immutable release directory.

## Runtime environment requirements

The private staging environment file must be a regular non-symlink file, normally mode `0640` or stricter, and must include unquoted single-line values for:

```bash
DATABASE_URL=postgresql://...
TECPEY_OPS_ALERT_WEBHOOK_URL=https://...
TECPEY_OPS_ALERT_BEARER_TOKEN=...
TECPEY_HOST_EVIDENCE_KEY=<at-least-32-random-characters>
```

`TECPEY_OPS_ALERT_BEARER_TOKEN` may be omitted only when the approved provider uses another governed authentication method. The evidence collector never prints these values.

The application itself must expose the build commit through:

```bash
NEXT_PUBLIC_GIT_COMMIT=<exact-release-sha>
```

The `/api/health` response must report the exact release SHA. A build whose health response says `unknown` cannot pass activation evidence.

## Initial scheduler installation

From the immutable deployed release directory, first run the existing installer dry-run and installation process described in [`COMMUNITY_CHALLENGE_SCHEDULER_RUNBOOK.md`](./COMMUNITY_CHALLENGE_SCHEDULER_RUNBOOK.md).

After installation, capture operator-local confirmation:

```bash
systemctl is-enabled tecpey-community-challenge-finalizer.timer
systemctl is-active tecpey-community-challenge-finalizer.timer
systemctl is-enabled tecpey-ops-alert-delivery.timer
systemctl is-active tecpey-ops-alert-delivery.timer
```

Run one controlled finalization pass before requesting activation evidence:

```bash
sudo systemctl start tecpey-community-challenge-finalizer.service
sudo systemctl status tecpey-community-challenge-finalizer.service --no-pager
```

The workflow requires a recent successful operational run. A missing, stale, `partial_failure` or `authority_unavailable` run fails verification.

## Self-hosted staging runner

The runner must:

- be dedicated to the intended staging host;
- run as the same non-root user and primary group used by the scheduler services;
- carry all labels: `self-hosted`, `linux`, `x64`, `tecpey-staging`;
- have read access to the immutable application checkout, private environment file, state directory and installed unit files;
- have `git`, Node.js 22, npm 10 and `systemctl` available;
- not receive broad passwordless sudo privileges for this workflow;
- not be shared with untrusted repositories or fork workflows.

The collector is read-only unless the workflow input `run_alert_probe` is enabled. The probe writes one synthetic warning alert through the existing operational spool and delivery path.

## Protected GitHub Environment

Create or verify the GitHub Environment named exactly:

```text
staging
```

Apply required reviewers and branch/deployment protection appropriate for TecPey operations.

Configure these **Environment variables**, not user-supplied workflow inputs:

| Variable | Meaning |
|---|---|
| `TECPEY_STAGING_APP_DIR` | Immutable deployed release directory |
| `TECPEY_STAGING_ENV_FILE` | Private runtime environment file |
| `TECPEY_STAGING_OPS_STATE_DIR` | Scheduler operational state directory |
| `TECPEY_STAGING_SYSTEMD_DIR` | Normally `/etc/systemd/system` |
| `TECPEY_STAGING_NPM_BIN` | Absolute executable npm path |
| `TECPEY_STAGING_RUN_USER` | Expected non-root runtime user |
| `TECPEY_STAGING_RUN_GROUP` | Expected primary runtime group |
| `TECPEY_STAGING_HEALTH_URL` | HTTPS staging `/api/health` URL or loopback HTTP URL |

Do not place database URLs, webhook URLs, bearer tokens or the host evidence key in GitHub Environment variables for this workflow. They remain in the private host environment file.

## Run the protected workflow

Open GitHub Actions and select:

```text
Staging Community Challenge Scheduler Evidence
```

Provide:

- `release_sha`: the exact 40-character lowercase commit already deployed to staging;
- `run_alert_probe`: `true` for the first activation and after alert-provider changes.

The workflow checks out the exact commit and verifies it is an ancestor of `origin/main`. It cannot select a branch name, tag name or production environment.

## Synthetic alert probe

The optional probe uses:

```text
job_name = staging-alert-verification
reason_code = staging_verification_probe
severity = warning
```

It is intentionally distinct from `community-challenge-finalization`. It cannot be interpreted as a student, challenge or production failure. The verifier requires the exact probe file to move from `alerts/pending` to `alerts/delivered`, with no duplicate remaining pending.

The probe may also retry older pending operational alerts. Any remaining pending item or any quarantine item causes activation verification to fail.

## Artifact contents

A successful run uploads for seven days:

```text
tecpey-staging-scheduler-evidence.json
tecpey-staging-scheduler-evidence.json.sha256
tecpey-staging-evidence-verification.json
```

The JSON contract is documented at:

[`evidence/community-challenge-host-evidence-v1.schema.json`](./evidence/community-challenge-host-evidence-v1.schema.json)

The TypeScript validator remains the executable source of truth and rejects unknown top-level fields.

## Acceptance checklist

The activation record is accepted only when all are true:

- workflow environment is `staging`;
- selected SHA is exact and belongs to `main`;
- collector passes;
- detached SHA-256 file matches the evidence bytes;
- internal canonical digest matches;
- source, deployed app and health commit all equal the selected SHA;
- application checkout is clean;
- installed unit hashes match release-rendered unit hashes;
- both timers are enabled and active;
- environment and state permissions are private;
- health reports PostgreSQL and Redis `ok`;
- migration 0050 is applied;
- latest scheduler run is no older than two hours and is `succeeded`;
- pending count is zero;
- quarantine count is zero;
- required alert probe is delivered;
- workflow artifact exists and the job summary is redacted.

Record the workflow run URL, release SHA, artifact name, approving operator and acceptance time in the release evidence log. Do not copy host secrets into an issue or pull request.

## Failure handling

### Release mismatch

Do not override the verifier. Confirm the immutable application checkout and `NEXT_PUBLIC_GIT_COMMIT`, rebuild if necessary and rerun.

### Unit drift

Do not manually edit the evidence. Re-run the governed installer from the exact release and verify `systemctl daemon-reload` completed.

### Unhealthy dependency

Treat database or Redis failure as a staging outage. Restore dependency health before evidence collection.

### Missing or unhealthy latest run

Inspect the finalizer service and controlled reason codes. Resolve the authority failure, run one controlled pass and recollect evidence.

### Pending or quarantined alerts

Inspect the protected spool as the runtime user. Preserve evidence, remediate provider/configuration failures and do not delete quarantine items merely to pass activation.

### Probe not delivered

Verify provider reachability and approved authentication without printing values. Run the alert delivery service and recollect only after delivery succeeds.

## Revocation and rollback

If the workflow later detects drift or dependency failure:

1. mark the previous activation evidence superseded;
2. disable the affected timer when continued operation is unsafe;
3. follow the scheduler rollback procedure;
4. deploy or restore an approved release;
5. generate a new protected staging artifact.

Never reuse an old artifact as proof for a different commit or collection window.

## Remaining boundary

Even after staging evidence passes:

- production remains unverified;
- real-money Exchange and custody remain governed by their own NO-GO gates;
- backup/restore, disaster recovery and complete Golden Path evidence remain separate operational programs;
- #160 remains open for remaining Social/Arena authorities.
