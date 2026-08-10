# TecPey Production Deployment — Ubuntu 24.04 LTS

The approved Ubuntu 24.04 production path uses the immutable, digest-pinned
Docker Compose release, PostgreSQL, authenticated Redis, and fail-closed
production readiness. The canonical operational contract is
`docs/operations/PRODUCTION_DEPLOYMENT_CONTRACT.md`.

## 1. Server baseline

Recommended launch server:

- Ubuntu 24.04 LTS
- 4 vCPU / 8GB RAM minimum for launch
- 8 vCPU / 16GB RAM recommended for AI Brain, news, academy, and future community features
- NVMe SSD

Provision Docker Engine and the Compose plugin through the approved infrastructure
baseline. The repository does not execute privileged network installers. These
legacy commands intentionally fail closed:

```bash
bash scripts/ubuntu24-install-base.sh
bash scripts/ubuntu24-deploy-pm2.sh
```

## 2. Environment

```bash
cp .env.production.example .env.production
nano .env.production
```

The tracked template is the governed list of variables required by
`npm run env:check`, including the public API/socket origins, distinct signing
secrets, CRM protection keys, trusted-proxy settings, PostgreSQL, Redis and
coordinated rate-limiting credentials. Replace every `REPLACE_WITH` value
through the approved secret/configuration manager before verification. The
candidate gate rejects an unchanged or incomplete template.

For the Compose path, the approved secret values must preserve these internal
service hosts:

```env
DATABASE_URL=postgresql://tecpey:SECRET_FROM_APPROVED_MANAGER@postgres:5432/tecpey
REDIS_URL=redis://:SECRET_FROM_APPROVED_MANAGER@redis:6379
```

`postgres` and `redis` are the internal Compose service names. Do not replace
them with `127.0.0.1` or `localhost`: inside `migrate` and `tecpey-web`, a
loopback address points back to that container rather than to the database or
Redis service. A separately pre-provisioned systemd runtime must instead use
infrastructure-approved endpoints that are actually reachable from the host.

Do not put API keys in Git, screenshots, chat, or frontend code.

## 3. Immutable release deployment

```bash
export TECPEY_IMAGE_DIGEST='sha256:REVIEWED_RELEASE_DIGEST'
export POSTGRES_PASSWORD='SECRET_FROM_APPROVED_MANAGER'
export REDIS_PASSWORD='SECRET_FROM_APPROVED_MANAGER'
npm run env:check
docker compose -f docker-compose.production.yml up -d
```

Check:

```bash
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/health
```

## 4. Nginx

```bash
sudo cp deploy/nginx/tecpey.conf /etc/nginx/sites-available/tecpey
sudo ln -s /etc/nginx/sites-available/tecpey /etc/nginx/sites-enabled/tecpey
sudo nginx -t
sudo systemctl reload nginx
```

SSL:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tecpey.ir -d www.tecpey.ir
```

## 5. Production QA commands

```bash
npm ci --no-audit --no-fund
npm run env:check
npm run check
npm run build
docker compose -f docker-compose.production.yml config
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/health
```

Expected:

- TypeScript: 0 errors
- Build: pass
- Readiness endpoint: HTTP 200 only after PostgreSQL, the canonical migration
  plan, Redis, runtime bootstrap, and required workers are ready
- Nginx: `200 OK`
- API key: server-side only

## 6. Optional pre-provisioned systemd verification

The checked-in systemd unit remains an audited runtime authority for an
infrastructure-managed host that already provides approved `/usr/bin/node` and
`/usr/bin/npm` packages. The unit executes
`/usr/bin/node dist/run-production-bootstrap.cjs server` directly; candidate
verification checks and uses those same binaries rather than a shell-specific
nvm/asdf/PATH selection.
The repository does not install those privileged dependencies. Never build in
the live systemd working tree at `/var/www/tecpey`. Prepare an exact detached
checkout in an isolated path such as
`/var/www/tecpey-candidates/$EXPECTED_RELEASE_SHA`, provide its approved
`.env.production`, and verify the candidate there:

- Node.js major `22`;
- npm major `10`, matching the repository engine and CI contract.

```bash
export EXPECTED_RELEASE_SHA='EXACT_40_CHARACTER_RELEASE_SHA'
cd "/var/www/tecpey-candidates/$EXPECTED_RELEASE_SHA"
test "$(git rev-parse HEAD)" = "$EXPECTED_RELEASE_SHA"
bash scripts/ubuntu24-preflight.sh candidate
```

Production startup is verify-only and never applies migrations. After the
isolated candidate passes, run the governed compiled migration target from that
same exact candidate and require its successful `schema: "current"` result:

```bash
bash scripts/ubuntu24-preflight.sh migrate
```

Only after the migration succeeds may the infrastructure owner perform the
atomic promotion. Only after promotion may the owner perform the controlled service restart.
The repository does not copy candidate artifacts into the live tree or automate
those privileged transitions. After the restart, remain in the isolated candidate
checkout and bind the live readiness result to the same exact commit:

```bash
bash scripts/ubuntu24-preflight.sh runtime
```

All three phases reject tracked or untracked source changes. Candidate build and
migration refuse the live systemd working tree. The candidate phase fails on
environment, static-check, or production-build errors. The migration phase
loads the approved candidate `.env.production` explicitly with Node's
`--env-file` support and fails unless the compiled migration authority reaches
the current schema. The runtime phase fails on an unhealthy service or a baked
artifact commit that differs from the isolated candidate. Runtime environment
variables cannot override this build identity.

## 7. Operational checklist

- Enable UFW and Fail2Ban.
- Use HTTPS only.
- Keep `.env.production` outside version control.
- Rotate the test OpenAI key before production.
- Back up PostgreSQL daily.
- Retain the exact image digest and deployment evidence.
- Keep Redis authenticated and private; never expose its port publicly.
- If systemd workers are enabled, install `tecpey-news-materialization.timer`
  only through `npm run news:materialization:install` from an exact candidate
  checkout and verify `news-materialization-last-run.json` before accepting the
  scheduler as active.
