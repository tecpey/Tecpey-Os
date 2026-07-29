# Security Blockers — Phase 39.5

**Date:** 2026-07-05  
**Current-state correction:** 2026-07-21 — Issue #246  
**Phase:** 39.5 — Strategic Freeze & TecPey DNA Synchronization  
**Status:** Official  
**Purpose:** Complete inventory of security issues that block production launch.

---

## P0 — Blocks Production Release

### SB-001 — CSRF Gaps on State-Changing Routes

- **Risk:** Direct account/security risk. Cross-origin attacks possible on authenticated state-changing routes.
- **Location:** Multiple API routes require continuing inventory and evidence.
- **Evidence:** Audit `PROJECT_AUDIT_PHASE39.md` Section 7 plus current API Security Manifest.
- **Fix:** Enforce CSRF on every governed state-changing route.
- **Target Phase:** 39.6
- **Rollback:** Revert route-only commits.

### SB-002 — Raw Admin Token in Cookie

- **Risk:** A raw long-lived Admin token in browser state would make token theft equivalent to Admin compromise.
- **Location:** Current Admin control-plane and historical `src/lib/admin-auth.ts` inventory.
- **Evidence:** Governed Admin session/step-up authority must remain the only active path.
- **Fix:** Maintain signed/opaque httpOnly Admin session authority and remove raw browser token paths.
- **Target Phase:** 39.6
- **Rollback:** Revert only with explicit security approval and forced session invalidation.

### SB-003 — Signed API Authentication Surface Eliminated

**Status: Closure candidate — pending merge and security review**

- **Original risk:** If a signed API authentication endpoint accepted replayable credentials while its nonce store was unavailable, financial mutations could be replayed.
- **Current state:** No signed API authentication route is exposed.
- **Resolution:** Dormant adapter removed. The former signed-auth source module and deprecated best-effort audit writer are absent.
- **Launch boundary:** Signed API request authentication is launch-disabled / not implemented for soft launch.
- **Credential distinction:** API-key create/list/enable/disable/rotate/delete remains active and transactionally evidenced; these credentials are not accepted as request principals.
- **Evidence:** `docs/security/SIGNED_API_AUTH_LAUNCH_POLICY.md`, Issue #246 guard, API Security Manifest, API-key transactional PostgreSQL tests.
- **Attack-path result:** Redis or nonce-store outage cannot create a replay-vulnerable signed-auth path because no such path exists.
- **Future activation:** Future activation is blocked by governance and requires a new P0 design covering nonce durability, timestamp policy, permissions, route inventory, mandatory evidence and recovery.
- **Rollback:** Recreating the deleted adapter or exposing signed-auth headers is not a rollback; it is a new security architecture change requiring explicit P0 approval.

### SB-004 — Mock KYC in Production

- **Risk:** Sumsub KYC returns mock sessions when unconfigured. Production compliance risk.
- **Location:** `src/lib/compliance/sumsub.ts`
- **Evidence:** Provider/environment behavior must remain covered by production-negative tests.
- **Fix:** Block mock sessions in production unless an explicit non-production flag is active.
- **Target Phase:** 39.6
- **Rollback:** Revert KYC adapter change only outside production.

### SB-005 — HSM/MPC Throws at Runtime

- **Risk:** Incomplete providers can be selected by environment variable, causing signing failures.
- **Location:** `src/lib/wallet/signing/keystore.ts`
- **Evidence:** Incomplete provider selection must remain gated.
- **Fix:** Gate incomplete providers behind production-safe feature flags.
- **Target Phase:** 40 (with gating in 39.6)
- **Rollback:** Revert keystore gate only while real withdrawals remain disabled.

### SB-006 — Internal Price-Feed Endpoint Public

- **Risk:** An internal price-feed mutation without server authentication could accept untrusted status or evidence.
- **Location:** `src/app/api/internal/price-feed-status/route.ts`
- **Fix:** Require reviewed server identity and bounded request authority.
- **Target Phase:** 39.6
- **Rollback:** Disable endpoint if authority cannot be proven.

---

## P1 — Blocks Confident Release

### SB-007 — Production Rate Limiting Falls Back to Memory

- **Risk:** Per-instance rate limiting does not scale across instances. DDoS window.
- **Location:** `src/lib/rate-limit.ts`
- **Fix:** Require Redis authority or explicitly fail closed for high-risk operations.
- **Target Phase:** 39.6

### SB-008 — Local JSON Auth Storage in Production

- **Risk:** Local browser/file fallback could become an identity source of truth.
- **Location:** Academy authentication and browser-persistence inventory.
- **Fix:** Block local storage fallback in production builds.
- **Target Phase:** 39.6

### SB-009 — Broad CSP Fallback

- **Risk:** CSP includes broad `https:`, `wss:`, and `ws:` when env vars are incomplete.
- **Location:** `deploy/nginx/tecpey.conf`
- **Fix:** Tighten CSP `connect-src` in production.
- **Target Phase:** 39.6

### SB-010 — Secret Fan-Out

- **Risk:** Session authority falling back through unrelated secrets expands compromise blast radius.
- **Location:** Session authority inventory.
- **Fix:** Maintain one authoritative secret per credential class and explicit rotation.
- **Target Phase:** 42

### SB-011 — Admin Auth in sessionStorage

- **Risk:** Admin authority in browser-readable storage is XSS-extractable.
- **Location:** Historical Admin-auth inventory and browser persistence guard.
- **Fix:** Maintain httpOnly server-owned Admin session authority.
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

| ID | Risk | Impact | Probability | Priority / Status |
|----|------|--------|-------------|-------------------|
| SB-001 | CSRF gaps | High | High | P0 — open inventory |
| SB-002 | Raw Admin token paths | High | Medium | P0 — governed replacement requires final sign-off |
| SB-003 | Signed API replay | High if exposed | None while surface absent | P0 — closure candidate by surface elimination |
| SB-004 | Mock KYC | High | Medium | P0 |
| SB-005 | HSM/MPC throws | High | Medium | P0 |
| SB-006 | Public price-feed mutation | High | Medium | P0 |
| SB-007 | Per-instance rate limit | Medium | Medium | P1 |
| SB-008 | Local auth in prod | High | Low | P1 |
| SB-009 | Broad CSP | Medium | Medium | P1 |
| SB-010 | Secret fan-out | High | Low | P1 |
| SB-011 | Admin browser storage | High | Low | P1 |
| SB-012 | English lang/dir | Medium | Medium | P2 |
| SB-013 | Visual contact forms | Low | High | P3 |
| SB-014 | Auth rate limiting | Low | Medium | P3 |

---

## Blocker Closure Criteria

A blocker is considered closed when:

1. The fix or approved surface elimination is implemented and merged.
2. QA evidence confirms the intended boundary.
3. A negative test or source guard confirms the attack path is blocked.
4. Rollback or future-activation rules are documented.
5. Security review approves.

For SB-003 specifically, closure requires:

- zero signed API authentication routes;
- deleted dormant adapter remains absent;
- former signed-auth headers are absent from active routes;
- API-key credential lifecycle remains transactionally evidenced;
- future activation remains blocked by `SIGNED_API_AUTH_LAUNCH_POLICY.md`.

---

*Security blockers for Phase 39.5 launch assessment. Current-state corrections are tied to reviewed hardening issues and exact-head evidence.*
