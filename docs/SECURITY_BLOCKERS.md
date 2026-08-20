# Security Blockers — Phase 39.5

**Date:** 2026-07-05  
**Current-state correction:** 2026-07-21 — Issue #246  
**Phase:** 39.5 — Strategic Freeze & TecPey DNA Synchronization  
**Status:** Official  
**Purpose:** Complete inventory of security issues that block production launch.

---

> ## Current-state reconciliation — 2026-08-20
>
> This is a dated Phase 39.5 record. The per-blocker entries below are preserved
> as written; this section states what the **current code on `main`** actually
> does, so a reader does not act on a July inventory. Where a note and an
> original entry disagree, **the note and the current code win**.
>
> **Launch control is unchanged: still NO-GO.** Closing these engineering
> blockers did not grant a Go decision. The current gate is operational evidence
> (`OPS-010`…`OPS-014`, `QA-050`, `QA-051` in
> `config/enterprise-global-product-readiness.json`), which cannot be produced
> from inside this repository. No sign-off, drill, or external evidence is
> claimed here.
>
> ### P0 status against current code
>
> | ID | Original claim | Verified current state | Evidence |
> |---|---|---|---|
> | SB-001 | CSRF gaps on state-changing routes | **Closed, with governed exceptions.** 65 of 70 governed mutating operations enforce CSRF. The 5 that do not are 4 `deny-only` operations (they reject mutations outright) plus the pre-authentication WebAuthn challenge, which carries rate-limit, body-size and audit controls instead. Manifest findings: **0**. | `src/lib/csrf.ts` (`verifyCsrfOrigin`, fail-closed without `NEXT_PUBLIC_SITE_URL`); `docs/security/generated/api-security-manifest.json`; `src/tests/security/csrf-origin-authority.test.ts`, `csrf-await-guard.test.ts` |
> | SB-002 | Raw Admin token in cookie | **Closed.** Admin session cookies are `httpOnly`; no browser-readable admin token path remains. | `src/lib/admin-passkey-service.ts:140,150` |
> | SB-003 | Signed API auth replay surface | **Unchanged** — already recorded below as a closure candidate; the surface remains absent. | entry below; `docs/security/SIGNED_API_AUTH_LAUNCH_POLICY.md` |
> | SB-004 | Mock KYC in production | **Closed.** An unconfigured provider throws `kyc_not_configured` in production instead of returning a mock session. | `src/lib/compliance/sumsub.ts:82-84` |
> | SB-005 | HSM/MPC throws at runtime | **Closed as gated, not as implemented.** In production an incomplete provider resolves to `custody_keystore_unavailable:custody_not_production_ready`, and the withdrawal worker refuses to start. Production custody signing remains **unimplemented by design**. | `src/lib/wallet/signing/keystore.ts:314-325`; `src/lib/wallet/signing/runtime-guard.ts:31` |
> | SB-006 | Internal price-feed endpoint public | **Closed.** The route requires `server_price_feed_monitor_required` server authority and is classified `internal` / `deny-only` in the manifest. | `src/app/api/internal/price-feed-status/route.ts` |
>
> ### P1 / P2 status against current code
>
> | ID | Verified current state | Evidence |
> |---|---|---|
> | SB-007 | **Closed.** Production no longer degrades to a per-instance memory limiter: without Redis authority the production path returns a fail-closed `ok: false` result. | `src/lib/rate-limit.ts` (`productionFallbackResult`) |
> | SB-008 | **Closed / bounded.** The browser-persistence guard passes with 25 classified lines across 7 production files, and quarantined legacy modules cannot become official evidence. | `npm run browser:persistence:check`; `scripts/check-browser-persistence.mjs` |
> | SB-009 | **Closed.** Connection policy is exact-origin and fail-closed; placeholder or broad values throw rather than widening CSP. | `src/lib/security/csp-connection-policy.ts`; `src/tests/security/csp-connection-policy.test.ts` |
> | SB-011 | **Closed.** Same authority as SB-002 — no admin credential is held in `sessionStorage` or `localStorage`. | `src/lib/admin-passkey-service.ts`; browser-persistence guard |
> | SB-012 | **Closed at the document root.** `lang` and `dir` are resolved server-side on `<html>` before hydration. | `src/app/layout.tsx:233-234` |
> | SB-013 | **Still open.** The contact surface is still `mailto:`-only; no server-side form handler exists. | `src/app/contact-us/page.tsx:16,17,51,61` |
> | SB-014 | **Not verified here.** Nginx auth-zone rate limiting is deployment configuration and is not asserted by any repository gate. | `deploy/nginx/tecpey.conf` |
>
> ### Newly confirmed while reconciling
>
> `SB-015` below was found during this pass. It is **open**, and it is a
> financial-safety defect rather than stale documentation.

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
- **Location:** Historical implementation in `src/proxy.ts`.
- **Fix:** Implemented under issue #164 through the typed fail-closed connection
  authority, production bootstrap validation, exact-origin tests and
  privacy-minimized browser violation evidence. Closure requires final CI/runtime
  evidence on the unchanged PR head.
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

