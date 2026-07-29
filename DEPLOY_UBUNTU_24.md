# TecPey Ubuntu 24 Deployment

For the production-ready Ubuntu 24 deployment flow, use:

```bash
cat DEPLOY_UBUNTU_24_PRODUCTION.md
```

Quick path:

```bash
export TECPEY_IMAGE_DIGEST='sha256:REVIEWED_RELEASE_DIGEST'
export POSTGRES_PASSWORD='SECRET_FROM_APPROVED_MANAGER'
export REDIS_PASSWORD='SECRET_FROM_APPROVED_MANAGER'
npm run env:check
docker compose -f docker-compose.production.yml up -d
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/health
```

Nginx config is available at:

```text
deploy/nginx/tecpey.conf
```

Repository-owned privileged host bootstrap and PM2 deployment are retired. They
must not be used as production release paths.
