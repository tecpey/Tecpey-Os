#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "[1/5] Installing dependencies"
npm install
echo "[2/5] Static Academy QA"
node scripts/qa-production-static.mjs || true
echo "[3/5] Route QA"
node scripts/qa-route-check.mjs || true
echo "[4/5] Production build"
npm run build
echo "[5/5] Done. Run: npm start"