### SB-015 — `stop_limit` Orders Are Accepted, Stored, and Silently Executed as Immediate Limit Orders

**Status: CLOSED — 2026-08-20, by refusal at the admission boundary.**

- **Resolution:** `validatePlaceOrderRequest` now refuses `stop_limit` before any
  other check, returning `order_type_unsupported`. The former stop-price
  validation is deleted rather than left unreachable — validating `stopPrice` and
  then returning `ok` was the specific behaviour that made the type look
  supported. The `OrderType` union and the persisted `CHECK` constraint are
  deliberately unchanged, so implementing real stop activation later does not
  also have to re-introduce the type and migrate the constraint.
- **Guard:** `src/tests/trading/stop-order-admission-guard.test.ts` locks the
  refusal, that it is independent of the supplied stop price, that it precedes
  the market-inactive and malformed-quantity checks, and that the supported
  types are still admitted. A final assertion fails if `engine.ts` ever gains a
  `stopPrice` / `stop_limit` / `stop_price` reference, so whoever builds stop
  activation is forced to revisit this guard rather than leave it stranded.
- **Verified load-bearing:** removing the refusal fails 4 of the 6 assertions.

**Original record — Status: OPEN — confirmed against current code on 2026-08-20.**

- **Risk:** Financial safety. `POST /api/orders` is `mutationMode: active` and
  accepts `type: "stop_limit"`. The request is validated *strictly* — `stopPrice`
  is required and checked for tick size and price precision — and `stop_price` is
  persisted. The matching engine then never reads it: `engine.ts` contains no
  reference to `stopPrice`, `stop_limit`, or `stop_price`, and computes
  `isGTC = !isMarket && !isFOK && !isIOC`, which is **true** for a stop-limit
  order. The order therefore rests on the book and becomes **immediately live at
  its limit price**, with the stop condition discarded.
- **Why this is worse than rejection:** a user placing a protective stop (for
  example, "sell only if the price falls to X") receives an order that is live
  right now. The strict validation of `stopPrice` actively signals that the order
  type is supported, which makes silent misbehaviour more likely to be trusted.
- **Current exposure:** contained, not fixed. Real-money Exchange activation is
  launch-disabled (`FIN-001`), so no user can reach this path today. The defect
  is live in code and becomes user-facing the moment the Exchange is enabled.
- **Location:** `src/lib/trading/validation.ts:113-127` (accepts and validates),
  `src/lib/trading/order-command-service.ts:133` and
  `src/lib/trading/order-service.ts:55,175` (persists `stop_price`),
  `src/lib/trading/engine.ts:396` (`isGTC` fallthrough; no stop handling),
  `src/lib/db-migrate.ts:536` (`CHECK (type IN (…,'stop_limit'))`).
- **Fix (either is acceptable, but one is required before Exchange activation):**
  reject `stop_limit` at the admission boundary until a trigger engine exists, or
  implement stop activation with its own resting/trigger state machine and
  negative tests. Rejecting is the smaller, safer change.
- **Rollback:** revert the admission-boundary change only while real withdrawals
  and real-money orders remain disabled.

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
