# TecPey Academy Pro Max QA Report

## Result
Academy upgraded from a shallow content section into a structured 7-term learning path.

## Implemented
- Rebuilt Persian 7-term academy content through `src/data/academyPath.ts`.
- Corrected term 4 / term 5 logic:
  - Term 4: Project and fundamental analysis.
  - Term 5: Technical analysis and chart reading.
- Added practical learning structure per lesson:
  - Core concept
  - Real example
  - Common mistake
  - Practical checklist
  - TecPey professional tip
- Added stronger risk, security and no-financial-advice framing.
- Removed scholarship / prop / reward language from academy flow.
- Added `/academy/ai-guide` as the product-ready scenario page for a future AI learning assistant.
- Added academy AI assistant rules:
  - Educational answers only
  - No buy/sell signals
  - No profit promises
  - No request for private secrets such as Seed Phrase
  - Focus on explanation, checklists, examples and safety
- Renamed the old scholarship route to `/academy/readiness` conceptually.
- Fixed build stability for local/server testing by limiting Next build workers in `next.config.ts`.

## Terminal QA
- `npm install`: completed successfully in this environment after retry.
- `npm run build`: compiled successfully, TypeScript finished, and static generation reached final route output.
- Static QA: passed.
- Route QA: passed.

## Static QA Output
- Routes indexed: 93
- Sitemap URLs: 181
- Broken internal links: 0
- Missing assets: 0
- Removed academy reward/prop/scholarship terms from source content: yes

## Notes
This package is ready for terminal testing with:

```bash
cd tecpey_10
npm install
npm run build
npm start
```

Recommended manual QA pages:
- `/academy`
- `/academy/term-1`
- `/academy/term-2`
- `/academy/term-3`
- `/academy/term-4`
- `/academy/term-5`
- `/academy/term-6`
- `/academy/term-7`
- `/academy/profile`
- `/academy/ai-guide`
