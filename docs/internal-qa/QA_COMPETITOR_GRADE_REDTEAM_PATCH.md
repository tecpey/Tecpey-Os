# TecPey Competitor-Grade RedTeam QA Patch

Date: 2026-06-23T13:58:42.357967Z

## Fixed in this patch
- Docker now uses `npm ci` with `package-lock.json` for deterministic production installs.
- AI mentor default model changed to `gpt-4o-mini` for lower cost; `gpt-4.1-mini` remains fallback upgrade.
- Public API responses no longer expose rate-limit storage mode, DB persistence flags, or service configuration state.
- Legacy session helper no longer signs/verifies with an accidental `undefined` secret.
- Certificate/progress/profile APIs return product-safe statuses instead of implementation-state fields.
- `prod:build` now runs deterministic install + environment validation + build.

## Remaining launch gates
- Run real `npm ci && npm run check && npm run build` on the deployment machine.
- Set production secrets: `TECPEY_SESSION_SECRET`, `CERTIFICATE_SIGNING_SECRET`, `DATABASE_URL`, market backend/socket URLs, and then `OPENAI_API_KEY`.
- Connect official login providers before opening the academy to public traffic.
- Replace any temporary market backend placeholders before launch.

## RedTeam verdict
This patch removes several trust and observability leaks that a competitor could use to label the product as prototype-like. The next QA should focus on real browser flows, mobile viewport testing, and production database certificate issuance.
