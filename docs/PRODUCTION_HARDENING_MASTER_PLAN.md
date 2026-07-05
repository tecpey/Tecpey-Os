# Production Hardening Master Plan — Phase 40

**Date:** 2026-07-05
**Phase:** 40 — Production Hardening
**Status:** Implementation Plan — AWAITING APPROVAL
**Classification:** Critical — Pre-Launch Execution Plan
**Purpose:** Define the complete execution plan to prepare TecPey for world-class production launch. No code changes until approved.

---

## Executive Summary

**Current State:** TecPey is NOT production-ready.

**Launch Blockers Identified (Phase 39.5):**
- 6 P0 security blockers (SECURITY_BLOCKERS.md)
- 5 critical technical debt items blocking release (TECHNICAL_DEBT_REGISTRY.md)
- 0 executable tests (TD-C06)
- Incomplete wallet security (HSM/MPC stubs throw at runtime)
- Trading engine gaps (stop-limit accepted but not implemented)
- Infrastructure gaps (no migration runner, no structured logging, no error monitoring)

**Estimated Time to Launch Readiness:** 13-22 days (Phase 39.6 + Phase 40 + Phase 41 partial)

**This Document:** Definitive implementation plan. Do NOT execute until approved.

---

## Scope

**IN SCOPE:**
- Security hardening (all P0/P1)
- Authentication hardening
- Wallet hardening (gating + critical fixes)
- Trading engine hardening (validation + stop orders)
- Runtime hardening
- Testing strategy (establish baseline)
- Performance baseline capture
- Deployment strategy
- Monitoring foundation
- Launch validation gates

**OUT OF SCOPE (Phase 40):**
- New feature development
- Multi-tenant infrastructure (Phase 44)
- Server-side persistence migration (Phase 43)
- Unified identity model (Phase 42)
- Database migration runner (Phase 41 — parallel track)
- Documentation updates (locked)

---

## 1. Security Hardening

### 1.1 P0 Blockers — Must Close Before Any Launch

| ID | Blocker | Current Location | Fix Target | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|----|---------|------------------|------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **SB-001** | CSRF gaps on state-changing routes | Multiple API routes lack `verifyCsrfOrigin()`. See `PROJECT_AUDIT_PHASE39.md` Section 7. | Add CSRF to: session revocation (`/api/auth/sessions/*`), API key management (`/api/api-keys/*`), admin routes (`/api/admin/*`) | P0 | 1-2 days | None | High — direct account takeover risk | Security Engineer | 1. All state-changing routes enforce CSRF. 2. Negative test confirms attack path blocked. 3. QA evidence captured. 4. Rollback plan documented. | Cannot proceed to Soft Launch with any state-changing route unprotected. |
| **SB-002** | Raw admin token in cookie | `src/lib/admin-auth.ts:17` — `ADMIN_TOKEN_COOKIE` stores raw `TECPEY_ADMIN_TOKEN`. Also stored in sessionStorage (XSS-extractable). | Replace with signed httpOnly admin session cookie containing opaque nonce. See `setAdminSessionCookie()` pattern already partially implemented. | P0 | 1 day | None | High — cookie theft = admin compromise | Security Engineer | 1. Raw token never stored in cookie or sessionStorage. 2. Admin auth uses `tecpey_admin_session` httpOnly cookie with signed JWT. 3. Negative test: cookie theft does not grant admin access. 4. `hasAdminAccess()` updated. | Cannot deploy with raw admin token in any client-accessible storage. |
| **SB-003** | API key replay protection disabled without Redis | `src/lib/security/api-key-auth.ts:62-71` — `markNonceUsed()` returns `"unavailable"` when `globalThis.tecpeyRedisClient` is null. Nonce check skipped. | Fail closed in production: if Redis unavailable and `NODE_ENV=production`, reject signed API key requests with `503 service_unavailable` and log critical alert. | P0 | 1 day | Redis infrastructure | High — financial API replay attacks possible | Security Engineer | 1. Production rejects API key requests when replay store unavailable. 2. Error logged with severity "critical". 3. Test confirms replay blocked when Redis present. 4. Test confirms production fail-closed when Redis absent. | Cannot expose signed API endpoints without replay protection in production. |
| **SB-004** | Mock KYC in production | `src/lib/compliance/sumsub.ts:21-23` — `isConfigured()` returns false when env missing; adapter returns `mock_${userId}` sessions instead of blocking. | Block mock sessions in production. If `NODE_ENV=production` and Sumsub not configured, KYC must return `not_verified` with explicit error, never mock. | P0 | 0.5 day | None | High — compliance violation, regulatory risk | Security Engineer + Compliance | 1. Production never returns mock KYC sessions. 2. Unconfigured Sumsub in prod → explicit error. 3. Test: `NODE_ENV=production` + missing Sumsub → not_verified. 4. Audit log records mock prevention. | Cannot claim KYC compliance with mock sessions possible in production. |
| **SB-005** | HSM/MPC throws at runtime | `src/lib/wallet/signing/keystore.ts:204-236` — `HsmKeyStore.sign()` and `MpcKeyStore.sign()` throw "Not implemented". Factory at line 280-281 selects based on env vars. | Gate incomplete providers behind production-safe feature flags. Factory must never return HSM/MPC in production unless explicitly enabled AND fully implemented. See `WALLET_PHASE39_READINESS_REPORT.md` for complete analysis. | P0 | 2 days (gating) | None for gating; full impl is Phase 40+ | High — signing failure on withdrawal if env misconfigured | Wallet Engineer | 1. Factory never selects HSM/MPC in production unless `WALLET_ENABLE_HSM=true` AND `WALLET_ENABLE_MPC=true`. 2. If selected but not ready, throw explicit "Provider not production-ready" before any signing. 3. Hot wallet remains default for production. 4. Tests cover all factory paths. | Cannot allow env var to select throwing providers in production. |
| **SB-006** | Internal price-feed endpoint public | `src/app/api/internal/price-feed-status/route.ts:45` — `POST` endpoint has no auth beyond optional token header. Documented as "client calls it" but no server token required in current code. | Require either: (a) `TECPEY_PRICE_FEED_STATUS_TOKEN` header with timing-safe compare, OR (b) same-origin + CSRF. Currently partially implemented (line 32-43 checks token) but token is optional in practice. Make token REQUIRED in production. | P0 | 0.5 day | None | Medium — DDoS amplifier if public | Security Engineer | 1. Production requires valid `x-tecpey-price-feed-token` header. 2. Invalid/missing token → 401. 3. Rate limit enforced (already present). 4. Test confirms unauthorized calls rejected. | Cannot expose internal alert endpoint without auth. |

**P0 Security Hardening Total Estimated Effort:** 6-7 days

---

### 1.2 P1 Blockers — Must Close Before Confident Release

