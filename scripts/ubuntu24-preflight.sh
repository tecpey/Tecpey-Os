#!/usr/bin/env bash
set -euo pipefail

echo "== TecPey Ubuntu 24 Preflight =="
node -v
npm -v
if [ ! -f package.json ]; then echo "package.json not found. Run from project root."; exit 1; fi
if [ ! -f .env.production ]; then echo "Missing .env.production. Copy from .env.production.example first."; exit 1; fi
npm install
npm run build
node -e "fetch('http://127.0.0.1:3000/api/health').catch(()=>process.exit(0))" || true
echo "Preflight build passed."
