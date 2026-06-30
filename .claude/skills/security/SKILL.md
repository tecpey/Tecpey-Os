---
name: security
description: Security hardening checklist for TecPey. Covers input validation, SQL injection, XSS, CSRF, auth, session management, CSP, rate limiting, and financial data protection. Adapted from addyosmani/agent-skills security-and-hardening (MIT).
---

# Security Skill — TecPey

**Source:** github.com/addyosmani/agent-skills (security-and-hardening)
**License:** MIT
**Adoption:** Adopted — adapted for TecPey's stack and architecture
**Audit date:** 2026-06-30

---

## Threat Model First

Before hardening any feature, spend 5 minutes on:

1. **Trust boundaries** — where does untrusted data enter? (HTTP body, query params,
   webhooks, price feed, LLM output, DB reads from external tenants)
2. **Assets** — what's worth stealing? (session tokens, API keys, wallet balances,
   user PII, trading history, certificate data)
3. **STRIDE pass** over each boundary:
   - **Spoofing** → `verifyCsrfOrigin()`, `getCanonicalSession()`
   - **Tampering** → parameterized queries via `withDb()`, input validation
   - **Repudiation** → structured logs with `requestId`, `userId`, `latencyMs`
   - **Information disclosure** → generic error messages via `apiError()`, no stack traces to client
   - **Denial of service** → `rateLimit()` on every endpoint
   - **Elevation of privilege** → auth check before every data access

---

## Always (No Exceptions)

- Validate all external input at system boundaries (API routes, form handlers)
- Parameterize all DB queries — never concatenate user input into SQL
- Use `verifyCsrfOrigin()` on every POST/PATCH/DELETE endpoint
- Use `getCanonicalSession()` for every auth-required operation
- Use `rateLimit()` on every public endpoint
- Return `apiError()` — never expose raw error messages or stack traces
- Cap body size before parsing (`if (raw.length > N) return apiError(...)`)
- Validate UUID format with regex before DB lookup
- Never log passwords, tokens, or full session cookies

---

## CSP (TecPey Specific)

CSP is managed in `src/proxy.ts` via `buildConnectSrc()`.

- Add new allowed origins via `NEXT_PUBLIC_EXTRA_CONNECT_SRC` env var
- Do NOT add wildcard origins to connect-src
- Do NOT modify nonce generation logic
- All API calls go through the proxy — do not add direct external fetch from client
  without updating CSP

---

## Auth Architecture (TecPey)

```typescript
const session = await getCanonicalSession(req);
if (!session.userId && !session.studentId) {
  return apiError("authentication_required", 401);
}
const userId = session.userId ?? session.studentId ?? "";
```

Never check `session.role === "admin"` without first confirming session exists.
Never trust `userId` from the request body — always from the session.

---

## Financial Data Protection

For wallet, ledger, and order data:
- User A must never see User B's orders, balances, or trades
- All ledger queries must include `walletId` or `userId` as a filter
- `cancelOrder` must verify `userId` matches — reject with 404 (not 403, to avoid oracle)
- Never return `balanceAfter` to a user other than the wallet owner

---

## Rate Limiting Reference (TecPey)

| Endpoint type | Limit | Window |
|---|---|---|
| Read — public market data | 240–480/min | 60s |
| Read — authenticated | 120/min | 60s |
| Write — order placement | 30/min | 60s |
| Write — auth | 10/min | 60s |
| Internal / admin | 5/min | 60s |

---

## Security Headers (TecPey, managed in proxy.ts)

- `Content-Security-Policy` — nonce-based, `buildConnectSrc()` for connect-src
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), ...`

Do not weaken these headers in product code. Changes require explicit user approval.

---

## Ask Before Doing

Always pause and confirm with the user before:

- Adding a new authentication flow or changing auth logic
- Storing a new category of sensitive data (PII, payment info)
- Adding a new external service integration
- Changing CORS or CSP configuration
- Adding a new admin-only endpoint

---

## Verify After Every Security Change

```bash
npm run typecheck   # 0 errors
npm run lint        # 0 warnings
npm run build       # passes
```

Then manually trace the new security boundary: what untrusted input reaches
the change? Is it validated? Is it logged (without leaking secrets)?