| ID | Blocker | Current Location | Fix Target | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|----|---------|------------------|------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **SB-007** | Per-instance rate limiting | `src/lib/rate-limit.ts:118-121, 134-136, 152-154` — Falls back to `memoryRateLimit()` when Redis REST unavailable. Production warns but does not fail. | In production, if Redis REST not configured AND `TECPEY_ALLOW_MEMORY_RATE_LIMIT !== "1"`, rate limit functions must return `ok: false` (fail closed) or throw explicit error. See `validate-env.mjs:78-88` for existing check pattern. | P1 | 0.5 day | None | Medium — DDoS window on multi-instance | SRE | 1. Production without Redis REST → rate limits fail closed (unless explicit opt-in). 2. `validate-env.mjs` already enforces; align rate-limit.ts behavior. 3. Test: production + no Redis REST → `ok: false`. | Cannot deploy multi-instance without coordinated rate limiting. |
| **SB-008** | Local JSON auth storage in production | `src/app/api/academy-auth/route.ts` — `TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE` can be enabled in production. | Block local storage fallback in production builds. If `NODE_ENV=production` and flag set, reject with error. | P1 | 0.5 day | None | High — data loss, no server persistence | Security Engineer | 1. Production build ignores or rejects `TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE`. 2. Auth fails explicitly, not silently. 3. Test confirms production blocks local fallback. | Cannot allow localStorage auth in production. |
| **SB-009** | Broad CSP fallback | `deploy/nginx/tecpey.conf:15` — CSP includes `https:`, `wss:`, `ws:` when env incomplete. | Tighten CSP in production mode. Remove broad wildcards. Use explicit allowlist for known external origins (TradingView, etc.). | P1 | 0.5 day | None | Medium — XSS surface | Security Engineer | 1. Production CSP does not include broad `https:`, `wss:`, `ws:`. 2. Only explicitly allowed origins. 3. Test: production nginx config has tight CSP. | Cannot deploy with overly permissive CSP. |
| **SB-010** | Secret fan-out | `src/lib/session.ts` — `user_session` falls back through `TECPEY_SESSION_SECRET` → `JWT_SECRET` → `NEXTAUTH_SECRET`. | Remove fallback chain. Single authoritative secret: `TECPEY_SESSION_SECRET`. If missing, fail hard. | P1 | 1 day | Phase 42 unified auth (partial overlap) | High — compromise of any secret compromises all | Security Engineer | 1. Session validation uses ONLY `TECPEY_SESSION_SECRET`. 2. No fallback to other secrets. 3. Missing secret → hard failure at startup. 4. Audit confirms no other secret used. | Cannot ship with secret fan-out. |
| **SB-011** | Admin auth in sessionStorage | `src/lib/admin-auth.ts` — Legacy path accepts raw token from sessionStorage. | Remove sessionStorage path entirely. Admin auth ONLY via httpOnly cookie set by `setAdminSessionCookie()`. | P1 | 0.5 day | SB-002 | High — XSS extracts admin token | Security Engineer | 1. No code path reads admin token from sessionStorage. 2. Admin dashboard rejects sessionStorage token. 3. Test confirms XSS cannot extract admin credential. | Cannot allow XSS-extractable admin credential. |

**P1 Security Hardening Total Estimated Effort:** 3 days

---

## 2. Authentication Hardening

### 2.1 JWT & Session Architecture

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **JWT Secret Unification** | Three secrets (`TECPEY_SESSION_SECRET`, `JWT_SECRET`, `NEXTAUTH_SECRET`) with fallback chain in `src/lib/session.ts`. | Single secret: `TECPEY_SESSION_SECRET`. No fallbacks. | P1 | 1 day | SB-010 | High | Security Engineer | 1. All JWT issuance/verification uses only `TECPEY_SESSION_SECRET`. 2. Missing secret → startup failure. 3. Audit log confirms single secret usage. | Cannot ship with secret fan-out. |
| **Session Cookie Standardization** | Three cookies: `user_session`, `tecpey_academy_auth`, `tecpey_student_session`. | Target (Phase 42): Single `tp_session` httpOnly cookie. Phase 40: Document current state, do not refactor yet. | P2 (Phase 42) | N/A (Phase 40) | Phase 42 | Medium | N/A | N/A — deferred | Phase 40 does not refactor auth cookies. |
| **JWT Structure Alignment** | Current JWTs do not match `MASTER_BLUEPRINT_v3.md` Section 2.2 target structure. | Document gap. Do not restructure in Phase 40. | P2 (Phase 42) | N/A | Phase 42 | Low | N/A | N/A — deferred | Phase 40 does not restructure JWT payloads. |

### 2.2 Admin Authentication

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Raw Token Elimination** | `src/lib/admin-auth.ts` stores raw `TECPEY_ADMIN_TOKEN` in cookie and sessionStorage. | Signed httpOnly session cookie only. See `setAdminSessionCookie()` already partially implemented. | P0 | 1 day | SB-002, SB-011 | High | Security Engineer | 1. Raw token never in client storage. 2. Admin auth via `tecpey_admin_session` httpOnly cookie. 3. `hasAdminAccess()` verifies signed JWT. 4. Negative test: stolen cookie without signature is invalid. | Cannot deploy with raw admin token. |
| **Admin Token Length Enforcement** | `isAdminConfigured()` requires >= 24 chars. | Increase to >= 32 chars. Align with `validate-env.mjs` secret length checks. | P1 | 0.5 day | None | Low | Security Engineer | 1. Admin token minimum 32 chars. 2. `isAdminConfigured()` updated. 3. Env validation enforces. | Weak admin token reduces security margin. |

### 2.3 API Key Authentication

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Replay Protection Enforcement** | `src/lib/security/api-key-auth.ts` — nonce check skipped if Redis unavailable. | Fail closed in production. See SB-003. | P0 | 1 day | SB-003, Redis | High | Security Engineer | 1. Production rejects API key requests when replay store unavailable. 2. Nonce check always runs when Redis present. 3. Test: replay attempt rejected within 5-minute window. | Cannot expose signed API endpoints without replay protection. |
| **Timestamp Window Hardening** | 5-minute window (`TIMESTAMP_WINDOW_MS = 5 * 60 * 1000`). | Acceptable. Document as design decision. No change. | P3 | N/A | None | Low | N/A | N/A | N/A |
| **Permission Scope Enforcement** | API key permissions checked via `validateApiKey()`. | Audit all permission checks for completeness. Ensure no privilege escalation paths. | P1 | 1 day | None | Medium | Security Engineer | 1. All API key protected routes check permissions. 2. Audit confirms no bypass. 3. Test: key with limited permissions cannot access restricted endpoints. | Cannot allow permission bypass. |

### 2.4 CSRF Protection

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **CSRF Coverage Audit** | `PROJECT_AUDIT_PHASE39.md` Section 7 identifies gaps. | All state-changing routes protected. See SB-001. | P0 | 1-2 days | None | High | Security Engineer | 1. Every `POST`, `PUT`, `DELETE`, `PATCH` route calls CSRF verification. 2. Negative test confirms cross-origin attack blocked. 3. CSRF token generation and validation tested. | Cannot ship with unprotected state-changing routes. |
| **CSRF Token Rotation** | Not documented. | Ensure CSRF tokens rotate on privilege elevation (e.g., login, 2FA enable). | P2 | 1 day | SB-001 | Low | Security Engineer | 1. CSRF token invalid after login. 2. CSRF token invalid after 2FA enable/disable. 3. Test confirms rotation. | Low priority for Phase 40; can ship if SB-001 closed. |

### 2.5 Rate Limiting

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Redis REST Coordination** | `src/lib/rate-limit.ts` falls back to memory. `validate-env.mjs:78-88` warns but does not fail. | Production requires Redis REST unless `TECPEY_ALLOW_MEMORY_RATE_LIMIT=1`. See SB-007. | P1 | 0.5 day | None | Medium | SRE | 1. Production without Redis REST → rate limit fail-closed (unless explicit opt-in). 2. `validate-env.mjs` already enforces; align rate-limit.ts. 3. Test confirms behavior. | Cannot deploy multi-instance without coordinated limits. |
| **Auth Endpoint Specificity** | Nginx `tecpey_general` zone (30r/s) applies to all routes including auth. | Add `limit_req_zone` for auth endpoints with tighter limits (e.g., 5r/m for login). See SB-014. | P2 | 0.5 day | None | Low | SRE | 1. Auth endpoints have dedicated rate limit zone. 2. Login limited to 5 requests per minute per IP. 3. Test confirms rate limit enforced. | Not blocking for Phase 40; can defer to 45. |

---

## 3. Wallet Hardening

