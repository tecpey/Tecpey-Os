# Protected Staging Activation and Env Evidence Runbook - 2026-08-10

**Status:** execution request for NOG-01 and NOG-02, not accepted evidence  
**Decision after this runbook:** NO-GO until the protected staging run is executed and accepted  
**Protected staging evidence target SHA:** `5c933f2499fa84f7e71fcd3a1076ffe12cf3149e`
**Runtime candidate baseline SHA:** `5c933f2499fa84f7e71fcd3a1076ffe12cf3149e`
**Candidate source of truth:** `docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md`  
**Related blocker IDs:** `NOG-01`, `NOG-02`  
**Generated request:** `docs/launch/generated/protected-staging-env-evidence-request-20260810.json`
**Execution status observation:** `docs/launch/generated/protected-staging-execution-status-20260812.json`
**Environment protection setup runbook:** `docs/operations/GITHUB_STAGING_ENVIRONMENT_PROTECTION_RUNBOOK_20260812.md`

This runbook is the operator-facing execution request for the first protected
staging closure slice. It does not close either blocker by itself. It defines the
minimum safe way to collect accepted protected staging activation evidence and
redacted production-like environment evidence without exposing secrets.

## Release Lineage Rule

Do not silently move the staging target because documentation-only or
launch-control PRs were merged after earlier draft packets. The selected staging
evidence target is the current candidate in
`docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md`:
`5c933f2499fa84f7e71fcd3a1076ffe12cf3149e`.

The deployed application checkout, workflow checkout, bundle manifest and
`/api/health` commit must all report the same selected SHA. If staging uses any
older draft baseline instead, the run is not accepted for this request until a
release-owner candidate-promotion PR makes that choice explicit.

## Required Protected Context

The evidence must come from the protected GitHub Environment named exactly
`staging` and the intended self-hosted runner. The runner labels must include:

```text
self-hosted
linux
x64
tecpey-staging
```

The runner must use the governed non-root runtime user and group configured for
TecPey staging. It must not run on a generic shared runner.

## Execution Status Observation - 2026-08-14

Current machine-readable status:
`docs/launch/generated/protected-staging-execution-status-20260812.json`.

Decision: `NO_GO_PROTECTED_STAGING_EXECUTION_BLOCKED`.

The latest GitHub API observation found the `staging` Environment exists, but
its `protection_rules: []` response means it cannot yet be treated as accepted
protected staging evidence. The protected env workflow has no observed runs, and
the only observed scheduler evidence run was cancelled on an older SHA. NOG-01
and NOG-02 remain open until the staging Environment has required protection
rules/reviewers and both manual workflow runs complete successfully for the
selected candidate SHA.

Post-promotion refresh: after PR #441 advanced `main` beyond the PR #439 target and the controlled-launch candidate was promoted to
`5c933f2499fa84f7e71fcd3a1076ffe12cf3149e`, a fresh GitHub API observation still returned `protection_rules: []`, zero protected env evidence
runs, and no accepted current-candidate scheduler evidence run. Follow
`docs/operations/GITHUB_STAGING_ENVIRONMENT_PROTECTION_RUNBOOK_20260812.md`
before dispatching either workflow.

## Required Environment Inputs

These values must be configured as protected GitHub Environment variables or
private host files according to `docs/operations/STAGING_READINESS_EVIDENCE_CONTRACT.md`.
Do not paste any raw value into the pull request, issue, job summary or evidence
manifest.

| Input | Source | Evidence allowed |
|---|---|---|
| `TECPEY_STAGING_APP_DIR` | GitHub Environment variable | Path policy pass/fail only |
| `TECPEY_STAGING_ENV_FILE` | GitHub Environment variable | File policy pass/fail only |
| `TECPEY_STAGING_OPS_STATE_DIR` | GitHub Environment variable | Directory policy pass/fail only |
| `TECPEY_STAGING_SYSTEMD_DIR` | GitHub Environment variable | Directory policy pass/fail only |
| `TECPEY_STAGING_NPM_BIN` | GitHub Environment variable | Executable policy pass/fail only |
| `TECPEY_STAGING_RUN_USER` | GitHub Environment variable | Match/mismatch only |
| `TECPEY_STAGING_RUN_GROUP` | GitHub Environment variable | Match/mismatch only |
| `TECPEY_STAGING_HEALTH_URL` | GitHub Environment variable | Scheme and endpoint class only |
| `DATABASE_URL` | Private host env file or service-manager preloaded environment | Present/valid only, never value |
| TecPey signing and CRM secrets | Private host env file or service-manager preloaded environment | Present/distinct/length-policy only |
| Trusted proxy settings | Private host env file or service-manager preloaded environment | Header allowlist and hop count only |

