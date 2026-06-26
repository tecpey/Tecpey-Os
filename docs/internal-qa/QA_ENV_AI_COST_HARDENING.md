# TecPey Env + AI Mentor Cost Hardening QA

## Scope
This patch prepares the project environment for production ownership while keeping the real OpenAI API key out of the repository.

## Applied changes

### 1. Environment files normalized
- Rebuilt `.env.example`, `.env.local.example`, and `.env.production.example`.
- Removed stale `admin-de`, `wss-dem`, and old model placeholders.
- Kept `OPENAI_API_KEY=` empty for owner-side secret injection.
- Added required production secrets:
  - `TECPEY_SESSION_SECRET`
  - `CERTIFICATE_SIGNING_SECRET`
- Added market backend placeholders with explicit `CHANGE_ME` labels.

### 2. AI Mentor model strategy
- Primary model: `gpt-5.4-mini`
- Fallback model: `gpt-4.1-mini`
- Added env controls:
  - `AI_MENTOR_MAX_OUTPUT_TOKENS=700`
  - `AI_MENTOR_TEMPERATURE=0.2`

### 3. Runtime model fallback
- AI Mentor now retries the fallback model when the primary model is unavailable or rejected with model-related 400/404 responses.
- Production responses no longer expose OpenAI status/debug details to the client.
- Development mode still exposes limited debug text for local troubleshooting only.

### 4. Environment validation
- Added `scripts/validate-env.mjs`.
- Added npm script: `npm run env:check`.
- The script checks required values, placeholder leakage, and minimum secret length.

### 5. Product language cleanup
- Removed user-visible SEO/GEO-engine wording from academy data.
- Footer label changed from API Docs to Integration Guide / راهنمای اتصال سازمانی.

## Validation performed
- JSON parse check: passed for `package.json`, `fa.json`, `en.json`.
- Node syntax check: passed for `scripts/validate-env.mjs`.
- Static grep check: no stale `gpt-4o-mini`, `admin-de`, `wss-dem`, or committed OpenAI key patterns remain in env examples.

## Build note
Full `npm ci`, `npm run check`, and `npm run build` still need to run on a machine with complete dependency installation. The local container had incomplete `node_modules` and `eslint` was unavailable.

## Production owner checklist
1. Copy `.env.production.example` to `.env.production` on the server.
2. Add the real `OPENAI_API_KEY` only on the server.
3. Replace `NEXT_PUBLIC_API_BACKEND_URL` and `NEXT_PUBLIC_API_SOCKET_URL` after final backend/API handoff.
4. Replace `TECPEY_SESSION_SECRET` and `CERTIFICATE_SIGNING_SECRET` with strong random secrets.
5. Run:

```bash
npm run env:check
npm ci
npm run check
npm run build
```
