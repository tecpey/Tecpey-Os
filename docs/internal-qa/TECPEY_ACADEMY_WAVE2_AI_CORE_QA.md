# TecPey Academy Wave 2 — AI Academy Core QA

## Scope
Wave 2 implements the AI Academy layer on top of Wave 1 without deleting existing routes, content, SEO files, academy pages, simulators or mentor UI.

## Added / Upgraded
- Added `src/data/academyMentorIntelligence.ts`
  - Mentor personas: beginner, intermediate, professional, risk manager, psychology coach
  - Weakness detection rules
  - Personalized mentor response loop
- Added `src/components/academy/AcademyMentorCoachCenter.tsx`
  - Reads browser learning progress
  - Reads mentor memory and recent mentor questions
  - Detects likely weak areas
  - Recommends next lessons/labs
  - Shows mentor mode and safe personalization rules
- Added routes:
  - `/academy/mentor-coach`
  - `/en/academy/mentor-coach`
- Upgraded `/api/ai-mentor`
  - Injects completed terms, weak areas, confidence and mentor mode into AI context
  - Strengthened prompt to produce personalized next-step recommendations
- Upgraded `AiMentorDemo`
  - Stores mentor question history in localStorage
  - Stores weak area memory safely
  - No sensitive secret is stored intentionally
- Added links from Academy and AI Guide pages to the new Personal Coach center
- Updated sitemap with the two new coach routes

## QA Results
- `npm ci --ignore-scripts --no-audit --no-fund`: PASS
- `npx tsc --noEmit`: PASS
- `node scripts/qa-route-check.mjs`: PASS — 114 pages indexed
- `node scripts/qa-production-static.mjs`: PASS — 114 routes, 201 sitemap URLs, 0 issues
- Broken internal links: 0
- Missing public assets: 0
- Persian text inside EN app routes: 0
- API key inside ZIP/source: not found

## Build Note
`next build` compiled successfully and entered TypeScript validation, but the container tool timed out during Next's build pipeline. Independent TypeScript and static/route QA passed. Please run final build on Mac/Ubuntu:

```bash
npm install
npm run build
npm start
```

## Terminal Test Routes
```bash
curl -I http://localhost:3000/academy/mentor-coach
curl -I http://localhost:3000/en/academy/mentor-coach
curl -I http://localhost:3000/academy/ai-guide
curl -I http://localhost:3000/en/academy/ai-guide
```

Expected: `HTTP/1.1 200 OK`.
