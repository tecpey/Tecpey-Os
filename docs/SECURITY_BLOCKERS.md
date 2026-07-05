# Security Blockers — Phase 39.5

**Date:** 2026-07-05
**Phase:** 39.5 — Strategic Freeze & TecPey DNA Synchronization
**Status:** Official
**Purpose:** Complete inventory of security issues that block production launch.

---

## P0 — Blocks Production Release

### SB-001 — CSRF Gaps on State-Changing Routes

- **Risk:** Direct account/security risk. Cross-origin attacks possible on authenticated state-changing routes.
- **Location:** Multiple API routes lack consistent `verifyCsrfOrigin()` enforcement.
- **Evidence:** Audit `PROJECT_AUDIT_PHASE39.md` Section 7.
- **Fix:** Add CSRF to session revocation, API key management, and admin routes.
- **Target Phase:** 39.6
- **Rollback:** Revert route-only commits.

### SB-002 — Raw Admin Token in Cookie

- **Risk:** Cookie stores raw `TECPEY_ADMIN_TOKEN`. Cookie theft equals token theft. Admin token stored in sessionStorage (XSS-extractable).
- **Location:** `src/lib/admin-auth.ts`
- **Evidence:** `ADMIN_TOKEN_COOKIE` contains the raw token value.
- **Fix:** Replace with signed admin session cookie containing opaque nonce.
- **Target Phase:** 39.6
- **Rollback:** Revert admin-auth commit and clear admin cookies.

### SB-003 — API Key Replay Protection Disabled

- **Risk:** Without Redis, API key replay prevention is disabled. Financial API risk.
- **Location:** `src/lib/security/api-key-auth.ts`
- **Evidence:** Nonce store depends on `globalThis.tecpeyRedisClient`; when absent, no replay check.
- **Fix:** Fail closed in production when Redis is unavailable.
- **Target Phase:** 39.6
- **Rollback:** Revert API-key auth change.

### SB-004 — Mock KYC in Production

- **Risk:** Sumsub KYC returns `mock_${userId}` sessions when unconfigured. Production compliance risk.
- **Location:** `src/lib/compliance/sumsub.ts`
- **Evidence:** Returns mock session instead of blocking.
- **Fix:** Block mock sessions in production unless explicit non-production flag.
- **Target Phase:** 39.6
- **Rollback:** Revert KYC adapter change.

### SB-005 — HSM/MPC Throws at Runtime

- **Risk:** Incomplete providers can be selected by environment variable, causing signing failures.
- **Location:** `src/lib/wallet/signing/keystore.ts`
- **Evidence:** `HsmKeyStore` and `MpcKeyStore` throw "Not implemented".
- **Fix:** Gate incomplete providers behind production-safe feature flags.
- **Target Phase:** 40 (with gating in 39.6)
- **Rollback:** Revert keystore gate.

### SB-006 — Internal Price-Feed Endpoint Public

- **Risk:** `POST /api/internal/price-feed-status` is public and unauthenticated.
- **Location:** `src/app/api/internal/price-feed-status/route.ts`
- **Fix:** Require server token or same-origin CSRF.
- **Target Phase:** 39.6
- **Rollback:** Revert endpoint and env example changes.

---

## P1 — Blocks Confident Release

### SB-007 — Production Rate Limiting Falls Back to Memory

- **Risk:** Per-instance rate limiting does not scale across instances. DDoS window.
- **Location:** `src/lib/rate-limit.ts`
- **Fix:** Require Redis REST or explicit fail in production.
- **Target Phase:** 39.6

### SB-008 — Local JSON Auth Storage in Production

- **Risk:** `TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE` can be enabled in production.
- **Location:** `src/app/api/academy-auth/route.ts`
- **Fix:** Block local storage fallback in production builds.
- **Target Phase:** 39.6

### SB-009 — Broad CSP Fallback

- **Risk:** CSP includes broad `https:`, `wss:`, and `ws:` when env vars incomplete.
- **Location:** `deploy/nginx/tecpey.conf` line 15
- **Fix:** Tighten CSP connect-src in production.
- **Target Phase:** 39.6

### SB-010 — Secret Fan-Out

- **Risk:** `user_session` falls back through three secrets (`TECPEY_SESSION_SECRET`, `JWT_SECRET`, `NEXTAUTH_SECRET`). Compromise of any secret compromises all.
- **Location:** `src/lib/session.ts`
- **Fix:** Remove fallback chain. Single authoritative secret.
- **Target Phase:** 42

### SB-011 — Admin Auth in sessionStorage

- **Risk:** Admin token is XSS-extractable from JavaScript memory.
- **Location:** `src/lib/admin-auth.ts`
- **Fix:** Replace with httpOnly admin session cookie.
- **Target Phase:** 39.6

---

## P2 — Should Fix Before Growth

### SB-012 — English lang/dir Mismatch Before Hydration

- **Risk:** Screen readers see wrong language/direction before React hydration.
- **Location:** `src/app/layout.tsx`, `src/app/en/layout.tsx`
- **Fix:** Improve HTML attribute strategy for English subtree.
- **Target Phase:** 45

### SB-013 — Visual-Only Contact Forms

- **Risk:** Users think they submitted a message but it only opens mailto. Trust issue.
- **Location:** `src/app/contact-us/`
- **Fix:** Add real form handler or clearly style as contact CTAs.
- **Target Phase:** 45

### SB-014 — Rate Limits: No Auth Endpoint Specificity

- **Risk:** Auth endpoints share general rate limit zone in Nginx.
- **Location:** `deploy/nginx/tecpey.conf`
- **Fix:** Add auth-specific rate limiting.
- **Target Phase:** 45

---

## Risk Matrix

| ID | Risk | Impact | Probability | Priority |
|----|------|--------|-------------|----------|
| SB-001 | CSRF gaps | High | High | P0 |
| SB-002 | Raw admin token | High | Medium | P0 |
| SB-003 | API key replay disabled | High | Medium | P0 |
| SB-004 | Mock KYC | High | Medium | P0 |
| SB-005 | HSM/MPC throws | High | Medium | P0 |
| SB-006 | Public price-feed | High | Medium | P0 |
| SB-007 | Per-instance rate limit | Medium | Medium | P1 |
| SB-008 | Local auth in prod | High | Low | P1 |
| SB-009 | Broad CSP | Medium | Medium | P1 |
| SB-010 | Secret fan-out | High | Low | P1 |
| SB-011 | Admin in sessionStorage | High | Low | P1 |
| SB-012 | English lang/dir | Medium | Medium | P2 |
| SB-013 | Visual contact forms | Low | High | P3 |
| SB-014 | Auth rate limiting | Low | Medium | P3 |

---

## Blocker Closure Criteria

Phase 39.5 does not fix these blockers — it documents them. Fixing begins in Phase 39.6.

A blocker is considered "closed" when:
1. The fix is implemented and merged
2. QA evidence confirms the fix
3. Negative test confirms the attack path is blocked
4. Rollback plan is documented
5. Security review approves

---

*Security blockers for Phase 39.5 launch assessment. Resolution begins in Phase 39.6.*