## NOG-01 Execution

Run the protected staging evidence workflow for the selected SHA:

```text
Workflow: Staging Community Challenge Scheduler Evidence
Environment: staging
release_sha: 5c933f2499fa84f7e71fcd3a1076ffe12cf3149e
run_alert_probe: true
```

The run is acceptable for NOG-01 only when it uploads all of these artifacts:

```text
tecpey-staging-scheduler-evidence.json
tecpey-staging-scheduler-evidence.json.sha256
tecpey-staging-evidence-verification.json
```

The accepted record must include only:

- workflow run HTTPS URL;
- artifact name and retention window;
- selected release SHA;
- detached SHA-256 digest;
- verifier disposition;
- operator and reviewer names or roles;
- UTC collection window;
- residual risk summary.

## NOG-02 Execution

Run the protected env evidence workflow for the selected SHA:

```text
Workflow: Protected Staging Env Evidence
Environment: staging
release_sha: 5c933f2499fa84f7e71fcd3a1076ffe12cf3149e
environment_source: protected_host_env_file
```

Use `environment_source: service_manager_preloaded_environment` only when the
governed service-manager validation unit described below is installed and
reviewed. The workflow must upload all of these artifacts:

```text
tecpey-staging-env-evidence.json
tecpey-staging-env-evidence.json.sha256
tecpey-staging-env-evidence-verification.json
```

The workflow executes the production-like environment check from the immutable
deployed release directory on protected staging with an accepted protected
environment source: either the protected host env file loaded or the
service-manager preloaded environment verified. The raw environment and raw logs
must not be uploaded.

Use exactly one of the following two modes and record that selected mode in the
manifest. Do not record a combined source value.

### Mode A: protected host env file

Use this mode only when `TECPEY_STAGING_ENV_FILE` points to the governed
protected host env file.

```bash
cd "$TECPEY_STAGING_APP_DIR"

set -a
# TECPEY_STAGING_ENV_FILE points to the protected host env file. The
# file must contain shell-compatible KEY=VALUE entries and must never be
# printed, uploaded or copied into PR/issue evidence.
. "$TECPEY_STAGING_ENV_FILE"
set +a

export NODE_ENV=production
npm run env:check
```

### Mode B: service-manager preloaded environment

Use this mode only when the service manager provides the protected environment to
the running staging application and a governed validation unit or equivalent
service-managed command runs `npm run env:check` inside that same environment.
The operator shell must not execute `npm run env:check` directly for this mode,
because it does not inherit the application service environment.

Minimum service-manager bridge shape:

```bash
cd "$TECPEY_STAGING_APP_DIR"

# TECPEY_STAGING_ENV_CHECK_UNIT is the governed validation unit that uses
# the same service-manager environment source as the staging application.
# Record only the redacted unit class and pass/fail disposition.
sudo systemctl start "$TECPEY_STAGING_ENV_CHECK_UNIT"
sudo systemctl show "$TECPEY_STAGING_ENV_CHECK_UNIT" \
  --property=Result \
  --property=ExecMainStatus \
  --property=ExecMainCode \
  --value
```

If the host does not provide a governed service-manager validation unit or
equivalent service-managed command using the same environment source as the
staging application, do not use `service_manager_preloaded_environment`. Fall
back to `protected_host_env_file` or reject NOG-02 until an executable bridge is
installed and reviewed. A run that exports only `NODE_ENV` is not acceptable for
NOG-02 because it does not validate the private production-like staging
configuration.

The accepted redacted result must prove that the following checks passed without
printing values:

