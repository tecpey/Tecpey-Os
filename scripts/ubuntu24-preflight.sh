#!/usr/bin/env bash
set -euo pipefail

echo "== TecPey governed host candidate verification =="
node -v
npm -v
if [ ! -f package.json ]; then echo "package.json not found. Run from project root."; exit 1; fi
if [ ! -f .env.production ]; then echo "Missing .env.production. Copy from .env.production.example first."; exit 1; fi
npm ci --no-audit --no-fund
npm run env:check
npm run check
npm run build
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/health > /dev/null
echo "Candidate build and live readiness passed."
