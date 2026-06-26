#!/usr/bin/env bash
set -euo pipefail

echo "== TecPey PM2 Deploy =="
if [ ! -f .env.production ]; then echo "Missing .env.production"; exit 1; fi
npm install
npm run build
if ! command -v pm2 >/dev/null 2>&1; then sudo npm i -g pm2; fi
pm2 start ecosystem.config.cjs --env production || pm2 restart tecpey-web
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME" || true
echo "TecPey is running on http://127.0.0.1:3000"
