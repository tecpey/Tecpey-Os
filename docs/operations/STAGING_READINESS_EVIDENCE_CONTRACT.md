# Staging Readiness Evidence Contract

Issue: #229  
Related workflow: [`staging-community-challenge-scheduler-evidence.yml`](../../.github/workflows/staging-community-challenge-scheduler-evidence.yml)  
Related runbook: [`COMMUNITY_CHALLENGE_STAGING_ACTIVATION.md`](./COMMUNITY_CHALLENGE_STAGING_ACTIVATION.md)

## Status boundary

This contract defines the minimum evidence required before TecPey may claim a
release is activated on a protected staging host.

Repository CI, a successful build, a deployed directory, or a manually captured
screenshot does not prove staging readiness. Staging readiness is accepted only
when a protected GitHub Environment named `staging` runs on the intended
self-hosted runner, checks out one exact `main` SHA, collects host evidence from
the deployed release, and verifies that evidence offline.

This contract does not authorize production deployment, real-money Exchange,
custody, deposits, withdrawals, or public financial availability.

## Required evidence pillars

An accepted staging artifact must prove every pillar below for one exact release
commit and one collection window:

| Pillar | Required proof |
|---|---|
| Exact release identity | Workflow checkout, deployed application checkout, and `/api/health` commit all equal the selected 40-character `main` SHA. |
| Protected runner identity | The job runs in GitHub Environment `staging` on the expected self-hosted runner labels and non-root runtime user/group. |
| Immutable host layout | The deployed application directory, runtime environment file, operational state directory, and systemd unit directory are non-symlinked governed paths. |
| Runtime health | `/api/health` returns HTTP 200 with `health=ok`, production runtime mode, PostgreSQL `ok`, Redis `ok`, tracked migrations, and the selected commit. |
| Systemd activation | Required service and timer unit files byte-match release-rendered templates; timers are enabled and active. |
| Database operational evidence | The operational job evidence migration exists and the latest governed scheduler run is recent and `succeeded`. |
| News materialization evidence | `tecpey-news-materialization.service` executes on the protected staging host, `tecpey-news-materialization.timer` is active, and `news-materialization-last-run.json` is recent, successful, hash-verified and free of sensitive material. |
| Alert delivery evidence | Operational alert pending and quarantine counts are zero; a requested synthetic staging probe is delivered through the approved alert path. |
| Privacy and digest integrity | Evidence excludes raw secrets, hostnames, IPs, user identifiers, and raw logs; canonical and detached SHA-256 digests verify the accepted bytes. |

## Acceptance checklist

The release evidence log may mark staging accepted only when all checks below
are true:

- workflow run URL is recorded;
- selected SHA is exact, belongs to `origin/main`, and matches the deployed app;
- protected environment is exactly `staging`;
- self-hosted runner labels include `self-hosted`, `linux`, `x64`, and `tecpey-staging`;
- runtime user and group match the configured staging service identity;
- application checkout has no tracked-file modifications;
- health endpoint reports the selected commit and healthy PostgreSQL/Redis;
- required migration evidence is present;
- systemd units match release-rendered templates and timers are active;
- latest operational scheduler run is fresh and successful;
- latest news materialization run is fresh and successful when the release includes `.github/workflows/staging-news-materialization-evidence.yml`;
- alert spool has zero pending and zero quarantined items;
- required synthetic alert probe was delivered;
- evidence artifact, detached digest, and verifier summary were uploaded;
- approving operator, acceptance timestamp, artifact name, and residual risks are recorded.

## Residual risks

Passing this contract proves protected staging activation for the current
repository-owned host evidence path. It does not prove:

- production host activation;
- production backup, restore, or disaster-recovery execution;
- payment-provider, custody, HSM/MPC, chain-provider, or compliance approval;
- complete business-flow QA for every Academy, Arena, Mentor, Exchange, CRM, or
  notification workflow;
- public launch readiness without final release reconciliation.

Any document, README, investor note, release note, or status report must preserve
this boundary when referencing staging evidence.
