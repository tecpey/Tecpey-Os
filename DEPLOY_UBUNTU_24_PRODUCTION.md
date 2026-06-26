# TecPey Production Deployment — Ubuntu 24.04 LTS

This package is ready for Ubuntu 24.04 deployment with Next.js, Nginx, PM2, optional Docker Compose, PostgreSQL, Redis, and a production health endpoint.

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
DATABASE_URL=postgresql://tecpey:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:5432/tecpey
REDIS_URL=redis://127.0.0.1:6379
```

Do not put API keys in Git, screenshots, chat, or frontend code.

## 3. PM2 deployment

```bash
npm install
npm run build
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
cp .env.production.example .env.production
nano .env.production
docker compose -f docker-compose.production.yml up -d --build
```

## 6. Production QA commands

```bash
npm install
npm run check
npm run build
npm run start
curl -I http://127.0.0.1:3000
curl http://127.0.0.1:3000/api/health
```

Expected:

- TypeScript: 0 errors
- Build: pass
- Health endpoint: `ok: true`
- Nginx: `200 OK`
- API key: server-side only

## 7. Operational checklist

- Enable UFW and Fail2Ban.
- Use HTTPS only.
- Keep `.env.production` outside version control.
- Rotate the test OpenAI key before production.
- Back up PostgreSQL daily.
- Monitor PM2 logs.
- Add Redis-based rate limiting when traffic increases.
