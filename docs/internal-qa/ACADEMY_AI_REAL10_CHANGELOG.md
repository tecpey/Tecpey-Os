# TecPey Academy + AI Mentor Pro Upgrade

## What changed

### Academy educational depth
- Rebuilt the 7-term learning path in `src/data/academyPath.ts`.
- Removed shallow/duplicated lesson bodies from the primary learning path.
- Each term now has a clearer educational goal, richer lesson bodies, real examples, common mistakes, practical checklists and TecPey pro tips.
- The structure now follows a progressive journey:
  1. Crypto foundations
  2. Account, wallet and asset security
  3. Exchange use and spot trading
  4. Project research, tokenomics and red flags
  5. Practical technical analysis
  6. Risk and capital management
  7. Psychology and responsible readiness

### English academy parity
- Rebuilt `src/data/academyPathEn.ts` with English-only content.
- Removed Persian leakage from the English learning path data.

### AI Mentor
- Added an interactive rule-based demo component:
  - `src/components/academy/AiMentorDemo.tsx`
- Upgraded `/academy/ai-guide` from a static concept page into a practical AI Mentor scenario page.
- The demo handles educational question modes:
  - Concepts
  - Security
  - Risk management
  - Technical analysis
  - Project research
  - Psychology
- Guardrails are explicit:
  - No buy/sell signals
  - No guaranteed profit
  - No future price prediction
  - No request for sensitive data such as Seed Phrase, password or 2FA

### Lesson integration
- Added “Ask AI Mentor about this lesson” entry points inside term lessons.
- Added a sticky AI Mentor card inside each Persian term page.

## QA Results
- `node scripts/qa-route-check.mjs`: PASSED
- `node scripts/qa-production-static.mjs`: PASSED
- Static QA result: 93 routes, 181 sitemap URLs, 0 issues
- TypeScript reached successfully during local build attempt.

## Build note
The local environment completed compile and TypeScript phases, but the long Next.js static generation step timed out in the sandbox. The user’s Mac previously completed the build successfully for this project. Final verification command remains:

```bash
npm install
npm run build
npm start
```

## AI Mentor production note
Current AI Mentor is a safe interactive educational demo and architecture-ready UX. For real AI responses, connect it later to a backend API using the same guardrails, academy context retrieval, user progress and no-financial-advice policy.
