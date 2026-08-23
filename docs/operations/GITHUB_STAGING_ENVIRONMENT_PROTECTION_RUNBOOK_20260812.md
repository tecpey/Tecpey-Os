# GitHub Staging Environment Protection Runbook - 2026-08-12

**Status:** protection prerequisite satisfied; exact-candidate deployment and workflow acceptance still required
**Repository:** `tecpey/Tecpey-Os`  
**Environment name:** `staging`  
**Last recorded observation:** `required_reviewers` and `branch_policy`; administrator bypass disabled (must be re-verified immediately before dispatch)
**Selected protected staging evidence target SHA:** `80223ac41e6200c25b65777a4a98b5f2e90f56a1`

This runbook closes the ambiguity before the protected staging workflows are
dispatched. It does not close NOG-01 or NOG-02 by itself. It defines the minimum
GitHub Environment and runner setup that must exist before the evidence
workflows can produce accepted artifacts.

## Why This Exists

The latest GitHub API observation found that the `staging` Environment exists
with the required reviewer and branch-policy rule classes, while administrator
bypass is disabled. Reviewer identities are intentionally omitted. Re-read this
state immediately before dispatch; do not treat the recorded observation as
permanent proof:

```text
GET /repos/tecpey/Tecpey-Os/environments/staging
protection_rules: [required_reviewers, branch_policy]
can_admins_bypass: false
```

This satisfies the protection prerequisite. It does not prove the selected
release is deployed and does not close NOG-01 or NOG-02. Dispatch only after the
exact immutable release directory exists and the intended self-hosted runner is
available.

## Required Setup

Configure the GitHub Environment named exactly `staging`:

| Setting | Required disposition |
|---|---|
| Environment name | `staging` |
| Required reviewers | At least one release-owner reviewer; two reviewers preferred when available |
| Admin bypass | Must remain disabled; any observed bypass capability is a failed protection prerequisite |
| Deployment branches | Restrict to `main` when available; otherwise rely on workflow SHA validation and record the branch-policy residual risk |
| Environment variables | Configure only the named variables below; do not store raw secrets in documents |
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

Set `TECPEY_STAGING_ENV_CHECK_UNIT` only when NOG-02 uses
`service_manager_preloaded_environment`. If that unit is not installed and
reviewed, use `protected_host_env_file`.

## Forbidden Material

Never put these values in GitHub comments, PR bodies, issue text, workflow
summaries, artifacts, screenshots or repo files:

- raw `DATABASE_URL`;
- raw host IPs or private hostnames;
- raw `.env` file contents;
- private keys, signing secrets, webhook secrets, API keys or bearer tokens;
- customer rows, user identifiers, provider payloads or raw logs.

Evidence may record only pass/fail dispositions, selected SHA, artifact names,
detached SHA-256 digests, workflow HTTPS URLs, UTC timestamps, reviewer roles
and residual risk notes.

## Dispatch Order

After the Environment protection and runner setup are complete, dispatch these
manual workflows from GitHub Actions against the selected candidate SHA.

### NOG-01

```text
Workflow: Staging Community Challenge Scheduler Evidence
Environment: staging
release_sha: 80223ac41e6200c25b65777a4a98b5f2e90f56a1
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
release_sha: 80223ac41e6200c25b65777a4a98b5f2e90f56a1
environment_source: protected_host_env_file
```

Use `service_manager_preloaded_environment` only after the governed validation
unit is installed and reviewed.

Accepted artifact set:

```text
tecpey-staging-env-evidence.json
tecpey-staging-env-evidence.json.sha256
tecpey-staging-env-evidence-verification.json
```

## Acceptance Rule

NOG-01 and NOG-02 remain open until all of the following are true:

- `staging` reports both `required_reviewers` and `branch_policy`, and
  `can_admins_bypass` is false;
- the accepted runs use the selected SHA
  `80223ac41e6200c25b65777a4a98b5f2e90f56a1`;
- both workflows run on the `tecpey-staging` self-hosted runner;
- both workflows complete successfully;
- artifacts and detached digests verify offline;
- evidence contains no forbidden material;
- an operator and reviewer record the accepted run URLs and residual risks.

If any item above is missing, preserve the final decision as
`NO_GO_PROTECTED_STAGING_EXECUTION_BLOCKED`.