| Check family | Accepted evidence |
|---|---|
| Public URLs | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_API_BACKEND_URL`, and `NEXT_PUBLIC_API_SOCKET_URL` present and non-placeholder |
| Signing secrets | Required TecPey secrets present, length-valid and distinct |
| CRM PII key | `TECPEY_CRM_PII_KEY_B64` decodes to exactly 32 bytes |
| Trusted proxy | `TECPEY_TRUSTED_PROXY_HEADER` is in the allowlist and `TECPEY_TRUSTED_PROXY_HOPS` is within 1-10 |
| `DATABASE_URL` | Present, non-placeholder and accepted by the validator |
| Optional webhooks | HTTPS in production and paired with the required secret when enabled |
| Legacy auth | Disabled or within the immutable sunset policy |
| AI Mentor models | Approved allowlist only when configured |
| CSP connection policy | `scripts/validate-csp-connection-env.ts` reports pass |

The accepted NOG-02 artifact must record only:

- workflow run HTTPS URL;
- artifact name and retention window;
- selected release SHA;
- selected `environment_source`;
- detached SHA-256 digest;
- `env:check` disposition;
- CSP connection validation disposition;
- operator and reviewer names or roles;
- UTC collection window;
- residual risk summary.

If `env:check` fails, record only the failing key names and policy class. Do not
record raw values, URLs, database DSNs, bearer tokens, private keys or stack
traces.

## Evidence Manifest Fields

The final launch evidence manifest may reference this run only after these
fields are known:

```json
{
  "nog01": {
    "status": "accepted_or_rejected",
    "workflowRunUrl": "https://github.com/tecpey/Tecpey-Os/actions/runs/<id>",
    "selectedSha": "5c933f2499fa84f7e71fcd3a1076ffe12cf3149e",
    "artifactName": "tecpey-staging-scheduler-evidence.json",
    "artifactSha256": "sha256:<64-hex>",
    "verifierDisposition": "passed_or_failed",
    "acceptedAt": "<UTC ISO-8601>",
    "acceptedBy": "<role/name>"
  },
  "nog02": {
    "status": "accepted_or_rejected",
    "selectedSha": "5c933f2499fa84f7e71fcd3a1076ffe12cf3149e",
    "environmentSource": "<exactly_one_of:protected_host_env_file|service_manager_preloaded_environment>",
    "environmentSourceProofDisposition": "passed_or_failed",
    "envCheckDisposition": "passed_or_failed",
    "redactedSummarySha256": "sha256:<64-hex>",
    "cspConnectionDisposition": "passed_or_failed",
    "acceptedAt": "<UTC ISO-8601>",
    "acceptedBy": "<role/name>"
  }
}
```

## Rejection Conditions

Reject the slice and keep `NOG-01` and `NOG-02` open if any of these occur:

- selected SHA is not exact or does not match the deployed app and health commit;
- workflow did not run in protected environment `staging`;
- runner labels or runtime user/group do not match the governed staging host;
- app directory, env file, state directory or systemd directory is a symlink where the contract forbids it;
- `/api/health` does not report healthy PostgreSQL and Redis;
- alert pending or quarantine count is non-zero after the probe;
- detached digest or verifier summary is missing;
- `env:check` fails or cannot run with production-like staging configuration from an accepted environment source;
- selected environment source is `protected_host_env_file` and the protected env file is not loaded, cannot be loaded, or is replaced by an unverified shell environment;
- selected environment source is `service_manager_preloaded_environment` and `env:check` is not run through a governed service-manager validation unit or equivalent service-managed command that uses the same environment source as the staging application, cannot be proven without printing values, or is replaced by direct operator-shell execution/ad hoc exports;
- evidence contains raw secrets, raw URLs with credentials, host IPs, raw logs, customer rows, provider payloads, prompt transcripts or private keys.

## Resulting Decision

When this runbook is executed and accepted, only `NOG-01` and `NOG-02` may move
from open to accepted. The release remains NO-GO until recovery, rollback,
incident readiness, accepted-risk sign-off, approval matrix and gated capability
evidence are accepted or explicitly kept launch-disabled.
