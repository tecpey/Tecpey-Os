# TecPey — Deployment Guide

## Target Environment

| Component | Specification |
|-----------|--------------|
| OS | Ubuntu 24.04 LTS |
| Node.js | 20.x LTS |
| Database | PostgreSQL 15+ |
| Process Manager | PM2 or Docker |
| Reverse Proxy | Nginx |
| SSL | Let's Encrypt (Certbot) |

---

## Environment Variables

Create `/etc/tecpey/.env.production` (never committed to git):

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/tecpey

# Site
NEXT_PUBLIC_SITE_URL=https://tecpey.ir

# Auth secrets (generate with: openssl rand -hex 32)
TECPEY_SESSION_SECRET=your_session_secret_min_24_chars
TECPEY_ACADEMY_AUTH_SECRET=your_academy_secret_min_24_chars
TECPEY_ADMIN_TOKEN=your_admin_token_min_24_chars

# Optional
TECPEY_COOKIE_SECURE=true
NODE_ENV=production
```

**Security rules:**
- Never commit `.env` files
- Rotate secrets every 90 days
- Use at least 32 random characters for each secret
- Set file permissions: `chmod 600 /etc/tecpey/.env.production`

---

## Option A: PM2 Deployment

### 1. Install dependencies

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
```

### 2. Clone and build

```bash
git clone https://github.com/tecpey/Tecpey-Os.git /opt/tecpey
cd /opt/tecpey
npm ci --production
npm run build
```

### 3. Start with PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### 4. Configure Nginx

Copy the provided config:

```bash
sudo cp deploy/nginx/tecpey.ssl.conf /etc/nginx/sites-available/tecpey
sudo ln -s /etc/nginx/sites-available/tecpey /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Option B: Docker Deployment

### 1. Build the image

```bash
docker build -t tecpey:latest .
```

### 2. Start with Docker Compose

```bash
docker-compose -f docker-compose.production.yml up -d
```

### 3. View logs

```bash
docker-compose -f docker-compose.production.yml logs -f
```

---

## Option C: systemd Service

```bash
sudo cp deploy/systemd/tecpey-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable tecpey-web
sudo systemctl start tecpey-web
sudo systemctl status tecpey-web
```

---

## Nginx Configuration

The Nginx config (`deploy/nginx/tecpey.ssl.conf`) includes:

- SSL termination with Let's Encrypt
- HTTP → HTTPS redirect
- Reverse proxy to Next.js on port 3000
- Static asset caching headers
- Security headers (`X-Frame-Options`, `X-Content-Type-Options`, etc.)
- Gzip compression

### Obtain SSL Certificate

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d tecpey.ir -d www.tecpey.ir
```

---

## Database Setup

```bash
sudo apt install postgresql-15
sudo -u postgres createuser tecpey
sudo -u postgres createdb tecpey -O tecpey
sudo -u postgres psql -c "ALTER USER tecpey WITH PASSWORD 'your_password';"
```

Run migrations (if applicable):

```bash
cd /opt/tecpey
npm run db:migrate
```

---

## Zero-Downtime Updates

```bash
cd /opt/tecpey
git pull origin main
npm ci --production
npm run build
pm2 reload ecosystem.config.cjs --update-env
```

For Docker:

```bash
docker-compose -f docker-compose.production.yml pull
docker-compose -f docker-compose.production.yml up -d --no-deps --build
```

---

## Health Checks

```bash
# Check application
curl -I https://tecpey.ir

# Check PM2
pm2 status

# Check Nginx
sudo systemctl status nginx

# Check PostgreSQL
sudo systemctl status postgresql
```

---

## Monitoring

- **Application logs:** `pm2 logs tecpey` or `journalctl -u tecpey-web`
- **Nginx logs:** `/var/log/nginx/access.log` and `/var/log/nginx/error.log`
- **Database logs:** `journalctl -u postgresql`

---

## Backup

```bash
# Database backup
pg_dump tecpey > /backups/tecpey_$(date +%Y%m%d).sql

# Application backup
tar -czf /backups/tecpey_app_$(date +%Y%m%d).tar.gz /opt/tecpey --exclude node_modules --exclude .next
```

---

## Rollback

```bash
# Via git tag
git checkout v0.11-enterprise-polish
npm ci --production
npm run build
pm2 reload ecosystem.config.cjs
```

See [CHANGELOG.md](../CHANGELOG.md) for available version tags.
