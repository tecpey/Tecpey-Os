# TecPey Academy Wave 1 — Smart Learning + Simulation QA

## Scope implemented
- Added Crypto Simulation World data layer: `src/data/academySimulationWorld.ts`
- Added interactive simulation component: `src/components/academy/AcademySimulationWorld.tsx`
- Added FA/EN routes for:
  - `/academy/simulator` and `/en/academy/simulator`
  - `/academy/crash-simulator` and `/en/academy/crash-simulator`
  - `/academy/portfolio-lab` and `/en/academy/portfolio-lab`
  - `/academy/psychology-lab` and `/en/academy/psychology-lab`
  - `/academy/risk-simulator` and `/en/academy/risk-simulator`
- Added links from Academy main pages to the Simulation World.
- Updated sitemap with new FA/EN simulation URLs.

## QA results
- `npm install`: passed
- `npx tsc --noEmit`: passed
- `node scripts/qa-route-check.mjs`: passed — 112 pages indexed
- `node scripts/qa-production-static.mjs`: passed — 112 routes, 199 sitemap URLs, 0 issues
- Broken internal links: 0
- Missing public assets: 0
- Persian text inside EN app routes: 0
- API Key stored in ZIP: no

## Build note
`npm run build` compiled successfully, then the container timed out during the later Next.js build phase. TypeScript and static QA passed independently. Final production build must be confirmed on the Mac/server.

## Terminal test
```bash
cd tecpey_10
npm install
npx tsc --noEmit
node scripts/qa-route-check.mjs
node scripts/qa-production-static.mjs
npm run build
npm start
```

## Key routes to test
```bash
curl -I http://localhost:3000/academy/simulator
curl -I http://localhost:3000/academy/crash-simulator
curl -I http://localhost:3000/academy/portfolio-lab
curl -I http://localhost:3000/academy/psychology-lab
curl -I http://localhost:3000/academy/risk-simulator
curl -I http://localhost:3000/en/academy/simulator
curl -I http://localhost:3000/en/academy/crash-simulator
curl -I http://localhost:3000/en/academy/portfolio-lab
curl -I http://localhost:3000/en/academy/psychology-lab
curl -I http://localhost:3000/en/academy/risk-simulator
```
