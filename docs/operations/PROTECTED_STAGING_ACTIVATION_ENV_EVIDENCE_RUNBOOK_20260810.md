# Protected Staging Activation and Env Evidence Runbook - 2026-08-10

**Status:** execution request for NOG-01 and NOG-02, not accepted evidence  
**Decision after this runbook:** NO-GO until the protected staging run is executed and accepted  
**Protected staging evidence target SHA:** `a8d494f12618cc6b36c0eeae40a7b7b212754fbf`  
**Runtime candidate baseline SHA:** `03e77790630dac737a2d4cc4636b97e80de48ab3`  
**Evidence control baseline SHA:** `372c4192dabf8dc1ce2528d0272349cb8937a747`  
**Related blocker IDs:** `NOG-01`, `NOG-02`  
**Generated request:** `docs/launch/generated/protected-staging-env-evidence-request-20260810.json`

This runbook is the operator-facing execution request for the first protected
staging closure slice. It does not close either blocker by itself. It defines the
minimum safe way to collect accepted protected staging activation evidence and
redacted production-like environment evidence without exposing secrets.

## Release Lineage Rule

Do not silently move the staging target because documentation-only evidence PRs
were merged after the runtime candidate. The selected staging evidence target
remains `a8d494f12618cc6b36c0eeae40a7b7b212754fbf` unless the release owner
explicitly promotes another 40-character `main` SHA and records the promotion in
the launch packet.

The deployed application checkout, workflow checkout and `/api/health` commit
must all report the same selected SHA. If the deployment uses the runtime
candidate baseline `03e77790630dac737a2d4cc4636b97e80de48ab3` instead, the run is
not accepted for this request until the launch packet is updated to make that
choice explicit.

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
| `DATABASE_URL` | Private host env file | Present/valid only, never value |
| TecPey signing and CRM secrets | Private host env file | Present/distinct/length-policy only |
| Trusted proxy settings | Private host env file | Header allowlist and hop count only |

## NOG-01 Execution

Run the protected staging evidence workflow for the selected SHA:

```text
Workflow: Staging Community Challenge Scheduler Evidence
Environment: staging
release_sha: a8d494f12618cc6b36c0eeae40a7b7b212754fbf
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

From the immutable deployed release directory on protected staging, run the
production-like environment check with the private staging environment loaded.
The raw environment and raw logs must not be uploaded.

Minimum command shape:

```bash
cd "$TECPEY_STAGING_APP_DIR"
export NODE_ENV=production
npm run env:check
```

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
    "selectedSha": "a8d494f12618cc6b36c0eeae40a7b7b212754fbf",
    "artifactName": "tecpey-staging-scheduler-evidence.json",
    "artifactSha256": "sha256:<64-hex>",
    "verifierDisposition": "passed_or_failed",
    "acceptedAt": "<UTC ISO-8601>",
    "acceptedBy": "<role/name>"
  },
  "nog02": {
    "status": "accepted_or_rejected",
    "selectedSha": "a8d494f12618cc6b36c0eeae40a7b7b212754fbf",
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
- `env:check` fails or cannot run with production-like staging configuration;
- evidence contains raw secrets, raw URLs with credentials, host IPs, raw logs, customer rows, provider payloads, prompt transcripts or private keys.

## Resulting Decision

When this runbook is executed and accepted, only `NOG-01` and `NOG-02` may move
from open to accepted. The release remains NO-GO until recovery, rollback,
incident readiness, accepted-risk sign-off, approval matrix and gated capability
evidence are accepted or explicitly kept launch-disabled.
