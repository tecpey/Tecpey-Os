# Cleanup Evidence — Superseded Chart.js Crypto Path

**Date:** 2026-07-19  
**Scope:** previous crypto chart wrapper and Chart.js live-price component  
**Related:** #26 and `REPOSITORY_HYGIENE_BASELINE_20260719.md`

## Current authority

The active crypto detail route imports and renders `TradingViewChart` directly. The removed files were not reachable from any current framework, server, script or test entrypoint.

## Removed files

- `src/app/crypto/[symbol]/ChartWrapper.tsx`
- `src/components/crypto/LivePriceChart.tsx`

`LivePriceChart.tsx` was the only detected runtime owner of:

- `chart.js`
- `react-chartjs-2`

The governed npm removal must therefore remove both direct dependencies and regenerate `package-lock.json`.

## Preserved chart paths

This cleanup does not change:

- `TradingViewChart` used by the active crypto route;
- TradingView/charting-library vendor assets;
- `recharts`, which remains owned by `src/components/charts/chart.tsx`;
- market APIs, WebSocket infrastructure or Exchange calculations.

## Risk reduction

The removed Chart.js component opened a browser WebSocket directly to Binance and calculated display prices client-side. Because it was unreachable, retaining it added dependency and architecture ambiguity without production value.

## Evidence gate

Merge requires:

- npm-generated removal of `chart.js` and `react-chartjs-2`;
- `recharts` preserved;
- Hygiene inventory showing both source candidates removed and no unreferenced dependency introduced;
- clean and idempotent PostgreSQL migrations;
- Redis-backed tests;
- TypeScript and ESLint;
- all authority guards;
- complete automated tests;
- production Build.

Rollback is a Git revert; no database or user-data migration is involved.
