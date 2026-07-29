# TecPey Ubuntu 24 Deployment

For the production-ready Ubuntu 24 deployment flow, use:

```bash
cat DEPLOY_UBUNTU_24_PRODUCTION.md
```

Quick path:

```bash
cp .env.production.example .env.production
nano .env.production
npm install
npm run build
pm2 start ecosystem.config.cjs
curl http://127.0.0.1:3000/api/health
```

Nginx config is available at:

```text
deploy/nginx/tecpey.conf
```

Docker Compose option:

```bash
docker compose -f docker-compose.production.yml up -d --build
```
