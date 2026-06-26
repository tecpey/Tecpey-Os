# TecPey Ubuntu 24 Production Patch QA

## Added

- `/api/health` production health endpoint.
- `.env.production.example` with OpenAI, PostgreSQL, Redis, news, and academy lead variables.
- PM2 ecosystem config.
- Dockerfile.
- `docker-compose.production.yml` with app, PostgreSQL, and Redis.
- Nginx reverse proxy config with gzip and security headers.
- Optional systemd service.
- Ubuntu 24 install, deploy, preflight, and health-check scripts.
- `DEPLOY_UBUNTU_24_PRODUCTION.md` production deployment guide.

## Production readiness status

- Server target: Ubuntu 24.04 LTS.
- Runtime: Node.js 22 LTS compatible.
- Process manager: PM2 supported.
- Reverse proxy: Nginx supported.
- SSL: Certbot path documented.
- Database: PostgreSQL URL prepared.
- Cache/rate limit layer: Redis URL prepared.
- AI key: environment only; no key stored in ZIP.
- Health check: `/api/health` added.

## Manual server test

```bash
npm install
npm run build
npm run start
curl http://127.0.0.1:3000/api/health
```

Expected: `ok: true`.