### 3.1 Hot Wallet (Current Production Path)

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Bitcoin Public Key Bug** | `src/lib/wallet/withdrawal-executor.ts:68` — `getAddress()` returns address, but code treats it as public key bytes for BTC. See TD-H09. | Pass actual compressed public key bytes to Bitcoin provider, not address string. | P1 | 1 day | None | High — invalid BTC transactions | Wallet Engineer | 1. Bitcoin withdrawals produce valid signed transactions. 2. Test: `getAddress()` result not passed where pubkey bytes expected. 3. Reference vector test confirms correct signature. | Cannot execute real BTC withdrawals with this bug. |
| **Bitcoin Multi-Input Signing** | `src/lib/wallet/providers/bitcoin.ts:27-56` — `selectUTXOs` selects multiple, but provider only signs input 0. See TD-H08. | Sign ALL selected inputs. | P1 | 1 day | None | High — malformed BTC transactions | Wallet Engineer | 1. Multi-UTXO BTC transactions signed correctly for all inputs. 2. Test: withdrawal requiring 2+ UTXOs produces valid tx. 3. Reference vector confirms. | Cannot execute multi-UTXO BTC withdrawals. |
| **Ethereum Nonce Race Condition** | `src/lib/wallet/providers/ethereum.ts:77-96` — Redis nonce cache + RPC fallback creates TOCTOU if multiple withdrawals in flight. | Implement atomic nonce reservation. Use Redis `INCR` or DB transaction for nonce assignment. | P1 | 1-2 days | Redis | High — nonce reuse → tx failure or double-spend | Wallet Engineer | 1. Concurrent withdrawals for same address do not reuse nonce. 2. Test: 10 concurrent withdrawals → 10 unique nonces. 3. Nonce persisted across restarts (Redis or DB). | Cannot safely execute concurrent ETH withdrawals. |
| **Tron Provider Broken** | `src/lib/wallet/providers/` — Tron extends EthereumProvider but inherits ETH logic. Address derivation, signing, RPC calls incorrect. | Fix Tron provider or explicitly disable Tron withdrawals until fixed. | P1 | 2 days (or disable) | None | High — Tron withdrawals will fail or send to wrong addresses | Wallet Engineer | 1. If enabled: Tron withdrawals produce valid TRC-20/TRX transactions. 2. If disabled: clear error message, no silent failure. 3. Test vectors for Tron address format (0x41 prefix). | Cannot claim Tron support if broken. |
| **Solana SPL Token Support** | `src/lib/wallet/providers/solana.ts` — Only SOL transfers. No SPL token support. | Implement SPL token transfers OR explicitly document "SOL only" for Phase 40. | P2 | 2 days (or defer) | None | Medium — incomplete asset support | Wallet Engineer | 1. If enabled: SPL token withdrawals work. 2. If deferred: documentation and UI clearly state "SOL only". | Not blocking if documented. |

### 3.2 HSM / MPC / Multisig (Phase 39 Scaffolding — Not Production Ready)

See `WALLET_PHASE39_READINESS_REPORT.md` for complete file-by-file analysis.

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **HSM/MPC Factory Gating** | `src/lib/wallet/signing/keystore.ts:279-281` — Factory selects HSM/MPC based on env vars. Providers throw at runtime. | Factory MUST NOT return HSM/MPC in production unless explicitly enabled AND implemented. See SB-005. | P0 | 1 day | None | Critical — signing failure if env misconfigured | Wallet Engineer | 1. Production default is always HotWalletKeyStore. 2. HSM/MPC only if `WALLET_ENABLE_HSM=true` AND `WALLET_ENABLE_MPC=true`. 3. If selected but not ready → explicit error, not silent throw. 4. Test covers all factory branches. | Cannot allow env var to select throwing providers. |
| **HSM Interface Contracts** | `src/lib/wallet/hsm/types.ts` — Incomplete. Lacks signature encoding constraints, audit metadata, key lifecycle. | Complete interface contracts with type-level tests. Do not implement providers yet. | P2 (Phase 40+) | 1 day | None | Medium — ambiguous contracts | Wallet Engineer | 1. HSM types complete and compile. 2. Type-level contract tests pass. 3. No production provider wiring. | Not blocking for Phase 40 if gated. |
| **MPC Interface Contracts** | `src/lib/wallet/mpc/types.ts`, `session.ts`, `orchestrator.ts` — Incomplete. `getKeyHandle()` throws. No real provider. | Complete contracts. Implement session state machine with fake provider for tests. Do not wire real MPC SDK yet. | P2 (Phase 40+) | 2 days | None | Medium — incomplete trust model | Wallet Engineer | 1. MPC types complete. 2. Session state machine tested (completed, failed, expired, timeout). 3. No real MPC SDK integration. | Not blocking if gated. |
| **Multisig Bitcoin Helpers** | `src/lib/wallet/multisig/bitcoin.ts` — Partial. Witness construction does not verify signature order. No PSBT handling. | Complete BIP-67 sorting vectors, witness stack vectors. Do not implement transaction execution yet. | P2 (Phase 40+) | 1 day | None | High — wrong witness order invalidates tx | Wallet Engineer | 1. BIP-67 vectors pass. 2. Witness stack vectors pass. 3. No execution path wired. | Not blocking if gated. |
| **Multisig Safe (Ethereum) Helpers** | `src/lib/wallet/multisig/ethereum.ts` — Partial. EIP-712 helper only. No on-chain execution. | Complete Safe domain separator vectors, SafeTx hash vectors. Do not implement execution. | P2 (Phase 40+) | 1 day | None | Medium — Safe compatibility unproven | Wallet Engineer | 1. Safe EIP-712 vectors pass. 2. Signature byte layout validated. 3. No on-chain execution. | Not blocking if gated. |
| **Wallet Policy Cache** | `src/lib/wallet/policy/engine.ts` — Imports `./cache` which does not exist. | Implement `cache.ts` OR remove policy engine from Phase 40 scope. | P1 | 1 day | None | High — if committed without cache, policy skipped | Wallet Engineer | 1. `policy/cache.ts` exists and exports required interface. 2. Engine compiles. 3. Policy tests pass. | Cannot commit policy without cache. |
| **Wallet Policy Engine Validation** | `src/lib/wallet/policy/engine.ts` — Defaults allow high limits. `operatorId: null` bypasses allowlist. No amount validation. | Implement cache. Add strict defaults. Validate amounts (no NaN, no negative, no Infinity). | P1 | 1 day | Policy cache | High — permissive defaults bypass limits | Wallet Engineer | 1. Policy engine enforces limits. 2. Null operator does not bypass. 3. Invalid amounts rejected. 4. Tests cover boundary values. | Cannot ship permissive policy defaults. |

**Wallet Hardening Total Estimated Effort (P0 + P1 + gating):** 8-10 days

---

## 4. Trading Engine Hardening

### 4.1 Order Validation

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Stop-Limit Rejection** | `src/lib/trading/validation.ts:98-100` — Stop-limit accepted (price + stopPrice validated), but matching engine does not implement stop trigger logic. Order behaves as limit. See TD-H06. | Explicitly reject stop-limit orders with clear error: `"stop_limit_not_supported"`. Do not accept and silently misbehave. | P0 | 0.5 day | None | High — user expects stop behavior, gets limit | Trading Engineer | 1. `POST /api/orders` with `type: "stop_limit"` returns 400 with `stop_limit_not_supported`. 2. Test confirms rejection. 3. No stop-limit orders enter order book. | Cannot accept stop-limit orders without implementing stop logic. |
| **Order Type Completeness Audit** | `types.ts` defines: `limit`, `market`, `ioc`, `fok`, `gtc`, `stop_limit`. Implementation supports limit/market/ioc/fok/gtc. Stop-limit is the gap. | Audit confirms all other types correctly handled. | P2 | 0.5 day | None | Low | Trading Engineer | 1. All supported order types have test coverage. 2. IOC/FOK/GTC behavior validated. | Not blocking if stop-limit rejected. |

### 4.2 Risk Engine & Circuit Breakers

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Risk Engine Existence** | No dedicated risk engine module found. Risk checks are inline in order placement (balance hold, validation). | Document current state. Do not build new risk engine in Phase 40. | P3 (Phase 45+) | N/A | None | Low | N/A | N/A — deferred | Phase 40 does not build risk engine. |
| **Circuit Breaker for Matching** | No circuit breaker on matching engine. If matching loop spins or blocks, no automatic degradation. | Add simple circuit breaker: if `match()` takes > 5s for N consecutive iterations, pause matching and alert. | P2 | 1 day | None | Medium — matching loop can hang | Trading Engineer | 1. Circuit breaker trips after sustained slow matching. 2. Matching paused, orders still accepted (queued). 3. Alert emitted. 4. Manual reset to resume. | Not blocking for Phase 40 if documented. |

