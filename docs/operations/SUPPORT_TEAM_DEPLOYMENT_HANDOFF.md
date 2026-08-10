# TecPey Support Team Deployment Handoff

This handoff is for an infrastructure/support team that receives a TecPey
controlled deployment artifact and operates the Ubuntu server. It is
intentionally operational and evidence-focused: install the exact candidate, run
the checks, and return non-secret proof.

Source bundles are not the default delivery model. They are permitted only as a
staging/support exception under
`docs/security/SOURCE_CODE_OWNERSHIP_AND_DELIVERY_POLICY.md`.

> This TecPey package is proprietary and confidential. Access is granted only
> for the approved installation or verification task. No ownership, resale,
> sublicensing, redistribution, reverse-engineering, or competing use is granted.
> All rights remain with TechnoPardakht.

## Decision Boundary

Use this bundle for **staging/candidate activation** unless a reviewed immutable
container digest is also supplied. Production promotion remains gated by the
contract in `docs/operations/PRODUCTION_DEPLOYMENT_CONTRACT.md`.

Do not deploy by copying files over the live directory. Always unpack into an
isolated candidate path first.

## Required Server Baseline

- Ubuntu 24.04 LTS.
- Docker Engine and Docker Compose plugin for the preferred Compose path.
- Node.js 22 and npm 10 for source/candidate verification.
- PostgreSQL 16 and Redis 7 when not using the included Compose services.
- Nginx with TLS termination.
- A non-root runtime user, for example `tecpey`.
- Private, server-side `.env.production`; never return this file in evidence.

Recommended launch capacity:

- Minimum: 4 vCPU, 8 GB RAM, NVMe SSD.
- Recommended: 8 vCPU, 16 GB RAM for AI, Academy, community, and future workers.

## Inputs We Send To Support

| Item | Required | Notes |
| --- | --- | --- |
| Controlled artifact zip | Yes | Prefer immutable image digest. Source zip requires explicit exception approval. |
| SHA256 file | Yes | Used to verify the received zip before unpacking. |
| Release SHA | Yes | Must match the bundle manifest and runtime evidence. |
| `.env.production.example` | Included | Template only; support must create `.env.production` privately. |
| `TECPEY_IMAGE_DIGEST` | Preferred | Required for the approved Docker Compose production path. |
| `POSTGRES_PASSWORD` / `REDIS_PASSWORD` | Yes | Must be set outside Git and outside chat. |
| Domain/DNS values | Yes | `tecpey.ir`, `my.tecpey.ir`, API/socket origins as approved. |

## Release Owner Artifact Path

Use this path when TecPey does not have direct server access and the support
team will receive only a zip package for installation.

Create the bundle through the manual GitHub Actions workflow:

```text
Support Deployment Bundle
```

Required workflow inputs:

| Input | Value |
| --- | --- |
| `release_ref` | Prefer the exact reviewed release SHA. Use `main` only for a fresh candidate from the current default branch. |
| `source_bundle_exception_approval` | `I_APPROVE_SOURCE_BUNDLE_EXCEPTION` |

The workflow checks out the requested ref, resolves the exact release SHA,
creates the exception-approved source bundle with
`TECPEY_SOURCE_BUNDLE_EXCEPTION_APPROVED=1`, runs
`npm run support:bundle:verify`, and uploads an artifact named:

```text
tecpey-support-deployment-EXACT_RELEASE_SHA
```

The artifact must contain exactly the support zip, its detached `.sha256` file,
and `SUPPORT_ARTIFACT_README.md`. Before sending anything to support, the
release owner must download the artifact and verify the detached digest locally:

```bash
sha256sum -c tecpey-deployment-EXACT_RELEASE_SHA.zip.sha256
```

Send support only:

- `tecpey-deployment-EXACT_RELEASE_SHA.zip`
- `tecpey-deployment-EXACT_RELEASE_SHA.zip.sha256`
- this handoff, or the path to this handoff inside the bundle

