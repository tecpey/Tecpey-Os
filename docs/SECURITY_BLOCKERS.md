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
> | SB-001 | CSRF gaps on state-changing routes | **Closed, with governed exceptions.** 73 of 78 governed mutating operations enforce CSRF. The 5 that do not are 4 `deny-only` operations (they reject mutations outright) plus the pre-authentication WebAuthn challenge, which accepts no caller identifier, binds to no session and carries rate-limit, body-size and audit controls instead. Manifest findings: **0**. Counted against the manifest `npm run api:security:check` regenerates, not the committed copy, which lags at 70 operations and produced the earlier 65-of-70 figure. | `src/lib/csrf.ts` (`verifyCsrfOrigin`, fail-closed without `NEXT_PUBLIC_SITE_URL`); `src/tests/security/csrf-mutation-boundary.test.ts`, `csrf-origin-authority.test.ts`, `csrf-await-guard.test.ts` |
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
> | SB-013 | **Closed.** The contact form posts to a governed, CSRF-checked, rate-limited, encrypted-at-rest intake (`support_messages`) instead of a `mailto:` link; storage failure answers `503`, never a false success. | `src/app/api/support-message/route.ts`; `src/components/contact/SupportMessageForm.tsx`; `scripts/check-support-message-authority.mjs`; #577 |
> | SB-014 | **Closed.** Both `deploy/nginx/tecpey.conf` and `deploy/nginx/tecpey.ssl.conf` carry a dedicated `tecpey_auth` zone (`rate=1r/s`, one-tenth of `tecpey_api`'s `10r/s`) applied via a regex location ahead of the general `/api/` block, covering every route under `auth/`, `academy-auth`, `academy/auth/` and `command-center/auth/`. `npm run nginx:auth-rate-limit:check` derives the auth-route set from `src/app/api` itself and fails if any such route, in either config file, is not covered by the tighter zone — or if the general `/api/` location is declared `^~`, which would silently shadow it. | `deploy/nginx/tecpey.conf`; `scripts/check-nginx-auth-rate-limit-authority.mjs` |
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
- **Current exposure — corrected 2026-08-20 after review.** An earlier draft of
  this entry called the defect "contained" because real-money Exchange activation
  is launch-disabled (`FIN-001`). **That was wrong, and it understated the risk.**
  `FIN-001` is a governance position, not a runtime gate: `POST /api/orders` never
  calls `requireFeature` or `isFeatureEnabled`, no middleware gates it, and the
  migrations seed **active** `BTCUSDT` and `ETHUSDT` markets. Any authenticated
  principal with sufficient balance could reach the matching engine and trigger
  the misexecution **today**. The defect was live and reachable, not deferred —
  see SB-016, which tracks the missing runtime gate itself.
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

### SB-016 — `exchange.enabled` Is Reported But Never Enforced at the API Boundary

**Status: CLOSED for the Exchange surface — 2026-08-20, issue #502.**

- **Resolution:** `POST /api/orders` now calls `requireFeature("exchange.enabled")`
  before any request work — before CSRF, session resolution, rate-limit budget and
  body parsing — so a launch-disabled surface refuses before acting on the
  caller's behalf. The guard already existed in `src/lib/route-guards.ts:62` for
  exactly this purpose and nothing had ever called it. The flag defaults to off,
  so an unset `FEATURE_EXCHANGE_ENABLED` rejects: fail-closed.
- **Deliberate asymmetry — cancellation is NOT gated.** Gating `DELETE
  /api/orders/[id]` would strand resting orders, and the balance they hold,
  whenever the Exchange is switched off. Halting a market means refusing new
  exposure, not refusing to unwind existing exposure, so the cancel route stays
  callable. `src/tests/security/exchange-launch-flag-enforcement.test.ts` asserts
  this explicitly so a later change cannot "complete" the gating and trap funds.
- **Guard:** the same test locks the fail-closed flag semantics (only an exact
  `"true"` enables), the placement refusal, that the gate precedes all request
  work, and an enforcement table that must not drift from the product registry —
  so a future flag-carrying surface cannot ship display-only without a
  deliberate decision. Verified load-bearing: removing the gate fails 2 of 5.
- **Residual scope — CLOSED 2026-08-21, issue #510.** The community surface was
  never Social's to own. `social.enabled` gates the unshipped social-auth provider
  capability in `admin-control-plane-matrix.ts`; community profiles and journals
  ship today. Simply defaulting `social.enabled` on would therefore have unlocked
  genuinely launch-locked admin surfaces — the obvious fix was the wrong one. The
  two capabilities are now separated: `community.enabled` (default **on**, matching
  what ships) governs the community surface and is enforced fail-closed at
  `PATCH /api/community/profile`; `social.enabled` keeps gating social auth and
  stays off by default, and its product entry no longer claims community or
  journals. The enforcement ledger now enumerates **every** feature flag rather
  than only product-declared ones — a product-only sweep would have missed
  `community.enabled` entirely — and asserts that each `route-enforced` claim has
  a matching `requireFeature` call in the route it names.

- **Original residual record — superseded by the entry above.** An earlier
  draft classified `social.enabled` as having no mutating surface. **That was
  wrong**, and review caught it: `PATCH /api/community/profile` is an active
  mutating route owned by the Social product ("Community, groups, journals, and
  leaderboards") and carries no feature guard. Recording it as
  `no-mutating-surface` would have made the new drift test pass while blessing
  precisely the gap it exists to detect — a guard that launders a gap is worse
  than no guard. It is now recorded as `unenforced-mutating-surface`.
- **Why Social is not gated in the same change.** The community surface ships
  live: `PeerJournals`, `ChallengeCenter`, `AchievementCenter` and
  `CommunityCareerPanel` all reach that route, and no page checks
  `social.enabled`. Gating it behind an off-by-default flag would take a working
  Academy feature offline in every environment that does not set
  `FEATURE_SOCIAL_ENABLED`. The real defect is the **contradiction** between a
  live surface and an off-by-default product flag — either the flag should
  default on for the shipped subset, or community should be separated from the
  unshipped Social product. That is a product decision and is left open.
- **`future.marketplace.enabled`** genuinely has no mutating route today and is
  recorded as `no-mutating-surface`. `academy.enabled` and `mentor.enabled`
  default **on**, so they make no launch claim and carry no SB-016 risk; the
  guard asserts those defaults so the classification cannot silently invert.

**Original record — Status: OPEN — found 2026-08-20 while correcting SB-015 after review.**

- **Risk:** The entire launch posture rests on the statement that the real-money
  Exchange is disabled. In code that statement is **display-only**.
  `exchange.enabled` (`FEATURE_EXCHANGE_ENABLED`, `defaultEnabled: false`) is read
  by exactly three non-test consumers: `src/lib/product-registry.ts:32-33` for
  surface listing, and `src/lib/admin-control-plane-matrix.ts:104` for reporting
  `launch_locked`. **No API route and no middleware enforces it.**
- **Consequence:** `POST /api/orders` accepts and matches orders regardless of the
  flag, against the `active` `BTCUSDT` / `ETHUSDT` markets seeded by
  `src/lib/db-migrate.ts:598-599`. The admin control plane will report the
  Exchange as `launch_locked` while the ordering API is in fact serving requests.
  A governance dashboard that disagrees with runtime behaviour is worse than no
  dashboard, because it is trusted.
- **Scope note:** this is broader than order placement. Every surface assumed to
  be "launch-disabled by flag" needs the same audit — a flag that is only read for
  display cannot be cited as a control anywhere.
- **Location:** `src/app/api/orders/route.ts` (no feature check),
  `src/lib/feature-flags.ts:23`, `src/lib/product-registry.ts:32-33`,
  `src/lib/admin-control-plane-matrix.ts:104`, `src/lib/db-migrate.ts:598-599`.
- **Fix:** enforce the flag fail-closed at the admission boundary for every
  flag-gated surface, and add a guard asserting that each launch-disabled
  capability has a runtime refusal and not merely a registry entry. Editing the
  route changes its manifest `sourceHash`, so this requires a reviewed-delta shard
  carrying a tracking issue number — it is deliberately **not** bundled into the
  SB-015 change.
- **Rollback:** the gate is a refusal; reverting it re-opens the surface and must
  not be done while the Exchange is meant to be disabled.

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

This table is a restatement. The authority for current status is
"P0 status against current code" and "P1 / P2 status against current code" above;
`src/tests/security/blocker-status-agreement.test.ts` fails when the two disagree.
Priority is the original triage tier and does not change on closure — a closed P0
was still a P0.

| ID | Risk | Impact | Probability | Priority | Status |
|----|------|--------|-------------|----------|--------|
| SB-001 | CSRF gaps | High | High | P0 | Closed, with governed exceptions |
| SB-002 | Raw Admin token paths | High | Medium | P0 | Closed |
| SB-003 | Signed API replay | High if exposed | None while surface absent | P0 | Closure candidate — surface absent |
| SB-004 | Mock KYC | High | Medium | P0 | Closed |
| SB-005 | HSM/MPC throws | High | Medium | P0 | Closed as gated — production signing unimplemented by design |
| SB-006 | Public price-feed mutation | High | Medium | P0 | Closed |
| SB-007 | Per-instance rate limit | Medium | Medium | P1 | Closed |
| SB-008 | Local auth in prod | High | Low | P1 | Closed / bounded |
| SB-009 | Broad CSP | Medium | Medium | P1 | Closed |
| SB-010 | Secret fan-out | High | Low | P1 | Not reconciled — no verified-current-state row exists |
| SB-011 | Admin browser storage | High | Low | P1 | Closed |
| SB-012 | English lang/dir | Medium | Medium | P2 | Closed at the document root |
| SB-013 | Visual contact forms | Low | High | P3 | Closed |
| SB-014 | Auth rate limiting | Low | Medium | P3 | Closed |

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