### 4.3 Order Book & Matching Engine

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **In-Memory Order Book Persistence** | `src/lib/trading/order-book.ts` — In-memory only. Lost on restart. Warm-start via `rebuildOrderBook()` in `order-book-store.ts`. | Verify warm-start is wired and tested. Ensure `getEngineBook()` calls `rebuildOrderBook()` on empty book. | P1 | 0.5 day | None | High — order book loss on restart | Trading Engineer | 1. Restart with open orders → book rebuilt from DB. 2. Test: place orders, restart, snapshot matches pre-restart. | Cannot lose open orders on restart. |
| **Redis Order Book Store** | `src/lib/trading/order-book-store.ts` — `RedisOrderBookStore` is a stub. Throws in production if `REDIS_URL` set. | Either: (a) implement Redis store, or (b) ensure production does not require it (single-instance in-memory is acceptable for Phase 40). | P1 | 2 days (or defer) | ioredis (already in package.json) | Medium — multi-instance order book inconsistency | Trading Engineer | 1. If Redis required: `RedisOrderBookStore` fully implemented and tested. 2. If deferred: production docs state "single-instance only" or "in-memory acceptable". | Multi-instance trading requires Redis book. |
| **Matching Engine Transaction Boundary** | Phase 30 uses two transactions: (1) order+hold, (2) match. Gap documented in `TRADING_CORE.md`. | For Phase 40: document gap. Full single-tx (order+hold+match) is Phase 31+ work, not in scope. | P3 (Phase 41+) | N/A | Phase 41 DB migration runner | Medium — partial state window | N/A | N/A — deferred | Phase 40 accepts two-tx gap if documented. |
| **Stop-Limit Trigger Engine** | Not implemented. Type accepted (bug). | Reject stop-limit (see 4.1). Do not implement trigger logic in Phase 40. | P0 (rejection) | 0.5 day | None | High | Trading Engineer | See "Stop-Limit Rejection" above. | Cannot accept stop-limit without trigger. |

---

## 5. Runtime Hardening

### 5.1 Node.js & Application Runtime

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Node Version Enforcement** | `package.json:70` — `"node": ">=20.11.0"`. CI uses 22. | Pin to exact major in CI and deployment docs. Document LTS policy. | P2 | 0.5 day | None | Low | SRE | 1. CI and deploy docs specify Node 22.x. 2. `engines` field updated if needed. | Not blocking. |
| **Memory Limit Configuration** | `ecosystem.config.cjs:12` — `max_memory_restart: '750M'`. | Validate against production server RAM. Set appropriate limit. Document OOM behavior. | P2 | 0.5 day | None | Medium — OOM restart loop | SRE | 1. PM2 memory limit appropriate for instance size. 2. OOM restart logged and alerted. | Not blocking for Phase 40. |
| **Graceful Shutdown** | `server.ts:75-81` — SIGTERM/SIGINT handlers call `stopWithdrawalWorkers()` and Redis shutdown. | Audit all long-lived resources (WS connections, BullMQ, Redis pub/sub, DB pool). Ensure all closed on shutdown. | P1 | 1 day | None | High — connection leaks on restart | SRE | 1. All resources closed on SIGTERM. 2. Test: graceful shutdown completes in < 30s. 3. No orphaned connections. | Cannot deploy without graceful shutdown. |

### 5.2 PM2 & Process Management

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **PM2 Ecosystem Config** | `ecosystem.config.cjs` — Single instance, fork mode, no clustering. | Document: single-instance for Phase 40. Clustering requires Redis order book (not ready). | P2 | 0.5 day | None | Low | SRE | 1. Docs state "single-instance for launch". 2. Clustering deferred to Phase 45+. | Not blocking. |
| **PM2 Startup Script** | `DEPLOY_UBUNTU_24_PRODUCTION.md:44-46` — `pm2 start ecosystem.config.cjs`, `pm2 save`, `pm2 startup`. | Verify startup script works on Ubuntu 24. Test on clean server. | P1 | 0.5 day | None | Medium — manual restart on reboot | SRE | 1. `pm2 startup` generates correct systemd unit. 2. Server reboot → PM2 restarts app. 3. Test on staging. | Cannot deploy without auto-restart on reboot. |

### 5.3 Docker & Containerization

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Dockerfile Audit** | `Dockerfile` exists (multi-stage). Not reviewed in this session. | Verify: non-root user, minimal attack surface, secrets not baked in, healthcheck present. | P1 | 0.5 day | None | High — container escape or secret leak | SRE | 1. Dockerfile reviewed. 2. Non-root user. 3. No secrets in image. 4. Healthcheck defined. | Cannot deploy un-audited container. |
| **Docker Compose Production** | `docker-compose.production.yml` — Web + Postgres + Redis. Passwords are placeholders. | Document: use `.env.production`, never commit real passwords. Verify volume persistence. | P2 | 0.5 day | None | Medium — data loss if volumes misconfigured | SRE | 1. Compose file reviewed. 2. Env file documented. 3. Volume backup strategy documented. | Not blocking if PM2 path is primary. |

### 5.4 PostgreSQL

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Migration Runner** | `src/lib/db-schema.ts` — `CREATE TABLE IF NOT EXISTS` on connect. No migration tracking. See TD-C02. | Phase 41 work. For Phase 40: document gap. Do not run schema changes without manual review. | P1 (Phase 41) | N/A | Phase 41 | High — schema drift in multi-instance | N/A | N/A — deferred | Phase 40 does not implement migration runner. |
| **Connection Pool Sizing** | `src/lib/db.ts` — Pool created with default settings. | Audit pool size vs. expected concurrency. Set `max` based on CPU/RAM. | P1 | 0.5 day | None | Medium — pool exhaustion | SRE | 1. Pool size documented. 2. Pool metrics exposed (if possible). 3. Test: load does not exhaust pool. | Cannot deploy without pool sizing review. |
| **Backup Strategy** | `DEPLOY_UBUNTU_24_PRODUCTION.md:104` — "Back up PostgreSQL daily." No implementation. | Define backup mechanism (pg_dump cron, or managed backup). Test restore. | P1 | 1 day | None | Critical — data loss | SRE | 1. Backup runs daily. 2. Backup stored off-server. 3. Restore tested on staging. 4. RTO/RPO documented. | Cannot launch without backup/restore capability. |

### 5.5 Redis

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Redis Persistence** | `docker-compose.production.yml:31` — `--appendonly yes`. Production deploy docs do not specify. | Ensure production Redis has AOF or RDB persistence. Document recovery. | P1 | 0.5 day | None | High — rate limit state loss, withdrawal queue loss | SRE | 1. Redis persistence enabled in production. 2. Restart does not lose critical data. 3. Recovery procedure documented. | Cannot deploy without Redis persistence. |
| **Redis Memory Limits** | Not configured in compose or docs. | Set `maxmemory` and `maxmemory-policy` (e.g., `allkeys-lru`). | P2 | 0.5 day | None | Medium — OOM | SRE | 1. Memory limit set. 2. Eviction policy documented. | Not blocking for Phase 40. |

### 5.6 Nginx

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **CSP Tightening** | `deploy/nginx/tecpey.conf:15` — Broad `https:`, `wss:`, `ws:`. See SB-009. | Tighten for production. Explicit allowlist. | P1 | 0.5 day | SB-009 | Medium | SRE | 1. Production CSP is explicit. 2. No broad wildcards. | Cannot deploy with permissive CSP. |
| **Rate Limit Zones** | `limit_req_zone` for `tecpey_api` (10r/s) and `tecpey_general` (30r/s). | Audit: are limits appropriate? Add auth-specific zone (see SB-014). | P2 | 0.5 day | None | Low | SRE | 1. Rate limits reviewed. 2. Auth zone added (or deferred). | Not blocking. |
| **SSL Configuration** | `DEPLOY_UBUNTU_24_PRODUCTION.md:64-69` — Certbot instructions. No `tecpey.ssl.conf` yet (see TECPEY_PROJECT_INDEX.md). | Ensure SSL config exists before launch. HSTS already in conf. | P1 | 0.5 day | None | High — no HTTPS | SRE | 1. SSL config deployed. 2. HTTPS redirect enforced. 3. HSTS header present. | Cannot launch without HTTPS. |