Do not send GitHub artifact links in public issues, public PR comments, chat
threads, or any channel that is not approved for proprietary TecPey source
delivery. The workflow artifact retention is intentionally short; if the support
window expires, regenerate the artifact from the same exact release SHA.

## Preflight Before Unpack

Before sending the bundle to support, the release owner should verify the local
bundle shape and detached digest:

```bash
npm run support:bundle:verify -- tecpey-deployment-RELEASE_SHA.zip tecpey-deployment-RELEASE_SHA.zip.sha256
```

Support should also verify the received zip:

```bash
sha256sum -c tecpey-deployment-RELEASE_SHA.zip.sha256
```

Then unpack into an isolated candidate directory:

```bash
sudo mkdir -p /var/www/tecpey-candidates
sudo chown -R tecpey:tecpey /var/www/tecpey-candidates
sudo -u tecpey unzip tecpey-deployment-RELEASE_SHA.zip -d /var/www/tecpey-candidates
cd /var/www/tecpey-candidates/tecpey-deployment-RELEASE_SHA
```

Never unpack directly into `/var/www/tecpey`.

## Environment Setup

Create the production environment file privately:

```bash
cp .env.production.example .env.production
nano .env.production
```

Rules:

- Replace every `REPLACE_WITH` value.
- Keep `DATABASE_URL` and `REDIS_URL` aligned with the chosen runtime.
- For Compose, keep internal service hosts `postgres` and `redis`.
- Do not use `localhost` from inside containers for PostgreSQL or Redis.
- Keep real withdrawals disabled until custody is separately approved:
  `TECPEY_REAL_WITHDRAWALS_ENABLED=0`.
- Do not paste `.env.production` into GitHub issues, screenshots, chat, or logs.

Run:

```bash
npm run env:check
```

## Preferred Compose Candidate Path

Use this when a reviewed `TECPEY_IMAGE_DIGEST` is supplied:

```bash
export TECPEY_IMAGE_DIGEST='sha256:REVIEWED_RELEASE_DIGEST'
export POSTGRES_PASSWORD='SECRET_FROM_APPROVED_MANAGER'
export REDIS_PASSWORD='SECRET_FROM_APPROVED_MANAGER'
docker compose -f docker-compose.production.yml config
docker compose -f docker-compose.production.yml up -d
```

Health check:

```bash
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/health
```

Traffic is allowed only when `/api/health` returns:

- `ok: true`
- `health: "ok"`
- database `ok`
- schema `current`
- Redis `ok`
- runtime `ready`
- required workers `ready` or governed `disabled`

## Source Candidate Verification Path

Use this only when support has an exception-approved source zip and no reviewed
image digest. This path verifies a staging candidate; it must not be presented as
immutable production supply-chain evidence or as a white-label resale package.

Before a source zip is generated, the release owner must intentionally set:

```bash
export TECPEY_SOURCE_BUNDLE_EXCEPTION_APPROVED=1
```

Do not set this variable for routine production deployment, white-label sales,
or customer delivery.

From the unpacked candidate root:

```bash
bash scripts/ubuntu24-preflight.sh candidate
bash scripts/ubuntu24-preflight.sh migrate
```

After infrastructure performs the approved service promotion/restart, verify:

```bash
bash scripts/ubuntu24-preflight.sh runtime
```

If the candidate was unpacked without Git metadata, preflight reads the release
SHA from `SUPPORT_BUNDLE_MANIFEST.txt`. Support must verify the zip SHA256 before
running preflight and record the manifest release SHA in every returned evidence
file.

## Optional GitHub Staging Runner

If we need GitHub Actions protected staging evidence, support must register or
start a self-hosted runner on the staging host with these labels:

```text
self-hosted, linux, x64, tecpey-staging
```

The runner must execute as the same non-root user/group used by the staging
services. The GitHub environment must be named exactly:

```text
staging
```

Required GitHub environment variables:

| Variable | Meaning |
| --- | --- |
| `TECPEY_STAGING_APP_DIR` | Live staging app directory. |
| `TECPEY_STAGING_ENV_FILE` | Private env file path. |
| `TECPEY_STAGING_OPS_STATE_DIR` | Scheduler/evidence state path. |
| `TECPEY_STAGING_SYSTEMD_DIR` | Systemd unit directory. |
| `TECPEY_STAGING_NPM_BIN` | npm binary used by staging. |
| `TECPEY_STAGING_RUN_USER` | Expected runner user. |
| `TECPEY_STAGING_RUN_GROUP` | Expected runner group. |
| `TECPEY_STAGING_HEALTH_URL` | Staging health URL. |

Then run the workflow:

```text
Staging Community Challenge Scheduler Evidence
```

with:

```text
release_sha = EXACT_RELEASE_SHA
run_alert_probe = true
```

For news materialization evidence, run the separate workflow:

```text
Staging News Materialization Evidence
```

with:

```text
release_sha = EXACT_RELEASE_SHA
```

The returned artifact must include `news-materialization-last-run.json`, its
detached SHA-256 digest, verifier output, and the rendered systemd service/timer
captures. A queued GitHub deployment alone is not accepted as staging proof.

## Optional News Materialization Timer

If the staging or candidate host is systemd-managed, support may install the
news materialization timer from the exact unpacked candidate. Use the same
non-root service identity as the web runtime and keep the state directory
private to that identity.

Dry-run first:

```bash
export TECPEY_APP_DIR="/var/www/tecpey-candidates/tecpey-deployment-RELEASE_SHA"
export TECPEY_ENV_FILE="$TECPEY_APP_DIR/.env.production"
export TECPEY_OPS_STATE_DIR="/var/lib/tecpey/ops"
export TECPEY_RUN_USER="tecpey"
export TECPEY_RUN_GROUP="tecpey"
export TECPEY_DRY_RUN=1
npm run news:materialization:install
```

If dry-run passes and the infrastructure owner approves systemd writes:

```bash
sudo env \
  TECPEY_APP_DIR="$TECPEY_APP_DIR" \
  TECPEY_ENV_FILE="$TECPEY_ENV_FILE" \
  TECPEY_OPS_STATE_DIR="$TECPEY_OPS_STATE_DIR" \
  TECPEY_RUN_USER="$TECPEY_RUN_USER" \
  TECPEY_RUN_GROUP="$TECPEY_RUN_GROUP" \
  npm run news:materialization:install
```

Then verify:

```bash
systemctl is-enabled tecpey-news-materialization.timer
systemctl is-active tecpey-news-materialization.timer
sudo systemctl start tecpey-news-materialization.service
TECPEY_NEWS_MATERIALIZATION_LAST_RUN_FILE="$TECPEY_OPS_STATE_DIR/news-materialization-last-run.json" \
TECPEY_NEWS_MATERIALIZATION_EXPECTED_LOCALES="fa,en" \
  npm run news:materialization:last-run:verify
```

## Evidence Support Must Return

Return only non-secret evidence:

- Zip SHA256 verification output.
- Release SHA from `SUPPORT_BUNDLE_MANIFEST.txt`.
- `docker compose -f docker-compose.production.yml config` success/failure.
- Migration command output summary.
- `/api/health` JSON with secrets redacted if any appear.
- `docker compose ps` or service status summary.
- Nginx `nginx -t` result.
- TLS certificate/domain result if HTTPS was configured.
- Staging workflow artifact name if the GitHub runner was enabled.
- News materialization timer status and last-run verifier summary when enabled.
- Brand asset authority result from `npm run ui:public:check` or the specific
  `node scripts/check-brand-asset-authority.mjs` output.

Do not return:

- `.env.production`
- private keys
- access tokens
- database dumps
- user data
- raw logs containing secrets or PII

## Failure Handling

If any step fails:

1. Stop before promotion.
2. Keep the candidate directory for inspection.
3. Return the failed command, exit code, and the last non-secret 80 log lines.
4. Do not edit source files on the server.
5. Do not bypass `npm run env:check`, migration checks, or `/api/health`.

Production launch remains `NO_GO` until staging/candidate health, migration, and
required operational evidence are returned and reviewed.
