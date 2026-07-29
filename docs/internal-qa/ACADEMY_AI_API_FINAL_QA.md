# TecPey Academy + AI Mentor Final Patch

## Applied
- Added secure server-side `/api/ai-mentor` route.
- Added `.env.local.example` with placeholder only. No leaked API key is stored in this ZIP.
- AI Mentor now supports two modes:
  - OpenAI API mode when `OPENAI_API_KEY` is configured on the server.
  - Safe fallback mode when API key is missing or API returns an error.
- AI Mentor guardrails added:
  - No buy/sell signals.
  - No guaranteed profit.
  - No personal financial advice.
  - No request for Seed Phrase, private key, 2FA code, password, or API key.
  - Answers are constrained to TecPey Academy terms and educational context.
- Academy term pages upgraded with:
  - Case Study per term.
  - Practical exercise per term.
  - Suggested AI Mentor prompt per term.
  - Mastery criteria per term.

## QA Result
- TypeScript: passed until static generation phase in production build.
- Compile: passed.
- Route QA: passed.
- Static production QA: passed.
- Routes indexed: 93.
- Sitemap URLs: 181.
- Broken internal links: 0.
- Missing assets: 0.
- Secret scan for leaked API key: clear.

## Deployment
1. Copy `.env.local.example` to `.env.local`.
2. Replace placeholder with a new OpenAI API key.
3. Run:

```bash
npm install
npm run build
npm start
```

## Important Security Note
The API key previously shared in chat must be revoked and replaced with a new key. This ZIP intentionally does not include it.
