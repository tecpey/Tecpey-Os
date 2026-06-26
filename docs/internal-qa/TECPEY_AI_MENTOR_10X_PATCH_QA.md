# TecPey AI Mentor 10/10 Upgrade Patch QA

## Applied in this patch
- Mentor DNA basic profile added.
- Profile persists in localStorage.
- Mentor sends profile/progress context to `/api/ai-mentor`.
- Coach Quick Actions added:
  - readiness check
  - next learning step
  - common mistake by level
  - connect current page to Crypto Wiki
- Existing mini Telegram support is preserved.
- No buy/sell signal behavior added.

## Why this matters
This moves the mentor from a generic chatbot toward a personalized educational coach:
- remembers user level/risk/weak area
- adapts prompts to current page
- keeps the education-first and safety-first brand promise

## Quick test
```bash
npm install
npm run build
npm start
```

## Manual QA
1. Open site.
2. Open AI Mentor.
3. Confirm DNA card is visible in empty state.
4. Click coach quick action.
5. Confirm input is filled, not navigated.
6. Send question.
7. Confirm answer remains educational and avoids buy/sell signals.
8. Confirm Telegram mini support still exists and only Telegram is shown.

## Next production phase
- Replace local Mentor DNA with authenticated backend profile from `my.tecpey.ir`.
- Add real academy progress, quizzes, and skill scores.
- Add chart screenshot review with strict educational disclaimer.
