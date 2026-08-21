# Protected Staging Activation and Env Evidence Runbook — 2026-08-21

**Status:** execution request for NOG-01 and NOG-02, not accepted evidence  
**Decision after this runbook:** NO-GO until the protected staging run is executed and accepted  
**Protected staging evidence target SHA:** `1c2172144f5a5fbe3037a262c67cb9799585c1b2`  
**Runtime candidate baseline SHA:** `1c2172144f5a5fbe3037a262c67cb9799585c1b2`  
**Candidate source of truth:** `docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md`  
**Related blocker IDs:** `NOG-01`, `NOG-02`  
**Generated request:** `docs/launch/generated/protected-staging-env-evidence-request-20260810.json`  
**Execution status observation:** `docs/launch/generated/protected-staging-execution-status-20260812.json`  
**Environment protection setup runbook:** `docs/operations/GITHUB_STAGING_ENVIRONMENT_PROTECTION_RUNBOOK_20260812.md`

## Identity rule

All protected staging evidence in this cycle must target the exact candidate above. Do not silently move the staging target because documentation-only or
launch-control PRs were merged. A runtime, deployment, security, bundle or launch-control change requires a new candidate-promotion cycle.

## Preconditions

Before dispatch, the GitHub Environment must be exactly `staging`, protection/reviewer rules must be active, and the runner must carry `self-hosted`, `linux`, `x64`, `tecpey-staging`. The runner host must have the governed non-root runtime identity and the protected environment source configured. Never paste raw secrets, database URLs, host IPs, process environments or service-manager environment output into GitHub evidence.

Required protected environment variables point to the app directory, protected environment source, runtime user/group and health URL. Their values are operational configuration and are not recorded in repository evidence.

## NOG-01 — activation/scheduler evidence

Dispatch the governed staging scheduler evidence workflow with:

```yaml
release_sha: 1c2172144f5a5fbe3037a262c67cb9799585c1b2
run_alert_probe: true
```

Accept only when checkout SHA, deployed app SHA and `/api/health` commit all match the selected SHA; PostgreSQL and Redis health are good; required systemd units/timers are active; pending/quarantine alert counts are zero; the synthetic alert probe is delivered; and canonical plus detached SHA-256 verification passes.

Expected artifact set includes `tecpey-staging-scheduler-evidence.json`, its detached digest, and the verification summary.

## NOG-02 — redacted environment evidence

**Workflow: Protected Staging Env Evidence**

Default dispatch:

```yaml
release_sha: 1c2172144f5a5fbe3037a262c67cb9799585c1b2
environment_source: protected_host_env_file
```

The alternative governed mode is `service_manager_preloaded_environment`, but only through the repository's governed service-managed validation unit/equivalent command using the same environment source as the application. Direct shell/process-environment dumps are not evidence.

Expected artifact files:

- `tecpey-staging-env-evidence.json`
- `tecpey-staging-env-evidence.json.sha256`
- `tecpey-staging-env-evidence-verification.json`

The accepted record contains only the environment-source mode, redacted dispositions, failing key names if any, artifact URL/ID, digest and timestamps. Raw values are forbidden.

## Acceptance sequence

1. Configure protected `staging` Environment and reviewer protection.
2. Connect the governed `tecpey-staging` self-hosted runner.
3. Verify the exact app checkout is `1c2172144f5a5fbe3037a262c67cb9799585c1b2` and clean.
4. Dispatch NOG-01 workflow with the exact SHA and alert probe enabled.
5. Dispatch **Protected Staging Env Evidence** with the exact SHA and governed `environment_source`.
6. Download artifacts, verify detached digests and repository verifiers, and record only bounded metadata.
7. Keep NOG-01/NOG-02 open on any mismatch, missing protection rule, failed health check, missing artifact or sensitive-data leak.

Passing this runbook closes only NOG-01/NOG-02 when their evidence is genuinely accepted. NOG-05, NOG-07, NOG-08 and NOG-09 remain separate gates; real-money Exchange, custody/deposits/withdrawals, enterprise, white-label and public rewards remain launch-disabled.
