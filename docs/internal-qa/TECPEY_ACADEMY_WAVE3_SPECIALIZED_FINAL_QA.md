# TecPey Academy Wave 3 — Specialized Program Final QA

## Scope
Implemented the final Academy business bridge after the 7-term foundation path:

- Specialized Program invitation after final assessment
- Persian and English routes
- Real registration review form
- Server-side lead capture API
- Track-based program structure
- Clear non-signal / no-profit-promise safety language
- Dashboard CTA for completed learners
- Sitemap update

## New Routes
- `/academy/specialized-program`
- `/en/academy/specialized-program`
- `/api/academy-specialized-lead`

## QA Results
- `npm install`: passed
- `npx tsc --noEmit`: passed
- `node scripts/qa-route-check.mjs`: passed — 116 pages indexed
- `node scripts/qa-production-static.mjs`: passed — 116 routes, 203 sitemap URLs, 0 issues
- Broken internal links: 0
- Missing public assets: 0
- Persian text inside EN routes: 0
- API key stored in ZIP: not found

## Build Note
`next build` compiled successfully, but the hosted execution environment timed out during Next.js internal TypeScript stage. Standalone `tsc --noEmit` passed, route QA passed, and static QA passed. Run final production build on Mac/server:

```bash
npm install
npm run build
npm start
```

## Academy Business Flow
Learners complete:
1. Seven foundation terms
2. Practice / Simulation exercises
3. Final assessment
4. Specialized Program review request

The specialized program is framed as a reviewed next step for online or in-person advanced TecPey Academy training, not as trading signals, financial advice, profit promises, or guaranteed outcomes.