### 5.7 Environment & Secrets

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Env Validation Expansion** | `scripts/validate-env.mjs` — Checks required vars, placeholder tokens, secret length, mentor model allowlist, Redis REST in production. | Expand to cover: all wallet keys (format check), admin token length, price feed token, HSM/MPC endpoint sanity (if enabled). | P1 | 1 day | None | High — misconfiguration | SRE | 1. All critical secrets validated at startup. 2. Invalid config → hard failure. 3. Test: missing secret blocks start. | Cannot deploy without startup validation. |
| **Secret Rotation Procedure** | Not documented. | Document: how to rotate `TECPEY_SESSION_SECRET`, wallet keys, admin token, DB password. | P1 | 1 day | None | High — no rotation path | SRE | 1. Rotation runbook exists. 2. Zero-downtime rotation path for session secret (if possible). | Cannot launch without rotation plan. |
| **Secrets in Git** | `.env.production.example` has placeholders. Real `.env.production` must not be committed. | Audit: ensure no real secrets in git history. Add `.env.production` to `.gitignore` (verify). | P0 | 0.5 day | None | Critical — secret leak | SRE | 1. No real secrets in git. 2. `.gitignore` excludes `.env.production`. 3. Pre-commit hook or CI check (future). | Cannot launch if secrets in git. |

---

## 6. Testing Strategy

### 6.1 Test Infrastructure

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Test Runner** | `package.json` has no test script. 47 wallet tests exist in `src/tests/wallet/` but cannot execute. See TD-C06. | Add test runner (vitest recommended for Next.js 16 + TypeScript). Wire `npm test`. | P0 | 1 day | None | Critical — no safety net | QA Lead | 1. `npm test` runs wallet tests. 2. All 47 tests pass or are explicitly skipped with reason. 3. CI runs tests (see 6.2). | Cannot ship without executable tests. |
| **Test Framework Selection** | None selected. | Choose vitest (fast, ESM, TypeScript native) or Jest. Document decision. | P0 | 0.5 day | None | Low | QA Lead | 1. Framework selected. 2. `package.json` devDependency added. 3. Sample test passes. | Cannot proceed without framework. |
| **CI Test Integration** | `.github/workflows/ci.yml` — Only lint, typecheck, build. No test job. | Add test job. Fail build if tests fail. | P0 | 0.5 day | Test runner | Critical — CI has no safety net | DevOps | 1. CI runs `npm test`. 2. Test failure → build failure. 3. Test results reported. | Cannot deploy from CI without test gate. |

### 6.2 Test Categories

| Category | Current State | Target State (Phase 40) | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|----------|---------------|-------------------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Unit Tests** | 47 wallet tests exist (address validation, idempotency, fee calculation, UTXO selection, failure recovery). Not executable. | Make executable. Ensure > 80% pass rate. | P0 | 1 day | Test runner | High | QA Lead | 1. All wallet unit tests execute. 2. >= 80% pass (or documented skips). 3. Coverage report generated. | Cannot ship without unit test baseline. |
| **Integration Tests** | None found. | Add minimal integration test for critical path: order placement → hold → match → trade. Use test DB. | P1 | 2 days | Test runner, test DB | Medium | QA Lead | 1. One end-to-end order flow test passes. 2. Test DB setup documented. | Not blocking for Phase 40 if unit tests exist. |
| **Security Tests** | None found. | Add negative tests for SB-001 to SB-006. E.g., CSRF attack simulation, replay attack simulation. | P0 | 1-2 days | Test runner | High | Security Engineer | 1. CSRF negative test passes (attack blocked). 2. Replay negative test passes. 3. Mock KYC negative test passes. | Cannot ship without security negative tests for P0 blockers. |
| **Performance Tests** | None found. | Capture baseline: bundle size, API latency (p50/p95), DB query time, WS message latency. Do not optimize yet. | P2 | 1 day | None | Low | SRE | 1. Baseline metrics captured. 2. Documented in `PERFORMANCE_BASELINE.md`. 3. Reproducible measurement script. | Not blocking for Phase 40. |
| **Wallet Tests** | 47 tests exist but unrun. | Execute, fix, document. | P0 | 1 day | Test runner | High | Wallet Engineer | 1. All wallet tests pass or documented. 2. Failures triaged (bug vs. test gap). | Cannot ship untested wallet code. |
| **Trading Tests** | Not found. | Add basic validation tests for order types (limit, market, IOC, FOK). Stop-limit rejection test. | P1 | 1 day | Test runner | Medium | Trading Engineer | 1. Order validation tests pass. 2. Stop-limit rejection test passes. | Cannot ship without trading validation tests. |
| **AI Tests** | Not found. | Add test for AI Mentor prompt injection resistance (basic). Cost guard test. | P2 | 1 day | Test runner, OpenAI key (mock) | Low | AI Engineer | 1. Basic AI safety test exists. 2. Cost guard test passes. | Not blocking for Phase 40. |
| **Academy Tests** | Not found. | Add test for certificate issuance and verification. | P2 | 1 day | Test runner | Low | Academy Engineer | 1. Certificate flow test passes. | Not blocking. |

**Testing Strategy Total Estimated Effort:** 8-10 days (parallelizable)

---

## 7. Performance

### 7.1 Baseline Capture (Phase 40 Goal: Measure, Not Optimize)

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Bundle Size Analysis** | Not measured. 3 chart libraries (TradingView, Chart.js, Recharts). See TD-M01. | Run `npm run build` with bundle analyzer. Record total size, largest chunks. | P2 | 0.5 day | None | Low | Frontend Engineer | 1. Bundle size baseline captured. 2. Largest dependencies identified. 3. Documented. | Not blocking for Phase 40. |
| **Core Web Vitals** | Not measured. | Use Lighthouse or Web Vitals extension on key pages (landing, markets, academy term). Record LCP, FID, CLS. | P2 | 0.5 day | None | Low | Frontend Engineer | 1. CWV baseline captured for 3 key pages. 2. Documented. | Not blocking. |
| **API Latency Baseline** | Not measured. | Instrument key endpoints: `/api/orders`, `/api/markets`, `/api/health`, `/api/ai-mentor`. Record p50/p95/p99 over 100 requests. | P2 | 1 day | None | Low | SRE | 1. Latency baseline captured. 2. Documented with methodology. | Not blocking. |
| **DB Query Time Baseline** | Not measured. | Identify 5 slowest queries via `EXPLAIN ANALYZE` or app logging. Record. | P2 | 1 day | DB access | Low | Backend Engineer | 1. 5 slowest queries identified. 2. Times recorded. | Not blocking. |
| **WebSocket Message Latency** | Not measured. | Measure time from trade execution → WS broadcast → client receipt (synthetic). | P2 | 0.5 day | WS client | Low | SRE | 1. WS latency baseline captured. | Not blocking. |
| **Memory / CPU Profiling** | Not measured. | Run production-like load for 10 minutes. Record heap usage, CPU. | P2 | 1 day | Load test tool | Low | SRE | 1. Resource baseline captured. | Not blocking. |

**Performance Total Estimated Effort:** 4-5 days (parallelizable, not blocking)

---

## 8. Deployment Strategy

### 8.1 Production Deployment Path

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Primary Deployment Method** | `DEPLOY_UBUNTU_24_PRODUCTION.md` — PM2 on Ubuntu 24.04. Docker Compose as option. | Confirm PM2 is primary path. Document Docker as alternative. | P1 | 0.5 day | None | Low | SRE | 1. Primary path documented and tested. 2. Alternative documented. | Cannot have ambiguous deployment path. |
| **Zero-Downtime Deployment** | PM2 `autorestart: true` but no zero-downtime strategy (e.g., blue-green, rolling). | Document: for single-instance, deployment requires brief downtime. Plan for multi-instance zero-downtime in Phase 45+. | P2 | 0.5 day | None | Low | SRE | 1. Downtime expectation documented. 2. Multi-instance path deferred. | Not blocking. |
| **Database Backup Before Deploy** | Not automated. | Script: `pg_dump` before deploy, store with timestamp. | P1 | 1 day | Backup strategy | High — no pre-deploy backup | SRE | 1. Pre-deploy backup script exists. 2. Runs as part of deploy checklist. | Cannot deploy without pre-deploy backup. |

