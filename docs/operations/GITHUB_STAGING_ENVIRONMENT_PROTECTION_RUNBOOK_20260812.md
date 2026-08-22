# GitHub Staging Environment Protection Runbook — 2026-08-22

**Status:** operator setup prerequisite for NOG-01 and NOG-02, not accepted launch evidence  
**Repository:** `tecpey/Tecpey-Os`  
**Environment name:** `staging`  
**Last accepted observation:** `protection_rules: []`  
**Selected protected staging evidence target SHA:** `c154702f9c927df971dc08787c939357956be97d`

This runbook defines the minimum GitHub Environment and self-hosted runner setup required before protected-staging workflows can produce accepted evidence. It does not close NOG-01 or NOG-02 by itself.

## Current fail-closed boundary

The last repository-recorded GitHub Environment observation showed:

```text
protection_rules: []
can_admins_bypass: true
```

Until a fresh operator-side observation proves protection rules/reviewers are configured, preserve `NO_GO_PROTECTED_STAGING_EXECUTION_BLOCKED`. A successful unprotected workflow is not accepted as protected-staging evidence.

## Required Setup

Configure the GitHub Environment named exactly `staging`:

| Setting | Required disposition |
|---|---|
| Environment name | `staging` |
| Required reviewers | At least one release-owner reviewer; two reviewers preferred when available |
| Admin bypass | Disable if the GitHub plan allows it; otherwise record the residual risk without bypassing review |
| Deployment branches | Restrict to `main` when available; otherwise enforce exact-SHA validation and record branch-policy residual risk |
| Environment variables | Configure only governed names; never store raw values in repository evidence |
| Self-hosted runner | Online runner with labels `self-hosted`, `linux`, `x64`, `tecpey-staging` |

Required Environment variables:

```text
TECPEY_STAGING_APP_DIR
TECPEY_STAGING_ENV_FILE
TECPEY_STAGING_OPS_STATE_DIR
TECPEY_STAGING_SYSTEMD_DIR
TECPEY_STAGING_NPM_BIN
TECPEY_STAGING_RUN_USER
TECPEY_STAGING_RUN_GROUP
TECPEY_STAGING_HEALTH_URL
```

Set `TECPEY_STAGING_ENV_CHECK_UNIT` only when NOG-02 uses `service_manager_preloaded_environment`. Otherwise use `protected_host_env_file`.

## Forbidden Material

Never place raw `DATABASE_URL`, host IP/private hostname, `.env` contents, private keys, signing/webhook/API secrets, bearer tokens, customer rows, provider payloads or raw logs in GitHub comments, PRs, issues, workflow summaries, screenshots or repository evidence.

Evidence may record only bounded pass/fail dispositions, selected SHA, artifact identifiers, detached SHA-256 digests, governed workflow HTTPS URLs, UTC timestamps, reviewer roles and residual-risk notes.

## Dispatch Order

### NOG-01

```text
Workflow: Staging Community Challenge Scheduler Evidence
Environment: staging
release_sha: c154702f9c927df971dc08787c939357956be97d
run_alert_probe: true
```

Accepted artifact set:

```text
tecpey-staging-scheduler-evidence.json
tecpey-staging-scheduler-evidence.json.sha256
tecpey-staging-evidence-verification.json
```

### NOG-02

```text
Workflow: Protected Staging Env Evidence
Environment: staging
release_sha: c154702f9c927df971dc08787c939357956be97d
environment_source: protected_host_env_file
```

Use `service_manager_preloaded_environment` only after the governed validation unit is installed and reviewed.

Accepted artifact set:

```text
tecpey-staging-env-evidence.json
tecpey-staging-env-evidence.json.sha256
tecpey-staging-env-evidence-verification.json
```

## Acceptance Rule

NOG-01 and NOG-02 remain open until all of the following are true:

- `staging` no longer reports `protection_rules: []`;
- Required reviewers/protection are observed before dispatch;
- accepted runs use exact SHA `c154702f9c927df971dc08787c939357956be97d`;
- both workflows run on the `self-hosted`, `linux`, `x64`, `tecpey-staging` runner;
- both workflows complete successfully;
- artifacts and detached digests verify;
- evidence contains no forbidden material;
- independent operator/reviewer roles record accepted run URLs and residual risks.

If any item is missing, keep `NO_GO_PROTECTED_STAGING_EXECUTION_BLOCKED`.
