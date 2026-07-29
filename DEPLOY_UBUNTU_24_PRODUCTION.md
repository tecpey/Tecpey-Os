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

Set at minimum:

```env
NEXT_PUBLIC_SITE_URL=https://tecpey.ir
OPENAI_API_KEY=YOUR_NEW_PRODUCTION_KEY
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
infrastructure-managed host that already provides approved Node/npm packages.
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

Only after the isolated candidate passes may the infrastructure owner perform
an atomic promotion and controlled service restart. The repository does not
copy candidate artifacts into the live tree or automate that privileged
transition. After promotion, remain in the isolated candidate checkout and bind
the live readiness result to the same exact commit:

```bash
bash scripts/ubuntu24-preflight.sh runtime
```

Both phases reject tracked or untracked source changes and refuse to run from
the live systemd working tree. The candidate phase fails on environment,
static-check, or production-build errors. The runtime phase fails on an
unhealthy service or a baked artifact commit that differs from the isolated
candidate. Runtime environment variables cannot override this build identity.

## 7. Operational checklist

- Enable UFW and Fail2Ban.
- Use HTTPS only.
- Keep `.env.production` outside version control.
- Rotate the test OpenAI key before production.
- Back up PostgreSQL daily.
- Retain the exact image digest and deployment evidence.
- Keep Redis authenticated and private; never expose its port publicly.