### 8.2 Rollback

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Rollback Procedure** | Per-task in docs (e.g., SECURITY_BLOCKERS.md has "Rollback: Revert commit"). No system-wide rollback plan. | Document: (1) Git revert + redeploy, (2) DB migration rollback (if any), (3) Feature flag disable (future), (4) DNS cutover to previous version (if blue-green). | P1 | 1 day | None | Critical — no rollback path | SRE | 1. Rollback runbook exists. 2. Tested on staging (revert + redeploy succeeds). 3. RTO documented (< 15 min target). | Cannot launch without rollback plan. |
| **Database Migration Rollback** | No migration runner. Schema changes are manual `CREATE TABLE IF NOT EXISTS`. | Document: schema changes in Phase 40 must be additive only (no ALTER TABLE DROP). Rollback = do nothing or manual revert. | P1 | 0.5 day | None | High — irreversible schema change | Backend Engineer | 1. All Phase 40 schema changes are additive. 2. Rollback plan for each documented. | Cannot make breaking schema changes without rollback. |

### 8.3 Disaster Recovery

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **DR Plan** | Not documented. | Document: (1) Server loss → restore from backup to new server, (2) DB loss → restore from pg_dump, (3) Secret loss → rotation procedure, (4) RTO/RPO targets. | P1 | 1 day | Backup strategy | Critical — no DR plan | SRE | 1. DR runbook exists. 2. RTO < 4 hours, RPO < 24 hours (target). 3. Tested on staging (restore from backup). | Cannot launch without DR plan. |
| **Backup Verification** | "Back up daily" in docs. No verification. | Automated: weekly restore test on staging. Alert if restore fails. | P2 | 1 day | Backup | High — untested backups may be corrupt | SRE | 1. Weekly restore test scheduled. 2. Alert on failure. | Not blocking for Phase 40 if manual restore tested. |

---

## 9. Monitoring

### 9.1 Logging

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Structured Logging** | `src/lib/logger.ts` exists (imported in many places). Not reviewed in detail. | Verify: all critical paths log with context (userId, requestId, error). No PII in logs. | P1 | 1 day | None | Medium — untraceable errors | SRE | 1. Logger used in all API routes, workers, critical services. 2. Sample log inspected: has requestId, userId (if auth), error. 3. No secrets/PII in logs. | Cannot launch without structured logs. |
| **Log Aggregation** | Not configured. PM2 logs to stdout/stderr. | Document: for Phase 40, logs go to systemd journal or PM2 log files. Aggregation (ELK, Datadog) is Phase 45+. | P2 | 0.5 day | None | Low | SRE | 1. Log location documented. 2. Rotation configured. | Not blocking. |

### 9.2 Metrics

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Application Metrics** | Wallet observability exists: `src/lib/wallet/observability.ts` tracks `withdraw_build_ms`, `withdraw_sign_ms`, etc. | Audit: are metrics exposed? (Prometheus? Custom endpoint?) | P2 | 1 day | None | Low | SRE | 1. Wallet metrics documented. 2. If exposed, endpoint documented. 3. If not exposed, plan for Phase 45. | Not blocking. |
| **Infrastructure Metrics** | Not configured. | Document: for Phase 40, use host-level monitoring (Prometheus node exporter, or cloud provider metrics). Application metrics deferred. | P2 | 0.5 day | None | Low | SRE | 1. Infra metrics source documented. | Not blocking. |

### 9.3 Alerts

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Alerting Foundation** | `src/lib/alerts.ts` exists (imported in price-feed endpoint). Not reviewed in detail. | Verify: critical alerts wired (PRICE_FEED_DOWN, wallet low balance, withdrawal DLQ, etc.). | P1 | 1 day | None | High — silent failures | SRE | 1. Critical alerts defined. 2. Delivery channel configured (email, Slack, Telegram). 3. Test: trigger alert, confirm received. | Cannot launch without critical alerts. |
| **Wallet Alerts** | `src/lib/wallet/observability.ts` tracks `wallet_low_balance`, `tx_dropped_detected`. | Ensure these emit alerts via `emitAlert()`. | P1 | 0.5 day | Alerts module | High — silent fund loss | Wallet Engineer | 1. Low balance triggers alert. 2. Dropped tx triggers alert. | Cannot launch without wallet fund alerts. |

### 9.4 Health Checks

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Health Endpoint** | `src/app/api/health/` exists. `scripts/check-health.mjs` calls it. | Audit: does it check DB? Redis? External deps? Expand if shallow. | P1 | 0.5 day | None | High — false positive health | SRE | 1. Health endpoint checks DB connectivity. 2. Checks Redis (if configured). 3. Returns 503 if critical dep down. 4. Test: DB down → 503. | Cannot launch with shallow health check. |
| **Deep Health** | Not found. | Document: deep health (full dependency check) is Phase 41 work. | P2 (Phase 41) | N/A | None | Low | N/A | N/A — deferred | Not blocking. |

### 9.5 Dashboards

| Task | Current State | Target State | Priority | Effort | Dependencies | Risk | Owner | Acceptance Criteria | Blocking Conditions |
|------|---------------|--------------|----------|--------|--------------|------|-------|---------------------|---------------------|
| **Dashboard Foundation** | Not configured. | Document: for Phase 40, no centralized dashboard. Monitoring via logs + alerts. Dashboard (Grafana, etc.) is Phase 45+. | P3 | 0.5 day | None | Low | SRE | 1. Dashboard deferred documented. | Not blocking. |

---

## 10. Launch Validation

### 10.1 Soft Launch Go/No-Go Gate

**Soft Launch Definition:** Limited user access (e.g., 100 beta users, or invite-only). Real money trading enabled for small cohort. Monitoring for 2 weeks before public launch.

**Soft Launch Gate — ALL Must Pass:**

| # | Criterion | Source | Status (Current) | Owner | Blocking? |
|---|-----------|--------|------------------|-------|-----------|
| 1 | All P0 security blockers closed (SB-001 to SB-006) | SECURITY_BLOCKERS.md | ❌ 6 open | Security Engineer | YES |
| 2 | Test runner exists and CI runs tests | TD-C06, LAUNCH_READINESS_REPORT | ❌ No test runner | QA Lead | YES |
| 3 | Wallet P1 bugs fixed (BTC public key, multi-input, nonce, Tron decision) | TD-H08, TD-H09, WALLET_PHASE39_READINESS_REPORT | ❌ Open | Wallet Engineer | YES |
| 4 | Stop-limit orders rejected (not silently accepted) | TD-H06 | ❌ Accepted but not implemented | Trading Engineer | YES |
| 5 | Custom server on all production paths (npm, Docker, PM2, systemd) | LAUNCH_READINESS_REPORT | ✅ Aligned | SRE | NO (already met) |
| 6 | Production env validation passes (no placeholders, secrets strong) | validate-env.mjs | ⚠️ Needs expansion | SRE | YES |
| 7 | HSM/MPC gated (cannot be selected in production without explicit flag) | SB-005, keystore.ts | ❌ Throws if selected | Wallet Engineer | YES |
| 8 | KYC mock blocked in production | SB-004, sumsub.ts | ❌ Mock possible | Security Engineer | YES |
| 9 | API key replay protection enforced in production | SB-003, api-key-auth.ts | ❌ Disabled without Redis | Security Engineer | YES |
| 10 | Admin auth uses httpOnly signed cookie, no raw token or sessionStorage | SB-002, SB-011, admin-auth.ts | ❌ Raw token + sessionStorage | Security Engineer | YES |
| 11 | CSRF on all state-changing routes | SB-001 | ❌ Inconsistent | Security Engineer | YES |
| 12 | Internal price-feed endpoint authenticated | SB-006 | ❌ Public | Security Engineer | YES |
| 13 | Graceful shutdown wired for all resources | server.ts (partial) | ⚠️ Partial | SRE | YES |
| 14 | Backup strategy implemented and tested | DEPLOY docs | ❌ Not implemented | SRE | YES |
| 15 | Rollback procedure documented and tested | This plan | ❌ Not documented | SRE | YES |
| 16 | Critical alerts wired (wallet low balance, DLQ, price feed down) | alerts.ts, observability.ts | ⚠️ Partial | SRE | YES |
| 17 | Health endpoint checks DB and Redis | api/health | ⚠️ Basic | SRE | YES |
| 18 | Production deployment tested end-to-end on staging | DEPLOY docs | ⚠️ Partial | SRE | YES |

