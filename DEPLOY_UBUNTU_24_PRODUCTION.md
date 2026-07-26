# TecPey Production Deployment — Ubuntu 24.04 LTS

This package supports Ubuntu 24.04 deployment through the compiled custom server,
Nginx, PM2 or immutable Docker Compose images, PostgreSQL, authenticated Redis,
and fail-closed production readiness. The canonical operational contract is
`docs/operations/PRODUCTION_DEPLOYMENT_CONTRACT.md`.

## 1. Server baseline

Recommended launch server:

- Ubuntu 24.04 LTS
- 4 vCPU / 8GB RAM minimum for launch
- 8 vCPU / 16GB RAM recommended for AI Brain, news, academy, and future community features
- NVMe SSD

Install base tools:

```bash
cd /var/www/tecpey
bash scripts/ubuntu24-install-base.sh
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
DATABASE_URL=postgresql://tecpey:SECRET_FROM_APPROVED_MANAGER@127.0.0.1:5432/tecpey
REDIS_URL=redis://:SECRET_FROM_APPROVED_MANAGER@127.0.0.1:6379
```

Do not put API keys in Git, screenshots, chat, or frontend code.

## 3. PM2 deployment

```bash
npm ci --no-audit --no-fund
npm run build
npm run db:migrate
npm prune --omit=dev --no-audit --no-fund
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Check:

```bash
curl http://127.0.0.1:3000/api/health
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

## 5. Docker Compose option

```bash
export TECPEY_IMAGE_DIGEST='sha256:REVIEWED_RELEASE_DIGEST'
export POSTGRES_PASSWORD='SECRET_FROM_APPROVED_MANAGER'
export REDIS_PASSWORD='SECRET_FROM_APPROVED_MANAGER'
docker compose -f docker-compose.production.yml up -d
```

## 6. Production QA commands

```bash
npm ci --no-audit --no-fund
npm run check
npm run build
npm run db:migrate
npm prune --omit=dev --no-audit --no-fund
npm run start
curl -I http://127.0.0.1:3000
curl http://127.0.0.1:3000/api/health
```

Expected:

- TypeScript: 0 errors
- Build: pass
- Readiness endpoint: HTTP 200 only after PostgreSQL, the canonical migration
  plan, Redis, runtime bootstrap, and required workers are ready
- Nginx: `200 OK`
- API key: server-side only

## 7. Operational checklist

- Enable UFW and Fail2Ban.
- Use HTTPS only.
- Keep `.env.production` outside version control.
- Rotate the test OpenAI key before production.
- Back up PostgreSQL daily.
- Monitor PM2 logs.
- Keep Redis authenticated and private; never expose its port publicly.