**Soft Launch Gate Pass Rate (Current):** 1/18 (6%)

---

### 10.2 Public Launch Go/No-Go Gate

**Public Launch Definition:** Open to all users. Full marketing push. No invite-only restrictions.

**Public Launch Gate — ALL Must Pass (in addition to Soft Launch gate):**

| # | Criterion | Source | Status (Current) | Owner | Blocking? |
|---|-----------|--------|------------------|-------|-----------|
| 1 | Soft Launch completed successfully (2 weeks, no P0 incidents) | This plan | ❌ Not started | Product | YES |
| 2 | Performance baseline captured and acceptable (no obvious bottlenecks) | This plan | ❌ Not measured | SRE | YES |
| 3 | English parity acceptable (lang/dir hydration fixed, or documented) | SB-012, TD-M06 | ⚠️ Mismatch before hydration | Frontend | NO (can ship with known gap) |
| 4 | Contact forms functional (not mailto only) | SB-013, TD-M04 | ❌ mailto only | Frontend | NO (can defer to 45) |
| 5 | Operations runbook exists (incident response, on-call, escalation) | LAUNCH_READINESS_REPORT | ❌ Not documented | SRE | YES |
| 6 | Support team trained on wallet/trading support workflows | This plan | ❌ Not started | Support | YES |
| 7 | Compliance sign-off (KYC/AML process reviewed, mock blocked) | SB-004, TD-H01 | ❌ Mock possible | Compliance | YES |
| 8 | Legal sign-off (terms, risk disclosure, jurisdiction) | Not in scope of this review | ❓ Unknown | Legal | YES |
| 9 | Marketing launch checklist complete (landing page, emails, social) | Not in scope | ❓ Unknown | Marketing | NO (can soft launch without) |

**Public Launch Gate Pass Rate (Current):** 0/9 (0%)

---

## Production Hardening Roadmap

### Phase 39.6 — Security Hardening Sprint (5-7 days)

**Mission:** Close all P0 security blockers + stop-limit rejection + local auth block.

**Deliverables:**
- SB-001 to SB-006 fixed and verified
- TD-H06 (stop-limit rejection) fixed
- SB-008 (local auth block) fixed
- Test runner added (TD-C06) — start here, enables all other testing
- CI runs tests

**Critical Path:** Test runner (1 day) → CSRF (1-2 days) → Admin auth (1 day) → API key replay (1 day) → KYC mock (0.5 day) → HSM/MPC gating (1 day) → Price feed auth (0.5 day) → Stop-limit rejection (0.5 day)

**Parallel Work:** Local auth block (0.5 day), CSP tightening (0.5 day)

---

### Phase 40 — Production Hardening (10-15 days)

**Mission:** Complete wallet hardening, trading validation, runtime hardening, testing baseline, monitoring foundation, launch gates.

**Track A — Security & Auth (parallel with Track B):**
- SB-007, SB-009, SB-010, SB-011 (3 days)
- JWT secret unification (1 day)
- CSRF coverage final audit (0.5 day)

**Track B — Wallet (parallel with Track A):**
- BTC public key bug (1 day)
- BTC multi-input signing (1 day)
- ETH nonce race (1-2 days)
- Tron decision/fix (2 days or disable)
- HSM/MPC/Multisig gating + contracts (3-4 days)
- Policy cache + engine (2 days)

**Track C — Trading (parallel with A/B):**
- Stop-limit rejection (already in 39.6)
- Order book warm-start verification (0.5 day)
- Redis order book decision (defer or implement, 2 days)
- Validation tests (1 day)

**Track D — Runtime & Deployment (parallel with A/B/C):**
- Graceful shutdown audit (1 day)
- PM2 startup test (0.5 day)
- PostgreSQL backup + restore test (1 day)
- Redis persistence (0.5 day)
- Nginx CSP + SSL (0.5 day)
- Env validation expansion (1 day)
- Secret rotation runbook (1 day)
- Rollback procedure (1 day)
- DR plan (1 day)

**Track E — Testing (parallel with all):**
- Test runner (39.6)
- Wallet tests execution + triage (1 day)
- Security negative tests (1-2 days)
- Trading validation tests (1 day)
- CI integration (0.5 day)
- Academy/AI minimal tests (1 day)

**Track F — Monitoring & Observability (parallel with all):**
- Structured logging audit (1 day)
- Critical alerts wiring (1 day)
- Health endpoint expansion (0.5 day)
- Wallet alert integration (0.5 day)

**Track G — Performance & Launch Prep (end of phase):**
- Baseline capture (4-5 days, can start early)
- Soft Launch gate verification (2 days)
- Documentation of gaps (ongoing)

**Total Estimated Effort:** 10-15 days with 4-6 engineers working in parallel tracks.

---

## Execution Order (Dependencies)

**Must be sequential (cannot parallelize):**

1. Test runner (TD-C06) → enables all testing
2. P0 security blockers (SB-001 to SB-006) → unblock any launch
3. Wallet P1 bugs (TD-H08, TD-H09, ETH nonce) → unblock real withdrawals
4. HSM/MPC gating (SB-005) → unblock production wallet config
5. Graceful shutdown → unblock production deployment
6. Backup + restore test → unblock production deployment
7. Rollback procedure → unblock production deployment
8. Soft Launch gate verification → unblock Soft Launch

**Can be parallel (independent):**

- Most runtime hardening tasks (Nginx, PM2, env validation, secrets)
- Most monitoring tasks (logging, alerts, health)
- Performance baseline capture (can start early)
- Testing (after runner)
- Trading validation tests (after runner)
- Admin auth hardening (after SB-002)
- API key replay (after SB-003)

---

## Critical Path

**Shortest path to Soft Launch (minimum 13-15 days):**

```
Day 1-2:   Test runner + CI integration (TD-C06)
Day 2-4:   SB-001 (CSRF) + SB-002 (Admin auth) — parallel
Day 4-5:   SB-003 (API key replay) + SB-004 (KYC mock) — parallel
Day 5-6:   SB-005 (HSM/MPC gating) + SB-006 (Price feed) — parallel
Day 6-7:   TD-H06 (Stop-limit rejection) + SB-008 (Local auth) — parallel
Day 7-8:   Wallet P1 bugs (BTC public key, multi-input, ETH nonce)
Day 8-9:   Graceful shutdown + Backup/restore test
Day 9-10:  Rollback procedure + DR plan
Day 10-11: Critical alerts + Health endpoint
Day 11-13: Soft Launch gate verification + staging deployment test
Day 13-15: Soft Launch (if gate passes)
```

**If any P0 blocker takes longer than estimated, entire path slips.**

---

## Parallel Work Opportunities

**Can run in parallel from Day 1 (no dependencies):**

- Runtime hardening (PM2, Docker, Nginx, env validation, secrets) — SRE
- PostgreSQL backup strategy (independent of app code) — SRE
- Performance baseline capture (can start immediately) — Frontend + SRE
- DR plan drafting (no code changes) — SRE
- Rollback procedure drafting (no code changes) — SRE

**Can run in parallel after test runner (Day 2+):**

- All test writing (wallet, security, trading, academy, AI)
- CI test integration

**Can run in parallel after P0 security (Day 7+):**

- P1 security (SB-007, SB-009, SB-010, SB-011)
- JWT secret unification
- Wallet P1 bugs
- Trading validation tests
- Monitoring wiring

---

## Launch Risk Matrix

| Risk | Likelihood | Impact | Mitigation | Owner |
|------|------------|--------|------------|-------|
| **P0 security blocker takes > 2 days to fix** | Medium | High (delays launch) | Parallelize CSRF + admin auth. Escalate if blocked. | Security Engineer |
| **Wallet BTC bug more complex than expected** | Medium | High (cannot execute BTC withdrawals) | Disable BTC withdrawals for Soft Launch if unfixable. | Wallet Engineer |
| **Test runner integration reveals 47 failing tests** | High | Medium (triage time) | Triage Day 1-2. Accept some skips for Phase 40. | QA Lead |
| **HSM/MPC scaffolding accidentally committed without gating** | Low | Critical (signing failure) | Code review gate. Factory audit before merge. | Wallet Engineer |
| **Production deployment fails (PM2, Nginx, SSL)** | Medium | High (launch blocked) | Full staging rehearsal before launch day. | SRE |
| **Backup/restore untested, fails in incident** | Medium | Critical (data loss) | Test restore on staging before Soft Launch. | SRE |
| **No rollback, incident requires revert** | Medium | High (extended downtime) | Document and test rollback before Soft Launch. | SRE |
| **Performance baseline reveals major bottleneck** | Low | Medium (user experience) | Capture baseline early. Optimize post-launch if needed. | SRE |
| **Compliance rejects mock KYC behavior** | Low | Critical (regulatory) | Block mock in production before any user KYC. | Compliance |
| **Secrets leaked in git history** | Low | Critical (compromise) | Audit git history before launch. Rotate all secrets. | SRE |

---

## Go / No-Go Gates

### Gate 1: Phase 39.6 Complete

**Decision Point:** End of Phase 39.6

**Criteria:**
- All P0 security blockers (SB-001 to SB-006) closed and verified
- Stop-limit orders rejected
- Local auth blocked in production
- Test runner exists and CI runs tests
- 47 wallet tests executable (not necessarily 100% passing)

**Decision Maker:** Security Lead + QA Lead + CTO

**If NO-GO:** Extend Phase 39.6. Do not proceed to Phase 40.

---

### Gate 2: Phase 40 Mid-Point Review

**Decision Point:** Day 7-8 of Phase 40

**Criteria:**
- Wallet P1 bugs (BTC, ETH) fixed or explicitly disabled
- HSM/MPC gated
- Graceful shutdown verified
- Backup/restore tested on staging
- Rollback procedure tested on staging
- > 50% of planned tests written and passing

**Decision Maker:** CTO + Security Lead + SRE Lead

**If NO-GO:** Re-scope Phase 40. Consider delaying Soft Launch.

---

### Gate 3: Soft Launch Go/No-Go

**Decision Point:** End of Phase 40

**Criteria:** See Section 10.1 "Soft Launch Go/No-Go Gate" — ALL 18 criteria must pass.

**Decision Maker:** CTO + Security Lead + SRE Lead + Product Lead + Compliance Lead

**If GO:** Soft Launch (2 weeks, limited users)

**If NO-GO:** Phase 41 (Infrastructure) or extended Phase 40. Re-evaluate.

---

### Gate 4: Public Launch Go/No-Go

**Decision Point:** 2 weeks after Soft Launch start

**Criteria:** See Section 10.2 "Public Launch Go/No-Go Gate" — ALL criteria must pass.

**Decision Maker:** Executive Team (CEO, CTO, CPO, Legal, Compliance)

**If GO:** Public Launch

**If NO-GO:** Extend Soft Launch or pause. Address gaps.

---

## Definition of Done for Phase 40

**Phase 40 is COMPLETE when:**

1. **All P0 security blockers closed** (SB-001 to SB-006) with QA evidence and negative tests.
2. **All P1 security blockers closed or explicitly deferred** (SB-007 to SB-011) with documented rationale.
3. **Wallet P1 bugs fixed** (BTC public key, multi-input, ETH nonce) or explicitly disabled with user-facing messaging.
4. **HSM/MPC/Multisig gated** — factory never selects incomplete providers in production.
5. **Stop-limit orders rejected** — clear error, no silent misbehavior.
6. **Test runner exists** — `npm test` works. CI runs tests on every push.
7. **Wallet tests executable** — 47 tests run. >= 80% pass or documented skips.
8. **Security negative tests exist** — CSRF, replay, mock KYC, admin token theft all blocked.
9. **Graceful shutdown verified** — all resources closed on SIGTERM. Test passes.
10. **Backup/restore tested** — pg_dump + restore on staging succeeds. RTO/RPO documented.
11. **Rollback procedure tested** — git revert + redeploy on staging succeeds. RTO < 15 min.
12. **DR plan exists** — server loss, DB loss, secret loss scenarios documented.
13. **Critical alerts wired** — wallet low balance, withdrawal DLQ, price feed down, health check failures all alert.
14. **Health endpoint expanded** — checks DB and Redis. Returns 503 on critical dep failure.
15. **Env validation expanded** — all critical secrets validated at startup. Invalid config blocks start.
16. **Production deployment rehearsed** — full end-to-end deploy on staging. Matches production path.
17. **Soft Launch gate verified** — all 18 criteria in Section 10.1 pass.
18. **Performance baseline captured** — bundle size, CWV, API latency, DB queries, WS latency documented.
19. **No P0 incidents in staging** — 48-hour staging soak with simulated load and failure injection.
20. **Phase 40 retrospective held** — lessons learned documented. Phase 41 scope adjusted if needed.

**Phase 40 is NOT complete if any of the above are missing or unverified.**

---

## Appendices

### A. Document References

- `SECURITY_BLOCKERS.md` — P0/P1/P2 security issues
- `TECHNICAL_DEBT_REGISTRY.md` — Critical/High/Medium/Low debt
- `LAUNCH_READINESS_REPORT.md` — Phase 39.5 launch assessment
- `MASTER_BLUEPRINT_v3.md` — Target architecture
- `MASTER_ROADMAP_v3.md` — Phase progression
- `WALLET_ENGINE.md` — Wallet balance/hold model
- `HOT_WALLET.md` — Hot wallet disbursement engine
- `TRADING_CORE.md` — Trading domain model
- `DEPLOY_UBUNTU_24_PRODUCTION.md` — Production deployment guide
- `WALLET_PHASE39_READINESS_REPORT.md` — Phase 39 wallet scaffolding audit
- `TECPEY_PROJECT_INDEX.md` — Documentation registry

### B. File References (Current Implementation)

**Security:**
- `src/lib/admin-auth.ts` — Admin token handling
- `src/lib/security/api-key-auth.ts` — API key signing + replay
- `src/lib/rate-limit.ts` — Rate limiting (memory fallback)
- `src/lib/compliance/sumsub.ts` — KYC adapter (mock fallback)
- `src/app/api/internal/price-feed-status/route.ts` — Internal alert endpoint
- `deploy/nginx/tecpey.conf` — CSP, rate limits

**Wallet:**
- `src/lib/wallet/signing/keystore.ts` — Hot/HSM/MPC key stores
- `src/lib/wallet/providers/bitcoin.ts` — BTC provider (multi-input bug)
- `src/lib/wallet/providers/ethereum.ts` — ETH provider (nonce race)
- `src/lib/wallet/withdrawal-executor.ts` — Public key bug
- `src/lib/wallet/queue/` — BullMQ withdrawal queues
- `src/lib/wallet/confirmation/engine.ts` — Confirmation polling
- `src/workers/withdrawal-worker.ts` — Worker bootstrap

**Trading:**
- `src/lib/trading/validation.ts` — Order validation (stop-limit gap)
- `src/lib/trading/order-book.ts` — In-memory order book
- `src/lib/trading/matching-engine.ts` — Matching interface
- `src/lib/trading/order-book-store.ts` — Redis store stub

**Runtime:**
- `server.ts` — Custom server (WS, Redis, workers)
- `ecosystem.config.cjs` — PM2 config
- `docker-compose.production.yml` — Docker Compose
- `scripts/validate-env.mjs` — Env validation
- `scripts/check-health.mjs` — Health check
- `package.json` — No test script

### C. Phase 39.5 Governance Documents (Locked)

All governance documents are COMPLETE and LOCKED. Do not modify:
- `TECPEY_PROJECT_INDEX.md`
- `MASTER_BLUEPRINT_v3.md`
- `MASTER_ROADMAP_v3.md`
- `FEATURE_REGISTRY.md`
- `FUTURE_REGISTRY.md`
- `IP_REGISTRY.md`
- `AI_PLATFORM.md`
- `WHITE_LABEL_PLATFORM.md`
- `MARKETPLACE_PLATFORM.md`
- `REVENUE_MODEL.md`

---

**END OF PRODUCTION HARDENING MASTER PLAN**

**Status:** AWAITING APPROVAL

**Next Step:** Executive review. If approved, Phase 39.6 begins. No code changes until this plan is signed off.

*This document is the definitive implementation plan for Phase 40. All tasks, priorities, estimates, and dependencies are derived from current repository state as of 2026-07-05.*