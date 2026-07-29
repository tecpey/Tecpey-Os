# Changelog

All notable changes to TecPey are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow semantic milestones (Phase-based).

---

## [v0.38] — 2026-07-01 — Enterprise Hot Wallet and Disbursement Engine

### Added — Migration 0011 (`src/lib/db-migrate.ts`)
- Execution columns on `withdrawals`: `tx_hash UNIQUE`, `chain_id`, `nonce`, `broadcast_attempts`, `confirmation_count`, `block_number`, `execution_error`, `network_fee`, `fee_currency`, `raw_tx`, `idempotency_key UNIQUE`

### Added — Wallet Types (`src/lib/wallet/types.ts`)
- Complete type system: `ChainId`, `FeeSpeed`, `WithdrawalExecutionState` (12 states), `UTXO`, `BuildTransactionInput`, `BuiltTransaction`, `SignedTransaction`, `KeyStore` interface, `WalletProvider` interface, queue job types, `WalletMetricKey`

### Added — Address Validator (`src/lib/wallet/address/validator.ts`)
- Bitcoin: Bech32 (P2WPKH bc1q/P2WSH), Base58Check (P2PKH/P2SH)
- Ethereum/BSC/Polygon: EIP-55 checksum via keccak256 (@noble/hashes)
- Tron: Base58Check with 0x41 prefix
- Solana: Base58 Ed25519 32-byte public key

### Added — RPC Client (`src/lib/wallet/rpc/client.ts`)
- HTTP JSON-RPC with failover across multiple endpoints
- Circuit breaker: 3 failures → 30s cooldown → automatic recovery
- Exponential retry (3 attempts, 500ms base delay)
- Configurable 10s timeout per request

### Added — Fee Engine (`src/lib/wallet/fee/engine.ts`)
- Bitcoin: `estimatesmartfee` RPC → sats/vByte with speed multipliers
- Ethereum: `eth_feeHistory` → EIP-1559 baseFee×2 + priorityFee
- Solana: `getRecentPrioritizationFees` → microLamports/CU
- Tron: static 1 TRX worst-case
- TTL cache: 10–60s depending on speed tier

### Added — Signing Layer (`src/lib/wallet/signing/keystore.ts`)
- `HotWalletKeyStore`: env-var keys, secp256k1 + Ed25519, zero-after-use
- `HsmKeyStore`: interface stub (Phase 39)
- `MpcKeyStore`: interface stub (Phase 40)
- `SimulatedKeyStore`: deterministic test signing
- `createKeyStore()` factory: auto-selects based on env

### Added — Chain Providers (`src/lib/wallet/providers/`)
- `BitcoinProvider`: UTXO selection (largest-first, 546-sat dust threshold), BIP143 sighash, SegWit P2WPKH serialization, compact→DER signature conversion
- `EthereumProvider`: RLP encoding, EIP-1559 type-2 tx, ERC-20 ABI, Redis nonce cache
- `BscProvider`, `PolygonProvider`, `TronProvider`: extend EthereumProvider
- `SolanaProvider`: System Program message serialization, Ed25519 signing
- `registry.ts`: singleton provider registry

### Added — BullMQ Queue (`src/lib/wallet/queue/`)
- 5 queues: `withdrawal`, `withdrawal:retry`, `withdrawal:dlq`, `withdrawal:confirmation`, `withdrawal:recovery`
- `enqueueWithdrawal()` with jobId deduplication (`withdrawal:{id}`)
- `enqueueConfirmationWatch()` with 15s initial delay
- `getQueueHealth()` for admin monitoring

### Added — Queue Processor (`src/lib/wallet/queue/processor.ts`)
- `createWithdrawalWorker()`: BullMQ worker, DLQ on final failure
- `createConfirmationWorker()`: 50-attempt poll, suppresses expected retry noise
- `createRecoveryWorker()`: crash recovery re-execution

### Added — Confirmation Engine (`src/lib/wallet/confirmation/engine.ts`)
- Chain-specific timeouts: BTC 1h, ETH 15m, Polygon 20m, SOL 5m
- State transitions: `confirming` → `completed` / `failed` / `timeout`
- Dropped transaction detection

### Added — Withdrawal Executor (`src/lib/wallet/withdrawal-executor.ts`)
- Orchestrates build → sign → broadcast → confirm pipeline
- Idempotency: skips if `tx_hash` already set
- State machine: approved → building_transaction → signing → broadcasting → broadcasted → confirming
- 3-attempt broadcast with increasing delays

### Added — Observability (`src/lib/wallet/observability.ts`)
- 9 Redis INCR metrics: build/sign/broadcast latency, rpc_failures, rebroadcast_count, wallet_low_balance, idempotency_duplicate_blocked, tx_dropped_detected

### Added — Worker (`src/workers/withdrawal-worker.ts`)
- `startWithdrawalWorkers()` / `stopWithdrawalWorkers()` lifecycle
- Concurrency via `WITHDRAWAL_WORKER_CONCURRENCY` env (default 5)

### Modified — server.ts
- Start withdrawal workers on boot (when REDIS_URL configured)
- Graceful shutdown: stop workers before Redis disconnect

### Added — Tests (`src/tests/wallet/`)
- 47 tests across 5 files: address-validation, utxo-selection, fee-calculation, idempotency, failure-recovery

### Added — Docs
- `docs/HOT_WALLET.md`: full architecture, component reference, security model, configuration

---

## [v0.37] — 2026-07-01 — Withdrawal Security Enforcement and Compliance Runtime

### Added — Migration 0010 (`src/lib/db-migrate.ts`)

- `withdrawals` — full withdrawal request model: state machine, security metadata, compliance results (JSONB), admin review fields, velocity tracking
- `withdrawal_admin_actions` — immutable log of every admin decision; references `withdrawals(id)`
- `security_notifications` — persistent security event log: withdrawal events, new device, suspicious activity

### Added — Withdrawal Service (`src/lib/security/withdrawal-service.ts`)

- `createWithdrawalRequest(opts)` — full lifecycle: risk block → security gate → DB insert → async compliance → state decision
- `runComplianceChecks()` — KYC + AML + Sanctions via `getComplianceProviders()` interface; 5-second timeout per check; graceful degrade
- State decision: `sanctionsHit` or `aml=high/blocked` → `blocked`; `aml=medium` or `kyc=pending` → `compliance_review`; else → `approved`
- `listUserWithdrawals(userId)` / `fetchWithdrawal(id, userId?)` — user and admin queries
- `adminActOnWithdrawal(opts)` — approve/reject/block/flag_review with immutable action log
- `listPendingReviewWithdrawals()` — admin review queue (state: pending | compliance_review)
- `cancelWithdrawal(id, userId)` — user-initiated cancel for pending/review withdrawals

### Added — Security Notifications (`src/lib/security/security-notifications.ts`)

- `emitSecurityNotification(n)` — fire-and-forget write to `security_notifications` table
- `notifyWithdrawalRequested()` / `notifyWithdrawalBlocked()` / `notifyWithdrawalApproved()` / `notifyWithdrawalRejected()` / `notifyRiskyWithdrawal()` / `notifyNewDevice()` — pre-built factories
- 11 notification types defined; no external email dependency

### Added — Withdrawal Routes

- `POST /api/auth/withdraw` — create request; validates asset/network/amount; calls security gate; returns 201 on success
- `GET /api/auth/withdraw` — list user's withdrawals (paginated)
- `GET /api/auth/withdraw/[id]` — fetch own withdrawal detail
- `DELETE /api/auth/withdraw/[id]` — cancel pending/review withdrawal
- `GET /api/admin/withdrawals` — admin review queue
- `GET /api/admin/withdrawals/[id]` — full withdrawal view (compliance JSONB included)
- `POST /api/admin/withdrawals/[id]` — admin action: approve/reject/block/flag_review; triggers user notification

### Changed — Auth Metrics (`src/lib/security/auth-metrics.ts`)

- Added 9 withdrawal/compliance metric keys: `withdrawal_requested`, `withdrawal_approved`, `withdrawal_rejected`, `withdrawal_blocked`, `withdrawal_compliance_review`, `withdrawal_risk_blocked`, `withdrawal_cancelled`, `compliance_kyc_checked`, `compliance_aml_checked`, `compliance_sanctions_checked`
- Refactored `ALL_KEYS` constant to share across `getAuthMetrics()` and `resetAuthMetrics()`

### Documentation

- `docs/WITHDRAW_SECURITY.md` — complete rewrite: state machine, enforcement layers, compliance table, API reference, DB schema
- `docs/COMPLIANCE.md` — added compliance runtime section: execution sequence, timeout behavior
- `docs/SECURITY.md` — title updated to Phase 37
- `docs/API.md` — added withdrawal + admin withdrawal endpoint docs
- `CHANGELOG.md` — v0.37 entry added

### Quality Gate

- Zero TypeScript errors
- Zero ESLint warnings
- Clean production build (292 static pages)

---

## [v0.36] — 2026-07-01 — Enterprise Identity Security and WebAuthn Integration

### Added — WebAuthn / Passkeys (`src/lib/security/webauthn.ts`)

- Native FIDO2 implementation — zero new dependencies; all crypto via Node.js built-ins
- ES256 (P-256 ECDSA) support with custom CBOR decoder and P-256 SPKI DER construction
- `verifyWebAuthnRegistration()` — full attestation verification: clientDataJSON, rpIdHash, UP flag, COSE key parse
- `verifyWebAuthnAuthentication()` — assertion verification: signature, counter monotonicity, UV flag
- `generateChallenge()` / `storeWebAuthnChallenge()` / `consumeWebAuthnChallenge()` — Redis-backed, 300s TTL, atomic consume
- `listCredentials()` / `renameCredential()` / `revokeCredential()` — device lifecycle management
- `deviceFingerprint(userAgent, ip)` — SHA-256 device fingerprint
- `markDeviceSeen(userId, fp)` — upserts to `known_devices`; returns `{isNew: boolean}` for new device detection

### Added — WebAuthn Routes

- `POST /api/auth/webauthn/register/challenge` — generate registration challenge with `excludeCredentials`
- `POST /api/auth/webauthn/register/verify` — verify registration, store credential
- `POST /api/auth/webauthn/auth/challenge` — generate auth challenge (supports resident keys / passkeys)
- `POST /api/auth/webauthn/auth/verify` — verify assertion, issue access + refresh token session
- `GET /api/auth/webauthn/credentials` — list registered credentials
- `PATCH /api/auth/webauthn/credentials/[id]` — rename credential
- `DELETE /api/auth/webauthn/credentials/[id]` — revoke credential

### Added — Migration 0009 (`src/lib/db-migrate.ts`)

- `webauthn_credentials` — credential storage: `credential_id`, `public_key` (COSE), `counter`, `device_name`, `aaguid`, `transports`
- `known_devices` — per-user device trust registry with fingerprint + last_seen_at
- `password_history` — last N password hashes for reuse prevention

### Changed — 2FA Enforcement in Login (`src/app/api/academy-auth/route.ts`)

- Password-verified login with 2FA enabled now returns `{requires2fa: true, preAuthToken}` — no session cookie issued
- `preAuthToken` is a Redis-backed one-time token (UUID, 5-min TTL, consumed atomically)
- Client calls `POST /api/auth/2fa/verify` with `{code, preAuthToken}` to complete login

### Changed — 2FA Verify Route (`src/app/api/auth/2fa/verify/route.ts`)

- Pre-auth flow: after TOTP verified, fetches account and issues full access + refresh token session
- Re-verification flow (no preAuthToken): unchanged — returns `{verified: true}`

### Added — Auth Metrics (`src/lib/security/auth-metrics.ts`)

- `trackAuthEvent(key)` — fire-and-forget Redis INCR for 18 event types
- `getAuthMetrics()` / `resetAuthMetrics()` — pipeline reads/resets
- `GET /api/admin/security-metrics` — admin-only metrics endpoint with counter snapshot
- `DELETE /api/admin/security-metrics` — reset counters

### Added — Compliance Adapters (`src/lib/compliance/`)

- `sumsub.ts` — `SumsubKycProvider`: HMAC-SHA256 signed headers; graceful degrade without credentials
- `chainalysis.ts` — `ChainalysisAmlProvider`: KYT v2 REST API; graceful degrade
- `ofac.ts` — `OfacSanctionsProvider`: OFAC public API; 5s timeout; always registered
- `index.ts` — `bootstrapComplianceProviders()`: env-driven auto-registration; called from `server.ts`

### Added — Withdrawal Security Gate (`src/lib/security/withdraw-gate.ts`)

- `checkWithdrawVelocity(userId, amountUsd)` — Redis INCRBYFLOAT rolling 24h limit ($10,000 default)
- `requires2faForWithdrawal(amountUsd)` — true for amounts ≥ $100
- `isDeviceTrusted(userId, fingerprint)` — DB lookup in `known_devices`
- `runWithdrawGate(opts)` — compound gate: risk + velocity + 2FA + device trust

### Added — Password Security (`src/lib/security/passwords.ts`)

- `hashPassword()` / `verifyPassword()` — PBKDF2-SHA256 (120,000 iterations); extracted to shared module
- `isPasswordReused(userId, password, limit)` — checks last N hashes from `password_history`
- `recordPasswordHistory(userId, hash)` — persists hash; auto-prunes to last 10
- `assessPasswordStrength(password)` — heuristic score (0–7) with specific feedback
- `POST /api/auth/password/change` — current password verification, strength check, history check

### Added — Device Management Routes

- `GET /api/auth/devices` — list known devices (from `known_devices` table)
- `PATCH /api/auth/devices/[id]` — rename device
- `DELETE /api/auth/devices/[id]` — remove device from trust registry

### Changed — Login Observability

- `trackAuthEvent("login_success")` wired into password login and WebAuthn login
- `trackAuthEvent("login_2fa_required")` emitted when 2FA gate triggers
- `markDeviceSeen()` called on every successful login; new device triggers `new_device_detected` metric

### Changed — server.ts

- `bootstrapComplianceProviders()` called immediately after `app.prepare()`

### Documentation

- `docs/WEBAUTHN.md` — new: full WebAuthn protocol, crypto details, DB schema, env vars
- `docs/WITHDRAW_SECURITY.md` — new: withdrawal gate layers, velocity limits, 2FA thresholds
- `docs/AUTH.md` — updated: pre-auth token flow, WebAuthn section, phase table extended to v36
- `docs/COMPLIANCE.md` — updated: implemented providers documented, bootstrap procedure
- `docs/SECURITY.md` — updated: rate limit table, overview extended to v36

---

## [v0.35] — 2026-07-01 — Enterprise Authentication Hardening and API Security

### Added — Migration 0008 (`src/lib/db-migrate.ts`)

- `refresh_tokens` — long-lived refresh token table with `family_id` for reuse detection; indexed by family and user
- `user_2fa` — TOTP 2FA configuration with AES-256-GCM encrypted secrets and HMAC-SHA256 hashed backup codes

### Added — CIDR IP Whitelist (`src/lib/security/cidr.ts`)

- `ipMatchesCidr(ip, cidrOrIp)` — IPv4 and IPv6 CIDR matching, zero dependencies
- `ipInWhitelist(ip, whitelist)` — check against an array of IPs/CIDRs
- Replaces exact-match IP whitelist in API key validation

### Added — TOTP 2FA (`src/lib/security/totp.ts`)

- `generateTotpSecret()` — 20-byte base32-encoded TOTP secret
- `encryptTotpSecret(raw)` / `decryptTotpSecret(stored)` — AES-256-GCM with `TECPEY_2FA_SECRET`
- `verifyTotp(secret, code)` — RFC 6238 HOTP/TOTP, ±1 window tolerance
- `generateBackupCodes()` — 10 × 8-char alphanumeric codes
- `hashBackupCode(code)` / `findBackupCode(code, hashes)` — HMAC-SHA256 with timing-safe comparison
- `buildOtpAuthUri(opts)` — `otpauth://totp/...` compatible with all major authenticator apps
- `storePreAuthToken(token, userId)` / `consumePreAuthToken(token)` — Redis-backed pre-auth flow (5-min TTL)

### Added — Refresh Token Rotation (`src/lib/security/refresh-tokens.ts`)

- `issueRefreshToken(opts)` — 30-day JWT signed with `TECPEY_REFRESH_SECRET`; persisted to `refresh_tokens` table
- `verifyRefreshToken(token)` — DB-backed verification with reuse detection: reused token triggers family revocation
- `revokeRefreshToken(jti)` / `revokeFamily(familyId)` — single and family-wide revocation
- `setRefreshCookie(res, token)` / `clearRefreshCookie(res)` — `Path=/api/auth/refresh`, `SameSite=Strict`
- New cookie: `tecpey_refresh` (30 days, HttpOnly, Strict, path-restricted)

### Added — HMAC-Signed API Key Auth (`src/lib/security/api-key-auth.ts`)

- `validateSignedApiKeyRequest(req, permission, rawBody)` — full Binance-style HMAC validation
- Canonical string: `METHOD\nPATH\nTIMESTAMP_MS\nSHA256(body)`
- 5-minute timestamp window + Redis nonce tracking (replay prevention)
- Timing-safe signature comparison
- `hasApiKeyHeaders(req)` — detect API key auth mode

### Added — Risk Enforcement (`src/lib/security/risk-enforcement.ts`)

- `setRiskLevel(userId, level, ttlSeconds)` — sets Redis `tecpey:risk:level:{userId}`
- `clearRiskLevel(userId)` — admin or auto-release
- `getRiskLevel(userId)` — read enforcement level
- `enforceTradeAllowed(userId)` — synchronous trade gate (returns error code or null)
- `enforceWithdrawAllowed(userId)` — synchronous withdrawal gate
- Levels: `trade_blocked` | `withdraw_blocked` | `all_blocked` | `review`

### Added — 2FA API Routes

- `GET  /api/auth/2fa/enroll` — generate TOTP secret + QR URI + backup codes
- `POST /api/auth/2fa/enroll` — confirm enrollment with first TOTP code
- `POST /api/auth/2fa/verify` — verify TOTP (re-prompt or pre-auth flow)
- `POST /api/auth/2fa/disable` — disable 2FA (requires current code or admin override)
- `POST /api/auth/2fa/backup` — use a one-time backup code

### Added — Token Refresh Route

- `POST /api/auth/refresh` — exchange refresh token for new access + refresh pair; writes audit

### Modified — jti Revocation in Every Authenticated Request (`src/lib/auth-session.ts`)

- `getCanonicalSession()` now calls `isJtiRevoked(jti)` after signature verification
- 30-second in-memory cache (max 2,000 entries) avoids Redis hammering
- Graceful degrade: Redis unavailable → allow

### Modified — Login/Logout Wiring (`src/app/api/academy-auth/route.ts`)

- `POST` (login): issues 4-hour access token + 30-day refresh token, calls `registerSession`, writes `login` audit
- `DELETE` (logout): calls `revokeJti`, `revokeSession`, `revokeRefreshToken`, writes `logout` audit

### Modified — Risk Enforcement in Order Placement (`src/app/api/orders/route.ts`)

- Added `enforceTradeAllowed(userId)` synchronous check before order creation
- Returns HTTP 403 `account_trade_restricted` if user is trade-blocked

### Modified — Risk Engine Enforcement (`src/lib/security/risk-engine.ts`)

- `emit()` now calls `setRiskLevel()` on high-severity events: `trade_blocked` (1-hour) or `review` (5-min)

### Modified — API Key CIDR Whitelist (`src/lib/security/api-keys.ts`)

- `validateApiKey()` now uses `ipInWhitelist(ip, whitelist)` instead of `Array.includes()`
- Supports full CIDR notation for IP whitelists

### Added — Documentation

- `docs/AUTH.md` — complete authentication architecture, token model, session lifecycle
- `docs/2FA.md` — 2FA enrollment, backup codes, pre-auth flow
- Updated `docs/SECURITY.md` — refresh tokens, HMAC API keys, CIDR whitelists, risk enforcement
- Updated `docs/API_KEYS.md` — HMAC signing, CIDR whitelist, example code
- Updated `docs/RISK_ENGINE.md` — enforcement levels, Phase 35 architecture

---

## [v0.34] — 2026-07-01 — Enterprise Security and Compliance Foundation

### Added — Migration 0007 (`src/lib/db-migrate.ts`)

- `user_sessions` — server-side session registry keyed by jti; indexed by (user_id, is_revoked, expires_at)
- `api_keys` — API key management with SHA-256 hash storage; indexed by key_hash for O(1) validation
- `audit_events` — immutable append-only security audit trail; indexed by actor_id and action
- `risk_events` — risk signal storage (append-only); indexed by user_id and event_type

### Added — JWT Hardening (`src/lib/unified-session.ts`)

- `jti` (JWT ID) added to every new session token via `crypto.randomUUID()`
- `jti` field added to `UnifiedSessionPayload` type
- `extractJtiFromToken(token)` — base64url decode without signature verification (for logout)
- `extractExpFromToken(token)` — extract exp claim without verification

### Added — JTI Revocation Store (`src/lib/security/jti-store.ts`)

- `revokeJti(jti, expiresAt)` — writes to Redis with TTL aligned to token lifetime
- `isJtiRevoked(jti)` — O(1) Redis check; returns false on Redis unavailability (graceful degradation)
- `revokeMultiple(sessions[])` — batch revocation via Redis pipeline (for logout-all)

### Added — Session Registry (`src/lib/security/session-store.ts`)

- `registerSession(opts)` — INSERT on login
- `touchSession(jti)` — UPDATE last_used_at on authenticated requests
- `listActiveSessions(userId)` — list non-expired, non-revoked sessions
- `revokeSession(jti, userId)` — revoke one; updates DB + Redis
- `revokeAllSessions(userId, exceptJti?)` — revoke all (except current); batch Redis pipeline

### Added — Audit Trail (`src/lib/security/audit-log.ts`)

- `writeAudit(event)` — fire-and-forget append to `audit_events`
- `getAuditLog(opts)` — query by actor, action, date range
- 17 audited action types covering auth, orders, API keys, admin, risk events
- Audit failures are logged but never propagated to callers

### Added — API Key Management (`src/lib/security/api-keys.ts`)

- `createApiKey(opts)` — returns `{ apiKey, plaintext }` (plaintext returned once, hash stored)
- `listApiKeys(userId)` — returns all keys (no plaintext ever returned)
- `validateApiKey(rawKey, permission, ip?)` — hash comparison + permission + IP whitelist check
- `setApiKeyActive(keyId, userId, active)` — enable/disable
- `deleteApiKey(keyId, userId)` — permanent deletion
- `rotateApiKey(keyId, userId)` — new key generated, old hash replaced
- Max 20 active keys per user; key format: `tecpey_{prefix}_{48chars}`

### Added — Risk Engine (`src/lib/security/risk-engine.ts`)

- `checkOrderRisk(opts)` — fire-and-forget; 4 checks: frequency, burst, IP switch, duplicate request
- `checkApiKeyRisk(opts)` — fire-and-forget; 1 check: API call rate
- All checks use Redis counters (INCR + EXPIRE); all emit to `risk_events` + audit trail
- Thresholds: 10 orders/min, 3 orders/5s burst, 50 API calls/min
- Integrated into `POST /api/orders` and API key validation path

### Added — Compliance Interfaces (`src/lib/security/compliance.ts`)

- `KYCProvider` interface (createSession, getStatus, handleWebhook)
- `AMLProvider` interface (screenTransaction, handleAlert)
- `SanctionsProvider` interface (screenUser, screenAddress)
- `TravelRuleProvider` interface (submitTransfer, isRequired)
- `registerComplianceProviders(providers)` — DI registry on globalThis
- `getComplianceProviders()` — retrieve registered providers

### Added — Session Management API

- `GET /api/auth/sessions` — list active sessions
- `DELETE /api/auth/sessions` — logout all devices (keeps current session)
- `DELETE /api/auth/sessions/[id]` — revoke specific session

### Added — API Key API

- `GET /api/api-keys` — list keys
- `POST /api/api-keys` — create key; returns plaintext once (HTTP 201)
- `PATCH /api/api-keys/[id]` — disable / enable / rotate
- `DELETE /api/api-keys/[id]` — permanent delete

### Changed — `src/lib/rate-limit.ts`

- `rateLimitUser(req, { userId, ... })` — per-user rate limiting
- `rateLimitApiKey({ keyId, ... })` — per-API-key rate limiting

### Changed — `src/app/api/orders/route.ts`

- `checkOrderRisk()` called after auth, before engine (fire-and-forget)
- `writeAudit()` called after engine result (audit: order_placed)

### Changed — `src/app/api/orders/[id]/route.ts`

- `writeAudit()` called on successful cancel (audit: order_cancelled)

### Added — `docs/SECURITY.md`, `docs/RISK_ENGINE.md`, `docs/API_KEYS.md`, `docs/COMPLIANCE.md`

---

## [v0.33] — 2026-07-01 — Distributed Realtime Infrastructure

### Added — Redis Pub/Sub (`src/lib/redis-pubsub.ts`)

- `RedisPubSubManager` singleton on `globalThis.tecpeyPubSub`
- Separate publisher and subscriber Redis clients (ioredis requirement)
- Channels: `trade`, `order`, `orderbook`, `ticker`, `wallet` under `tecpey:events:*` prefix
- Envelope format with `nodeId` + `ts` for observability
- Debounced orderbook publish: 50ms coalescing window per market reduces Redis PUBLISH calls
- Node registry: `SET tecpey:node:{nodeId} ... EX 60`, refreshed every 30s
- Redis latency probe (PING) every 60s
- Graceful shutdown: deregisters node, quits both clients
- Retry strategy: exponential backoff up to 5s
- Metrics: published, received, dropped, reconnects, latencyMs, subscribedChannels

### Added — Delta Order Book (`src/lib/ws/orderbook-delta.ts`)

- `computeObDelta(market, snapshot)` — computes level-diff from previous snapshot
- `resetObDelta(market)` — clears state on resync requests
- Delta format: `{ bids, asks }` where `quantity: "0"` means level removed
- Previous snapshot stored on `globalThis.tecpeyObPrevSnap`

### Changed — `server.ts`

- `app.prepare()` now `async` — awaits Redis pub/sub initialization
- If `REDIS_URL` is set: wires `wireRedisPublisher` + `setupRedisSubscriptions`
- Graceful shutdown hooks (`SIGTERM`, `SIGINT`) — shuts down Redis pub/sub before exit
- Logs whether multi-instance or single-instance mode is active

### Changed — `src/lib/event-bus.ts`

- Added `wireRedisPublisher(pubsub)` — routes local EventBus events to Redis pub/sub
- Called once from `server.ts`; idempotent on hot reload

### Changed — `src/lib/ws/ws-manager.ts`

- Added `setupRedisSubscriptions(pubsub)` — switches WsManager from local EventBus to Redis sub path
- Added `broadcastOrderBook(payload)` — sends delta if available, falls back to full snapshot
- Added `droppedMessages` counter in broadcast loop (backpressure + send errors)
- `getMetrics()` now returns `mode: "redis" | "local"` and `pubSub: PubSubMetrics | null`
- Resync (`sendSnapshot` for orderbook) resets delta state via `resetObDelta(market)`
- Local EventBus fallback remains active when Redis is not configured

### Added — `docs/SCALING.md`

- Horizontal scaling reference: architecture, Nginx config, failure modes
- Multi-instance topology recommendations
- Delta order book bandwidth reduction explanation

### Changed — `docs/REDIS.md`

- Added Phase 33 pub/sub architecture section with channel table and flow diagram
- Updated status from Phase 32 to Phase 33

### Changed — `docs/WEBSOCKET.md`

- Added delta protocol documentation (`type: "delta"` message format)
- Clarified full snapshot vs. delta semantics and resync behaviour

---

## [v0.32] — 2026-07-01 — Realtime WebSocket Infrastructure

### Added — Custom Server (`server.ts`)

- Node.js HTTP server with WebSocket support on the same port
- Next.js integrated via `app.prepare()` + `httpServer` option
- WebSocket server (`ws`) on `/ws` path via HTTP upgrade event
- `@next/env` for env loading (`.env.local`, `.env`) before any service imports
- `npm run dev` / `npm run start` updated to use `tsx server.ts`

### Added — Event Bus (`src/lib/event-bus.ts`)

- Typed `TradingEventBus` singleton on `globalThis.tecpeyEventBus`
- Events: `trade:executed`, `order:updated`, `orderbook:changed`, `ticker:updated`, `wallet:changed`
- Per-market sequence counter (`globalThis.tecpeyObSeq`) for resync detection
- Max 200 listeners (supports many WS channels without EventEmitter warnings)

### Added — WebSocket Manager (`src/lib/ws/ws-manager.ts`)

- `WsManager` singleton on `globalThis.tecpeyWsManager`
- Connection lifecycle: connect, auth, subscribe, unsubscribe, heartbeat, disconnect
- Cookie-based auto-auth via `tecpey_session` / `tecpey_academy_session` cookies on upgrade request
- Token-based auth via `{ "type": "auth", "token": "..." }` message
- Subscription registry: channel-key → Set<connId>; max 100 subs per connection
- Heartbeat: 30s ping interval, 15s pong timeout → terminate on miss
- Backpressure: messages dropped if `ws.bufferedAmount > 1MB`
- Snapshot on subscribe: `orderbook` (50 levels), `ticker`, `market-summary`
- `get_snapshot` message for manual resync
- `WsMetrics` interface + `getMetrics()` method

### Added — All 8 WebSocket Channels

| Channel | Direction | Trigger |
|---------|-----------|---------|
| `ticker:{MARKET}` | Broadcast | On trade execution |
| `trades:{MARKET}` | Broadcast | On trade execution |
| `orderbook:{MARKET}` | Broadcast | On order/fill/cancel |
| `market-summary:{MARKET}` | Broadcast | On trade execution |
| `user-orders:{userId}` | Private | On order status change |
| `user-trades:{userId}` | Private | On trade involving user |
| `wallet:{userId}` | Private | On balance change |
| `notifications:{userId}` | Private | Platform notifications |

### Added — Market Stats Cache (`src/lib/trading/market-stats-cache.ts`)

- 5-second TTL in-memory cache per market on `globalThis.tecpeyStatsCache`
- `getCachedMarketStats(market)` — returns cached or refreshes from DB
- `invalidateStatsCache(market)` — called by engine after each trade
- `buildTickerPayload(market)` — merges stats + order book top for ticker broadcasts

### Added — Complete Redis Order Book Store

- `RedisOrderBookStore` fully implemented with ioredis
- Write-through: all mutations fire async Redis pipeline (ZADD/ZREM/HSET/HDEL)
- Read path: in-memory (synchronous interface maintained)
- Warm-start: `warmFromRedis(market)` — reads from Redis Sorted Sets; falls back to DB
- `rebuildOrderBook()` tries Redis first, then DB
- `createRedisClient()` factory: lazy init, single client on `globalThis.tecpeyRedisClient`
- `getRedisClient()` exported for custom server access
- Connection error logging (non-fatal in dev; logged in prod)

### Added — Engine → Event Bus Integration

- Engine emits `trade:executed` for each fill (post-tx)
- Engine emits `order:updated` for taker + maker on fill (post-tx)
- Engine emits `orderbook:changed` after all book mutations (post-tx)
- Engine emits `wallet:changed` for buyer and seller assets on fill (post-tx)
- Engine calls `invalidateStatsCache(market)` after fills
- Cancel flow emits `order:updated` (CANCELLED) + `orderbook:changed`

### Added — Observability (`GET /api/ws/metrics`)

- Admin-only endpoint
- Returns: connected clients, authenticated clients, total subscriptions, subscriptions by channel, total messages sent, uptime ms
- Returns `available: false` when running without custom server (plain `next start`)

### Added — Packages

| Package | Purpose |
|---------|---------|
| `ioredis` | Redis client for order book persistence |
| `@types/ws` | TypeScript types for ws library |
| `tsx` | TypeScript server runner (dev + prod custom server) |

### Documentation

- `docs/WEBSOCKET.md` — NEW: full WS protocol reference
- `docs/REALTIME.md` — NEW: event bus, snapshot, cache, perf, security
- `docs/REDIS.md` — NEW: Redis integration, key schema, failure modes, Phase 33 roadmap
- `docs/API.md` — WebSocket section added

---

## [v0.31] — 2026-06-30 — Spot Trading Complete

### Added — Market Statistics

- `src/lib/trading/market-stats-service.ts` — single-query 24h aggregation: last price, open, high, low, base/quote volume, VWAP, price change, price change %
- `GET /api/markets/[market]/summary` — returns 24h stats + order book top-of-book + market config

### Added — Open Orders endpoint

- `GET /api/orders/open` — returns orders in `NEW` or `PARTIALLY_FILLED` status for authenticated user; optional `?market=` filter
- `listOpenOrders(userId, market?)` in `order-service.ts`

### Enhanced — Order filtering and pagination

- `GET /api/orders` — added `side`, `type`, `from`, `to`, `cursor` query params
- Response now includes `nextCursor` for cursor-based pagination
- `listOrders()` extended with all new filter options

### Enhanced — Trade history pagination

- `GET /api/trades` — added `before`, `from`, `to` params for date range and cursor pagination
- Response now includes `nextCursor`
- `listTrades()` extended with cursor/range options
- `listUserTrades()` rewritten with UNION approach (replaces OR-JOIN with DISTINCT — index-friendly)

### Enhanced — Orderbook aggregation

- `GET /api/orderbook?aggregate=N` — groups price levels by N decimal places; bids floor, asks ceil

### Fixed — Audit events

- `OrderFilled` event type added — emitted when order completely fills (was incorrectly `OrderAccepted`)
- `OrderPartiallyFilled` event type added — emitted when GTC order partially fills
- Both added to `TradingEventType` union in `events.ts` with typed payload shapes

### Added — Database indexes (migration 0006)

- `idx_orders_user_status` — covers open orders query by (user_id, status, created_at)
- `idx_trades_buyer` / `idx_trades_seller` — covers UNION-based user trade history
- `idx_trades_market_time` — covers 24h market stats window

### Documentation

- `docs/SPOT_ENGINE.md` — NEW: spot engine reference, event catalogue, API reference
- `docs/TRADING_CORE.md` — Phase 31 section added
- `docs/API.md` — complete trading API reference added

---

## [v0.30] — 2026-06-30 — Transactional Matching, Wallet Balances, Redis Order Book Foundation

### Added — wallet_balances table (migration 0005)

- `wallet_balances (user_id, asset)` — O(1) snapshot of available and held balances per user/asset
- `CHECK (available_balance >= 0)` and `CHECK (held_balance >= 0)` — database-level non-negative enforcement
- Eliminates the full `wallet_ledger` aggregate scan on every balance read

### Added — Wallet Balance Service (`src/lib/trading/wallet-balance-service.ts`)

- `holdFundsTx` / `holdFunds` — atomic single-SQL hold: `UPDATE … WHERE available >= holdAmount` (0 rows = insufficient balance, no TOCTOU)
- `releaseFundsTx` / `releaseFunds` — atomic release of earmarked funds
- `creditFundsTx` — increase available (received asset on fill)
- `debitFundsTx` — decrease available (spent asset on fill, enforces `available >= amount`)
- `chargeFeeTx` — deduct fee with `LEAST(fee, available)` to handle rounding edge cases
- `depositFundsTx` / `depositFunds` — admin deposit (seed scripts; no real rails)
- `getBalance(userId, asset)` — O(1) balance read from `wallet_balances`
- Every operation appends to `wallet_ledger` within the same transaction (dual-layer audit)

### Added — `withTx` in `src/lib/db.ts`

- `withTx<T>(handler)` — wraps handler in `BEGIN / COMMIT / ROLLBACK`; re-throws on handler error after rollback
- Enables single-client transactions across multiple service calls

### Added — Order Book Store (`src/lib/trading/order-book-store.ts`)

- `OrderBookStore` interface — abstraction over in-memory and Redis-backed order books
- `InMemoryOrderBookStore` — wraps `globalThis.tecpeyEngineBooks`; synchronous sorted Map operations
- `RedisOrderBookStore` stub — warns in non-production if ioredis not installed; throws in production
- `getOrderBookStore()` — factory: selects Redis when `REDIS_URL` is set, in-memory otherwise
- `rebuildOrderBook(market)` — warm-start recovery: loads `NEW` / `PARTIALLY_FILLED` limit orders from DB and repopulates engine book + display book
- `pkStr(price)` — exported price-key helper used by engine and store

### Changed — Matching Engine (`src/lib/trading/engine.ts`)

- **Pre-tx fill computation**: `computeFills()` iterates in-memory book levels and builds `FillRecord[]` — zero DB calls
- **Single Postgres transaction**: the full fill sequence (trades + wallet balance updates + order updates + audit events) runs inside one `withTx` call — any failure rolls back all writes
- **Post-tx book update**: `store.updateMakerRemaining()` and display book mutations happen after commit, not during
- Replaced internal `EngineBook` / `EngineOrder` structures with `OrderBookStore` interface
- Market-order hold release now uses `tradePrice` as release basis (not `limitPrice=0`)
- Zero-fill IOC/MARKET release queries `wallet_ledger` for original hold amount (no hardcoded value)
- `cancelOrder` restores in-memory book entry on tx failure
- `ensureBookReady(market)` calls `rebuildOrderBook` automatically on empty book (warm-start)

### Changed — Order Service (`src/lib/trading/order-service.ts`)

- `createOrderTx(client, input)` — tx-aware order creation (no `withDb` wrapper)
- `getOrderByIdTx(client, orderId)` — tx-aware read
- `updateOrderFillTx(client, ...)` — tx-aware fill update
- `setOrderStatusTx(client, ...)` — tx-aware status update

### Changed — Trade Service (`src/lib/trading/trade-service.ts`)

- `createTradeTx(client, input)` — tx-aware trade insertion

### Changed — Ledger Service (`src/lib/trading/ledger-service.ts`)

- `postLedgerEntryTx(client, input)` — tx-aware ledger append (no event emission; caller handles events)

### Changed — Wallet Service (`src/lib/trading/wallet-service.ts`)

- `getAvailableBalance` — reads from `wallet_balances` (O(1)) instead of aggregating `wallet_ledger`
- `postHold` — delegates to `holdFunds` from wallet-balance-service
- `postRelease` — delegates to `releaseFunds` from wallet-balance-service

### Changed — Orders Route (`src/app/api/orders/route.ts`)

- Order creation + hold now wrapped in a single `withTx`: creates order record and atomically holds funds
- If hold fails (insufficient balance or concurrent depletion), the entire tx rolls back — no orphaned order in DB
- Pre-flight `getAvailableBalance` check kept for early error message; the tx is the authoritative enforcement

### Added — Documentation

- `docs/WALLET_ENGINE.md` — wallet balance table, hold/release model, atomic guarantees, service API
- `docs/REDIS_ORDER_BOOK.md` — OrderBookStore interface, Redis key schema, warm-start, activation guide
- `docs/TRADING_CORE.md` — Phase 29 and Phase 30 sections added

### Safety

- No Futures, Margin, Leverage, Stop-limit orders
- No real-money deposit/withdrawal rails
- No KYC provider integration
- No external payment processing

---

## [v0.29] — 2026-06-30 — In-Process Matching Engine and Order Execution

### Added — Matching Engine (`src/lib/trading/engine.ts`)

- `InProcessMatchingEngine` — full implementation of `MatchingEngineInterface`
- Price-time priority matching: best price first, FIFO within each price level
- Supported order types: `limit`, `market`, `ioc`, `fok`, `gtc`
- Supported time-in-force: `GTC` (resting), `IOC` (immediate or cancel), `FOK` (fill or kill)
- FOK pre-flight: checks available book volume before any execution; rejects atomically if insufficient
- Partial fills: `PARTIALLY_FILLED` status + GTC remainder inserted into engine book and display book
- IOC/MARKET remainder: cancelled after matching pass, hold released for unfilled quantity
- Trade creation: each fill produces a `trades` DB row with VWAP avg_fill_price on both orders
- Order events: every state transition appended to `order_events` audit log
- Engine book sync: in-memory `tecpeyEngineBooks` (individual orders) kept in sync with display `OrderBook` (aggregated price levels)
- `getMatchingEngine()` singleton — engine instance survives hot-reload via `globalThis`
- Graceful engine-restart fallback in `cancelOrder`: if order not in engine book (e.g. after process restart), computes release from DB order fields

### Added — Wallet Service (`src/lib/trading/wallet-service.ts`)

- `getAvailableBalance(userId, asset)` — ledger aggregate: credits + releases − debits − holds − fees
- `postHold` / `postRelease` — paired hold/release entries for open order earmarking
- `postTradeDebit` / `postTradeCredit` / `postFee` — actual financial entries on fill
- Phase 29 convention: `walletId = userId` (dedicated wallets table deferred to future phase)
- Hold/release model: `hold` earmarks funds; `release` restores on fill (paired with `trade_debit`); full release on cancel/expire

### Added — Order Service additions (`src/lib/trading/order-service.ts`)

- `getOrderById(orderId)` — internal engine lookup without userId filter
- `updateOrderFill(orderId, fillQty, fillPrice, newStatus)` — VWAP avg_fill_price computed in SQL; atomic status transition
- `setOrderStatus(orderId, newStatus)` — for CANCELLED / EXPIRED / REJECTED transitions

### Added — Trade Service additions (`src/lib/trading/trade-service.ts`)

- `createTrade(input)` — persists a matched trade record to `trades` table

### Changed — `POST /api/orders`

- **Balance pre-check**: queries `getAvailableBalance` before accepting any order; returns 422 with detail on insufficient funds
- **Hold posting**: `postHold` earmarks funds immediately after order creation
- **Engine wiring**: calls `engine.placeOrder(order)` — returns `tradeIds` and `accepted` flag
- **Final state fetch**: re-fetches order from DB after engine to reflect fills/status
- **timeInForce parsing**: new `timeInForce` field accepted in request body (`GTC|IOC|FOK`)
- **Market buy**: reads `bestAsk` from in-memory order book; rejects with 422 `no_liquidity` if book is empty
- Returns 422 when engine rejects/expires the order (FOK failure, no liquidity); 201 on acceptance

### Changed — `DELETE /api/orders/:id`

- Routes through `engine.cancelOrder()` instead of `order-service.cancelOrder()`
- Engine handles: book removal, DB status update, hold release, `OrderCancelled` event, audit log entry

### Remaining Gaps (Phase 29 intentional deferrals)

| Gap | Phase |
|---|---|
| In-memory book lost on process restart | 30/32 — Redis Sorted Sets |
| No DB transaction wrapping full match sequence | 30 — transactional matching |
| Balance check not atomic with hold post | 30 — balance table with advisory locks |
| `walletId ≠ userId` separation | future — dedicated wallets table |
| WebSocket / SSE real-time order book feed | future phase |
| Negative adjustment support in ledger | future — signed amount field |
| Multi-instance engine coordination | 30/32 — Redis |

---

## [v0.28.5] — 2026-06-30 — AI Development Skills & TecPey Enterprise Skill

### Added — Claude Skills (`/.claude/skills/`)

- `tecpey/SKILL.md` — **TecPey Enterprise Skill**: platform track architecture, engineering quality gates, Next.js 16 conventions, brand/logo rules, UX constraints, product strategy, 7-step phase workflow; primary skill that governs all TecPey sessions
- `ui-ux-pro/SKILL.md` — Adapted from nextlevelbuilder/ui-ux-pro-max-skill (MIT); design guidance for fintech and edtech UI, color palettes, typography, chart recommendations, Tailwind/Next.js stack; reference only
- `impeccable/SKILL.md` — Adapted from pbakaus/impeccable (Apache 2.0); 23-command design audit system (/impeccable audit, polish, colorize, typeset, layout, animate, quieter, bolder, critique); brand vs. product register; reference only
- `motion-framer/SKILL.md` — Framer Motion patterns (DEFERRED); not activated until framer-motion dep is installed and user approves
- `engineering/SKILL.md` — Adapted from addyosmani/agent-skills (MIT); spec-driven development, incremental implementation, git workflow, CI/CD, observability pattern, API design
- `security/SKILL.md` — Adapted from addyosmani/agent-skills (MIT); threat modeling, STRIDE, CSRF, rate limiting, CSP, financial data protection, TecPey-specific auth patterns
- `performance/SKILL.md` — Adapted from addyosmani/agent-skills (MIT); Next.js 16 App Router, DB query optimization, bundle size, trading surface real-time data, observability-driven profiling
- `qa/SKILL.md` — Adapted from addyosmani/agent-skills (MIT); mandatory 3-check QA gate (typecheck → lint → build), code review checklist, debug protocol, ESLint rules

### Added — Documentation

- `docs/AI_DEVELOPMENT_ENVIRONMENT.md` — Full audit report: adoption decisions, what was installed vs. excluded, hooks policy, rules for adding future skills, update process

### Not Installed

- Hooks from agent-skills (session-start.sh, sdd-cache scripts) — deferred; requires manual shell script review before activation
- Python search engine from ui-ux-pro-max-skill — reference guidance extracted; CLI not installed
- Astro/Bun build pipeline from impeccable — reference guidance extracted; build tools not installed
- Awesome Claude Skills (ComposioHQ) — reference catalog only; individual skills require separate audit before adoption
- framer-motion npm package — deferred pending explicit user approval

### Changes

- `package.json` — unchanged
- `package-lock.json` — unchanged
- No product code modified
- No runtime dependencies added

---

## [v0.28] — 2026-06-30 — Trading Core Foundation

### Added — Trading Domain Model (`src/lib/trading/`)

- `types.ts` — Complete domain types: `Asset`, `Market`, `Order`, `Trade`, `WalletLedgerEntry`, `OrderBookLevel`, `OrderBookSnapshot`, `PlaceOrderRequest`
- `events.ts` — `TradingEvent<T>` envelope + `createTradingEvent()` factory; 7 typed event kinds: `OrderCreated`, `OrderAccepted`, `OrderRejected`, `OrderCancelled`, `TradeExecuted`, `OrderExpired`, `LedgerPosted`
- `order-book.ts` — `OrderBook` class (insert, cancel, snapshot, bestBid, bestAsk, priceLevels, clear); `getOrderBook(market)` registry via `globalThis` for hot-reload survival
- `matching-engine.ts` — `MatchingEngineInterface` (interface only): `placeOrder`, `cancelOrder`, `match`, `snapshot`; architecture allows future replacement with Redis, C++, or external engine
- `validation.ts` — `validatePlaceOrderRequest`, `validateAssetForDeposit/Withdraw`, `validateMarketActive`, `isValidOrderSide`, `isValidOrderType`, `roundToPrecision`
- `market-service.ts` — `listAssets`, `getAsset`, `listMarkets`, `getMarket` (DB-backed, graceful fallback)
- `order-service.ts` — `createOrder`, `cancelOrder`, `listOrders`, `getOrder`; emits `OrderCreated`/`OrderCancelled` events + persists to `order_events` audit log
- `trade-service.ts` — `listTrades` (public), `listUserTrades` (authenticated); efficient join via `orders` table
- `ledger-service.ts` — `postLedgerEntry` (append-only, emits `LedgerPosted`), `queryLedger` (paginated); 8 entry types: deposit, withdraw, trade_debit, trade_credit, fee, adjustment, hold, release

### Added — Trading API Endpoints

- `GET /api/markets[?symbol=X]` — list active markets or single market lookup
- `GET /api/assets[?symbol=X]` — list active assets or single asset lookup
- `GET /api/orderbook?symbol=X[&depth=N]` — in-memory order book depth snapshot (1–100 levels)
- `GET /api/trades?market=X` or `?mine=1` — public recent trades or authenticated user trade history
- `GET /api/orders` — authenticated user's order history (filterable by market/status)
- `POST /api/orders` — place a new order with full validation (tick size, step size, min/max value, market active check)
- `DELETE /api/orders/:id` — cancel an open order (owner-only enforcement)

All endpoints: `withObservability()`, `rateLimit()`, `getCanonicalSession()`, CSRF where mutating.

### Added — Database Migration `0004_trading_core.sql`

- `assets` table + seed: USDT, BTC, ETH
- `markets` table + seed: BTCUSDT (tick=0.01, step=0.00001), ETHUSDT (tick=0.01, step=0.0001)
- `wallet_ledger` — append-only, type-checked, indexed on `(wallet_id, asset, created_at)`
- `orders` — full status lifecycle, indexed on `(user_id)` and `(market, status)`
- `trades` — indexed on `(market, executed_at)`
- `order_events` — immutable audit log per order

### Added — Documentation

- `docs/TRADING_CORE.md` — architecture, all models, order lifecycle, wallet ledger philosophy, matching engine integration plan, API reference, future gap list

---

## [v0.27] — 2026-06-30 — API Observability Rollout & Security Hardening

### Added — `withObservability()` Rollout

- Wrapped 28 high-traffic routes (auth, academy, AI mentor, market data, community, admin) with `withObservability()` from `src/lib/observe.ts`
- Every wrapped route now emits: request ID, structured log entry, in-memory metrics, error capture, and API error-spike detection
- Metrics store tracks per-route request count, latency, and error rate in `globalThis.tecpeyMetrics`

### Added — API Error Spike Detection

- `src/lib/observe.ts`: `checkErrorSpike()` fires after each request; emits `API_ERROR_SPIKE` alert when global error rate ≥ 40% over ≥ 50 requests (production only)

### Added — Price Feed Alerting Adapter

- `src/app/api/internal/price-feed-status/route.ts` (new): POST endpoint; rate-limited (5/min); accepts `{ status: "down", reason, attempts }` from client-side WebSocket failure; emits `PRICE_FEED_DOWN` alert via `emitAlert()`

### Added — Migration Failure Alerting

- `src/lib/db-migrate.ts`: catch block now calls `emitAlert("MIGRATION_FAILED", ...)` with filename, error message, and environment

### Added — Session Refresh Foundation

- `src/lib/session-refresh.ts` (new): `shouldRefreshSession()` (threshold: 25% of lifetime remaining), `refreshSessionCookie()`, `maxRefreshableSessionAge()`; full refresh-token rotation (DB-backed, single-use) deferred to a future phase

### Hardened — CSP connect-src

- `src/proxy.ts`: `buildConnectSrc()` now derives allowed origins from `NEXT_PUBLIC_API_BACKEND_URL` and `NEXT_PUBLIC_API_SOCKET_URL`; falls back to `https: wss: ws:` when not configured
- New escape hatch: `NEXT_PUBLIC_EXTRA_CONNECT_SRC` (space-separated additional origins)

### Hardened — Permissions-Policy

- `next.config.ts`: expanded Permissions-Policy to deny `usb=(), bluetooth=(), interest-cohort=()` in addition to existing camera/mic/geolocation/payment restrictions

### Documented

- `docs/OBSERVABILITY.md`: added "Routes Instrumented" table listing all 28 wrapped routes and skip-list rationale
- `.env.example`: added `NEXT_PUBLIC_EXTRA_CONNECT_SRC`

---

## [v0.26] — 2026-06-30 — Production Observability and Operations Foundation

### Added — Request ID / Trace ID Propagation

- `src/lib/trace.ts` (new): `generateRequestId()`, `getRequestId(req)`, `attachRequestId(response, id)`
  - Header `x-tecpey-request-id` set by proxy on forwarded request headers
  - Header `x-request-id` returned to clients on every page response
  - API routes use `getRequestId(req)` to extract or generate a per-request UUID
- `src/proxy.ts`: generates `requestId` alongside nonce; sets `x-tecpey-request-id` on forwarded request and `x-request-id` on response

### Added — Structured Logging Improvements

- `src/lib/logger.ts`: added `service` and `environment` fields to every log entry;
  added `logger.child(context)` — returns a child logger with pre-bound context fields
  merged into every call; backward-compatible with existing `logger.info/warn/error/debug` usage
- Log format: `{ ts, level, service, environment, msg, ...context }` — all entries are NDJSON

### Added — API Observability Wrapper

- `src/lib/observe.ts` (new): `withObservability(req, options, handler)` — wraps any API handler body with:
  - Request ID extraction and `x-request-id` response header
  - Structured `[api] request` log on completion (route, method, status, latencyMs)
  - In-memory metrics recording via `metrics.recordRequest()`
  - Error capture via `captureError()` on unhandled rejections
- Used on `GET /api/admin/metrics` as the adoption example

### Added — Enterprise Health Center

- `src/app/api/health/route.ts` rewritten with full enterprise health fields:
  - `checks.database`: `ok | unavailable | unconfigured` with `latencyMs`
  - `checks.redis`: existing check + latency tracking
  - `checks.email`: existing (Phase 25)
  - `migrations.applied`: count from `_migrations` table (fast, bypasses migration runner)
  - `tenantSystem.status`: reflects DB availability
  - `build`: `version`, `commit`, `node` from env vars / process
  - `memory`: RSS, heapUsed, heapTotal, external (all in MB)
  - `featureFlags`: snapshot from `getAllFlags()`
  - `observability`: error tracking and alert webhook status
  - `healthCheckLatencyMs`: total time to assemble response
  - `warnings[]`: production misconfiguration notices
  - Emits `DB_DOWN` / `REDIS_DOWN` / `EMAIL_NOT_CONFIGURED` alerts on degraded state
- `src/lib/db.ts`: added `checkDbHealth()` — direct pool connection (`SELECT 1`) without triggering the migration runner; also queries `_migrations` count

### Added — Metrics Foundation

- `src/lib/metrics.ts` (new): in-memory metrics store backed by `globalThis`
  - `metrics.recordRequest(route, status, latencyMs)` — per-route request count + latency tracker
  - `metrics.recordError(route, code)` — per-route error counter
  - `metrics.increment(name)` — named counter
  - `metrics.getSnapshot()` — totals, per-route breakdown, error rate
- `src/app/api/admin/metrics/route.ts` (new): `GET /api/admin/metrics` — admin-protected metrics endpoint

### Added — Error Tracking Adapter

- `src/lib/error-tracking.ts` (new): provider-agnostic error capture
  - `captureError(error, context?)` — never throws; safe to call anywhere
  - `ERROR_TRACKING_PROVIDER=betterstack`: push to Logtail via `fetch` (no new package)
  - `ERROR_TRACKING_PROVIDER=sentry`: stub ready for `@sentry/nextjs` (see TODO comment)
  - Default (`none`): structured `error` log to stdout
  - `isErrorTrackingConfigured()` — used by health endpoint

### Added — Alerting Foundation

- `src/lib/alerts.ts` (new): typed alert emitter
  - 7 alert types: `DB_DOWN`, `REDIS_DOWN`, `EMAIL_NOT_CONFIGURED`, `EMAIL_SEND_FAILED`,
    `API_ERROR_SPIKE`, `PRICE_FEED_DOWN`, `MIGRATION_FAILED`
  - Severity: `critical` (logged at error) or `warning` (logged at warn)
  - Deduplication: same alert type fires at most once per 60 seconds
  - Webhook delivery: `ALERT_WEBHOOK_URL` receives POST with `AlertEvent` JSON payload
  - Non-blocking: webhook failure is swallowed and logged as a warning

### Added — Environment Documentation

- `.env.example`: `ERROR_TRACKING_PROVIDER`, `BETTERSTACK_SOURCE_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`,
  `ALERT_WEBHOOK_URL`, `NEXT_PUBLIC_GIT_COMMIT`, `NEXT_PUBLIC_BUILD_VERSION`

### Added — Operational Documentation

- `docs/OPERATIONS_RUNBOOK.md` (new): incident runbooks for DB down, Redis down, email missing,
  migration failure, API error spike, price feed outage, CI failure, deployment rollback;
  environment variable checklist; production launch checklist
- `docs/OBSERVABILITY.md` (new): logging format reference, request ID usage guide, child logger,
  API wrapper adoption guide, health endpoint schema, metrics plan, alerting plan,
  recommended production stack

---

## [v0.25] — 2026-06-30 — Tenant Membership and Production Services Foundation

### Added — DB-backed Tenant and Membership Storage

- `src/lib/db-migrate.ts`: Added migration `0003_tenant_membership.sql`
  - `platform_tenants` table: `id`, `slug`, `display_name`, `plan`, `owner_id`, `products`, timestamps
  - `platform_workspaces` table: `id`, `tenant_id`, `slug`, `display_name`, `products`, `settings`, `created_at`
  - `platform_memberships` table: `id`, `user_id`, `tenant_id`, `workspace_id`, `roles`, `joined_at`, `expires_at` + indexes
  - Seeds default `tecpey` tenant and `main` workspace via `INSERT … ON CONFLICT DO NOTHING`
- `src/lib/tenant-service.ts` (new): DB query layer for tenant/membership data
  - `getTenant(tenantId)` — fetch tenant row
  - `getDefaultTenant()` — convenience wrapper for `PLATFORM.DEFAULT_TENANT_ID`
  - `getWorkspace(workspaceId)` — fetch workspace row
  - `getMembership(userId, tenantId)` — fetch user membership
  - `upsertMembership(userId, tenantId, roles, workspaceId?)` — create or update membership (idempotent)
  - `resolvePlatformContext(session)` — derives `PlatformContext` from canonical session; falls back to `["guest"]` when DB unavailable

### Added — Email Delivery Foundation

- `src/lib/email.ts` (new): Provider-agnostic email service; no new npm packages (fetch-based)
  - `sendEmail(message)` → `EmailResult` — routes to configured provider or logs in dev
  - Provider selection via `EMAIL_PROVIDER` env var: `resend` | `sendgrid` | `dev` | `none`
  - Resend provider: POST to `https://api.resend.com/emails` with `RESEND_API_KEY`
  - SendGrid provider: POST to `https://api.sendgrid.com/v3/mail/send` with `SENDGRID_API_KEY`
  - `isEmailConfigured()` — used by health endpoint
  - In production with no `EMAIL_PROVIDER` set, logs an error and returns failure instead of silently discarding emails

### Improved — Production Rate-Limit Enforcement

- `src/lib/rate-limit.ts`: Added `warnRedisUnconfigured()` — logs at ERROR level (once per process) when falling back to in-memory limiting in `NODE_ENV=production`
  - In development/test: silent fallback unchanged
  - In production: operators are alerted on first rate-limit call when Redis is missing

### Improved — Health Endpoint

- `src/app/api/health/route.ts`: Added `email` check (`configured` | `unconfigured`) to `/api/health` response
  - Added `warnings[]` array surfacing production misconfiguration (Redis unconfigured, email unconfigured)

### Fixed — TODO(cookie-migration) Cleanup

- `src/app/api/command-center/campaign/route.ts`: Replaced `hasAdminAccess(req)` → `(await getCanonicalSession(req)).isAdmin`. Removed `adminUnauthorizedResponse` and `hasAdminAccess` imports.
- `src/app/api/command-center/summary/route.ts`: Same migration — now uses canonical session for admin check.
- `src/app/api/academy/mentor-memory/route.ts`: Removed stale `TODO(cookie-migration)` comment (already resolved in Phase 23).

### Added — Environment Documentation

- `.env.example`: Added `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY`, `SENDGRID_API_KEY` with provider descriptions and production behavior notes.

---

## [v0.24.6] — 2026-06-30 — Enterprise Integrity Repair

### Fixed — Database Migration (CRITICAL)

- `src/lib/db-migrate.ts`: Added migration `0002_extended_schema.sql` that closes the
  schema drift gap between the committed `0001` migration and the columns referenced
  by production API routes. All changes use `ADD COLUMN IF NOT EXISTS` — idempotent
  and safe against already-extended databases.
  - `notification_center` +5 columns: `action_url`, `priority`, `channels`, `metadata`, `scheduled_for`
  - `admin_audit_log` +1 column: `actor` (alongside existing `admin_id`)
  - `academy_question_bank` +9 columns: `lesson_slug`, `topic`, `cognitive_skill`, `correct_option`,
    `explanation`, `usage_count`, `success_count`, `approved`, `updated_at` + 2 indexes
  - `mentor_challenge_attempts` +3 columns: `question_id`, `selected_option`, `is_correct` + index
  - `academy_students` +1 column: `last_seen_at`
  - `learning_brain_profiles` +3 columns: `decision_score`, `confidence_score`, `weak_topics`

### Fixed — Security Header Conflict

- `next.config.ts`: Changed `X-Frame-Options` from `SAMEORIGIN` to `DENY`.
  Resolves contradiction with `frame-ancestors 'none'` in `proxy.ts`. Both headers
  now enforce the same no-framing policy across legacy and modern browsers.

### Updated — Environment Documentation

- `.env.example`: Added `OPENAI_PROJECT_API_KEY`, all 5 `FEATURE_*` flags,
  `TECPEY_COOKIE_SECURE`, session max-age vars. Added explicit warning that
  **Redis is required in production** for rate limiting to coordinate across instances.

### Fixed — Low-Priority Code Cleanup

- `src/lib/admin-auth.ts`: Removed local `shouldUseSecureCookie()` (now imports from
  `platform-config`); `adminNotConfiguredResponse()` and `adminUnauthorizedResponse()`
  now use `apiError()` instead of bare `Response.json()`.
- `src/lib/session.ts`: Replaced hardcoded `"user_session"` string with `COOKIES.USER_SESSION`.
- `src/app/api/academy-auth/route.ts`: Auth rate limit tightened from 20 to 10 req/min.

### QA

- `npm run typecheck`: 0 errors
- `npm run lint`: 0 warnings, 0 errors
- `npm run build`: ✓ 292 pages, 7.0s, Proxy (Middleware) registered

---

## [v0.24] — 2026-06-30 — Enterprise Platform Foundation (Multi-Tenant Architecture)

### Added — Platform Libraries

- `src/lib/platform-config.ts`: Single source of truth for all platform configuration.
  Exports `COOKIES` record (SESSION, ACADEMY_AUTH, STUDENT_SESSION, STUDENT_ID, USER_SESSION),
  `shouldUseSecureCookie()` (reads `TECPEY_COOKIE_SECURE` env var or infers from `NEXT_PUBLIC_SITE_URL`),
  `sessionMaxAge()` (JWT duration string), `sessionMaxAgeSeconds()` (cookie maxAge integer),
  and `PLATFORM` metadata object (NAME, SITE_URL, API_BACKEND_URL, DEFAULT_TENANT_ID, DEFAULT_WORKSPACE_ID).
  Eliminates three separate `shouldUseSecureCookie()` implementations that existed in unified-session.ts,
  academy-auth.ts, and academy-session.ts.

- `src/lib/platform-types.ts`: Core type definitions for the multi-tenant model.
  Branded types: `TenantId`, `WorkspaceId`, `UserId`. Role union: `admin | moderator | teacher |
  student | trader | support | guest`. Product union: `exchange | academy | social | mentor |
  knowledge | marketplace`. Composite types: `TenantPlan`, `Tenant`, `Workspace`, `Membership`,
  `PlatformContext`. Pure types, zero runtime code.

- `src/lib/feature-flags.ts`: Runtime feature flag system driven entirely by environment variables.
  `FeatureFlag` union type (5 flags: academy.enabled, exchange.enabled, social.enabled,
  mentor.enabled, future.marketplace.enabled). `FLAG_CONFIG` record maps each flag to its env var
  and production-safe default. `isFeatureEnabled(flag)`: reads env var, falls back to default.
  `getAllFlags()`: snapshot of all current values for health/debug endpoints. No hardcoded booleans.

- `src/lib/product-registry.ts`: Central registry for all TecPey products.
  `Product` type (id, slug, displayName, description, requiredPermission, featureFlag, isEnabled()).
  `PRODUCTS` record with 6 entries: exchange, academy, social, mentor, knowledge, marketplace.
  `getEnabledProducts()`: filters by live feature flag. `getProductBySlug()`: reverse-lookup by URL slug.

- `src/lib/permission.ts`: Unified permission layer replacing scattered ad-hoc checks.
  `ROLE_PERMISSIONS` map: admin→`["*"]`, moderator→social+academy, teacher→academy+mentor,
  student→academy+mentor+social, trader→exchange+academy, support→admin view+academy+social,
  guest→view-only. `resolveRoles(session)`: derives Role[] from CanonicalSession claims.
  `matchesGrant()`: supports wildcard (`*`), product-wildcard (`product.*`), and exact match.
  `permission(session)` factory returns `PermissionContext`: `can(action)`, `require(action)`,
  `hasRole(role)`, `hasFeature(flag)`, `roles`. `require()` returns `null | NextResponse` for
  guard-return pattern.

- `src/lib/route-guards.ts`: Unified guard functions for route protection.
  `requireTenant(session)`: 401 for fully unauthenticated, null otherwise (forward-compatible hook).
  `requireRole(session, role)`: 403 if session lacks role.
  `requirePermission(session, action)`: 403 if action not in role grants.
  `requireFeature(flag)`: 403 with `feature_disabled` code if flag is off.
  All return `NextResponse | null` for the guard-return pattern.

### Updated — Existing Libraries

- `src/lib/unified-session.ts`: Removed local `shouldUseSecureCookie()` and `cookieMaxAge()`.
  Now imports from `platform-config`. Re-exports `UNIFIED_SESSION_COOKIE = COOKIES.SESSION`
  for backward compatibility with all existing importers.

- `src/lib/academy-session.ts`: Imports `COOKIES` from `platform-config`.
  Removed dead exports: `signStudentSession`, `setStudentSessionCookie`,
  `getStudentSessionFromServerCookies`, local `shouldUseSecureCookie`.
  Retained: `isSessionConfigured`, `verifyStudentSessionToken`, `getStudentSessionFromRequest`,
  `clearStudentSessionCookie` (used by logout handler).

- `src/lib/academy-auth.ts`: Imports `COOKIES` from `platform-config`.
  Removed dead exports: `signAcademyAuthSession`, `setAcademyAuthCookie`,
  local `shouldUseSecureCookie`.
  Retained: `isAcademyAuthConfigured`, `verifyAcademyAuthToken`, `getAcademyAuthFromRequest`,
  `clearAcademyAuthCookie`, helper normalizers (`normalizeAcademyEmail`, `normalizeAcademyUsername`,
  `academyAccountIdFromEmail`).

- `src/lib/auth-session.ts`: Imports `COOKIES` from `platform-config`.
  Removed local `COOKIE_ACADEMY_AUTH`, `COOKIE_STUDENT_SESSION`, `COOKIE_USER_SESSION` constants
  (were only used internally — no external callers confirmed by grep).
  Removed dead `isAnyAcademySession` export (zero external callers).
  Retained: `CanonicalSession` type, `getCanonicalSession()`.

### Deleted

- `src/lib/db-schema.ts`: Entirely `@deprecated` file with zero external callers (confirmed by grep).
  Contained `initSchema()` which imported `ensureStudentCartaxTables`, `ensurePhase5Tables`,
  `ensureCertificateTables` — all superseded by the Phase 22 migration runner. 334 lines removed.

### QA

- `npm run typecheck`: 0 errors
- `npm run lint`: 0 warnings, 0 errors
- `npm run build`: ✓ 292 pages, 7.0s, Proxy (Middleware) registered

---

## [v0.23] — 2026-06-28 — Legacy Cookie Retirement, API Standardization & CSP

### Security — Cookie Retirement

- Stopped issuing `tecpey_academy_auth` and `tecpey_student_session` legacy cookies on new logins.
  Only `tecpey_session` (unified JWT) is set on login/register since Phase 23.
- `getStudentSessionFromRequest()` and `getAcademyAuthFromRequest()` retain read-only fallback:
  check legacy cookie first, then fall back to unified cookie — existing browser sessions continue
  to work until their 30-day JWT expires.
- Logout still clears all three cookies (`clearStudentSessionCookie`, `clearAcademyAuthCookie`,
  `clearUnifiedSessionCookie`) to clean browsers holding legacy cookies.
- `academy-student-profile/route.ts`: removed `signStudentSession` + `setStudentSessionCookie` calls.
- `academy-auth/route.ts`: removed `signAcademyAuthSession` + `setAcademyAuthCookie` calls.

### Security — Content Security Policy

- Deleted `src/middleware.ts` (deprecated in Next.js 16).
- Created `src/proxy.ts` (Next.js 16 proxy convention, `export async function proxy(request)`).
- Per-request nonce via `Buffer.from(crypto.randomUUID()).toString("base64")`.
- CSP set on both request (`x-nonce` header) and response (`Content-Security-Policy` header).
- Directives: `default-src 'self'`, `script-src 'self' 'nonce-{n}' 'strict-dynamic'`,
  `style-src 'self' 'unsafe-inline'` (required: inlineCss + React SSR style attrs),
  `img-src 'self' data: blob: https:`, `font-src 'self' data:`,
  `connect-src 'self' https: wss: ws:`, `media-src 'none'`, `object-src 'none'`,
  `frame-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `upgrade-insecure-requests`. Dev adds `'unsafe-eval'` for React DevTools only.

### API Standardization

- Converted all remaining 14 `NextResponse.json()` calls to `apiOk()` / `apiError()` / `apiRateLimited()`.
  Routes: `ai-mentor` (6 calls), `crypto-news` (2), `mentor-conversations` (1), `mentor-insights` (1),
  `mentor-memory` (1), `mentor-profile/recompute` (2), `academy-specialized-lead` (1).
- Final remaining `NextResponse.json` count in API routes: **0**.

### QA

- `npm run typecheck`: 0 errors
- `npm run lint`: 0 warnings, 0 errors
- `npm run build`: ✓ 292 pages, Proxy (Middleware) registered

---

## [v0.22] — 2026-06-28 — Enterprise Identity and Migration Foundation

### Added — Unified Authentication

- `src/lib/unified-session.ts`: Single JWT cookie (`tecpey_session`) signed with
  `TECPEY_SESSION_SECRET`. Carries `accountId`, `studentId`, `email`, `displayName`,
  `username` in one `HttpOnly`, `SameSite=lax` cookie. Replaces the 3-cookie split.
- `src/lib/auth-session.ts`: `getCanonicalSession()` — reads unified cookie first,
  falls back to legacy 3-cookie system for backward compatibility with existing sessions.
- `academy-auth/route.ts`: Login issues unified cookie alongside legacy cookies.
  Logout clears all 4 cookies (`tecpey_academy_auth`, `tecpey_student_session`,
  `tecpey_session`, legacy `tecpey_student_id`).
- `academy-student-profile/route.ts`: Unified cookie re-issued to include `studentId`
  when a student profile is created or loaded.

### Added — Migration Runner

- `src/lib/db-migrate.ts`: Inline migration runner. Replaces ad-hoc `initSchema()`.
  Tracks applied migrations in `_migrations` table with SHA-256 checksums.
  Transaction-wrapped with ROLLBACK on failure. Idempotent via `CREATE TABLE IF NOT EXISTS`.
  Safe for serverless deployments (no filesystem access at runtime).

### Updated — API Standardization (Phase 22 batch)

- 20+ API routes converted from raw `NextResponse.json()` to `apiOk()` / `apiError()` /
  `apiRateLimited()`: `ai-mentor`, `career`, `challenges`, `command-center/*`,
  `community/*`, `device-token`, `health/*`, `learning-events`, `mentor-*`,
  `notification-brain`, `notifications/*`, `offline-sync`, `trading-arena`.

### QA

- `tsc --noEmit`: 0 errors
- `eslint`: 0 warnings
- Build: 292 pages pass

---

## [v0.21] — 2026-06-28 — Enterprise Security and API Hardening

### Added — CSRF Defense-in-Depth

- `academy/auth/login/route.ts`: Added `verifyCsrfOrigin()` check at the wrapper level
  (defense-in-depth — previously checked only inside the canonical handler).
- `academy/auth/register/route.ts`: Same CSRF guard added.

### Updated — Structured Logging Migration

- `src/lib/db.ts`: All `console.error` calls replaced with `logger.error`.
- `src/lib/auth-session.ts`: `console.error` → `logger.error` (2 calls).
- `src/lib/csrf.ts`: `console.error` → `logger.error`.
- `src/lib/mentor-events.ts`: Console calls replaced with structured logger.
- `src/lib/rate-limit.ts`: Warning logging migrated to `logger.warn`.
- `src/lib/api.ts`: Console calls migrated to `logger`.
- Zero production `console.*` remaining in `src/lib/` after this phase.

### Added — Security Headers

- `next.config.ts`: Added security header suite: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options`, `X-DNS-Prefetch-Control`, `Referrer-Policy`,
  `Permissions-Policy`, `Strict-Transport-Security` (2-year HSTS with preload),
  `X-XSS-Protection: 0` (disables legacy auditor per OWASP).

### Updated — Health Endpoint

- `/api/health`: Added Redis ping check (ok / unavailable / unconfigured),
  `version` (npm package version), `environment` (NODE_ENV), structured `checks` object.
  Status becomes `"degraded"` when Redis is unavailable.

### Updated — QA Infrastructure

- `package.json`: Added `"typecheck": "tsc --noEmit"` script for CI and local use.

### QA

- `tsc --noEmit`: 0 errors
- `eslint`: 0 warnings
- Build: 292 pages pass

---

## [v0.20] — 2026-06-28 — Production Readiness and Engineering Foundation

### Added — Database Migration Reference

- `migrations/0001_initial_schema.sql`: Complete schema snapshot for reference.
  Documents all tables created by the Phase 1–18 `initSchema()` calls.
- `migrations/README.md`: Migration rules, numbering convention, and runner plan.

### Added — Observability

- `src/lib/logger.ts`: Structured JSON logger. Fields: `ts` (ISO timestamp),
  `level`, `msg`, plus arbitrary context fields. Server-side only.

### Added — API Validation Helpers

- `src/lib/api-validation.ts`: `apiOk()`, `apiError()`, `apiRateLimited()`,
  `Validate.*`, `checkBodySize()` — shared response builders for API routes.

### Added — Community Career Tables

- `src/lib/db-schema.ts`: Added `academy_public_profiles`,
  `academy_professional_challenges`, `academy_challenge_progress` tables.

### Updated — CI and Engineering Constraints

- `.github/workflows/ci.yml`: Added npm version gate (major version must be 10).
- `package.json`: Set `engines.npm` to `>=10.0.0 <11.0.0` to prevent npm 11
  regenerating the lockfile with incompatible `libc` fields.

### QA

- `tsc --noEmit`: 0 errors
- `eslint`: 0 warnings
- Build: 292 pages pass

---

## [v0.19] — 2026-06-28 — Architecture Vision Refactor and Enterprise Planning

Architecture-only phase. Zero feature changes. Zero UI changes.

### Added — Strategic Documentation

Full audit of Phases 0–18 produced 9 planning documents:

- `docs/ARCHITECTURE_REVIEW.md`: 10-domain audit, 30+ findings, scorecard.
  Identified 5 critical gaps: localStorage as source of truth, no migration system,
  3-cookie auth split, no tenant model, zero observability.
- `docs/TECHNICAL_DEBT_REPORT.md`: Complete debt inventory with fix strategies.
- `docs/VISION_v2.md`: 12-pillar platform vision superseding v1.
- `docs/MASTER_ROADMAP_v2.md`: Phases 0–40 with dependencies, QA gates, rollback plans.
- `docs/PLATFORM_BLUEPRINT_v2.md`: Target identity, tenant, API, DB, and AI design.
- `docs/WHITEPAPER_STRUCTURE_v2.md`: Platform architecture and strategy whitepaper outline.
- `docs/DEPENDENCY_MAP.md`: Module graph, circular dependency analysis, localStorage chains.
- `docs/FUTURE_MODULES.md`: 18 future modules with data models and APIs.
- `docs/PHASE19_REPORT.md`: Final audit report with migration plan and risk matrix.

### QA

- `tsc --noEmit`: 0 errors
- `eslint`: 0 warnings
- Build: 292 pages pass

---

## [v0.18] — 2026-06-28 — Community & Social Learning Layer

### Added — Core Library

- `src/lib/community-profile.ts`: Privacy-first community profile. Interface: `CommunityPrivacySettings` (all defaults private/false), `CommunityProfile` (displayName, anonymousId, avatarInitials, privacy, groupInterests). Functions: `loadCommunityProfile()`, `saveCommunityProfile()`, `createCommunityProfile()` (generates anonymous ID `T-XXXXXX`), `updatePrivacy()`, `addGroupInterest()`, `removeGroupInterest()`, `sanitizeDisplayName()` (strips PII patterns). Storage: `tecpey-community-profile`.

- `src/lib/community-challenges.ts`: 5 weekly challenges cycling via `getCurrentWeekNumber() % 5`. Types: `ChallengeDifficulty`, `ChallengeFocus`, `Challenge`, `ChallengeParticipation`, `ChallengeCompletionCriteria` (union of 4 types). Functions: `getCurrentChallenge()`, `getNextChallenge()`, `loadParticipation()`, `joinChallenge()`, `markChallengeComplete()`. Label tables: `DIFFICULTY_LABEL`, `FOCUS_LABEL`. Storage: `tecpey-challenge-participation`.

- `src/lib/community-leaderboard.ts`: Behavioral-only leaderboard (profit ranking forbidden). Type: `LeaderboardCategory` (6 categories), `LeaderboardEntry`, `MyLeaderboardScores`. Functions: `computeMyLeaderboardScores()` (reads arena + behavioral engine, never uses P&L), `getLeaderboard()` (blends real score with 12 deterministic LCG demo peers), `generateDemoPeers()` (stable per category, seeded by name). Exports: `CATEGORY_LABEL`, `CATEGORY_DESCRIPTION`, `COMMUNITY_SAFETY_RULES` (7 rules).

- `src/lib/community-groups.ts`: 5 static demo study groups. Interface: `StudyGroup` (name, level, focusTopic, memberCount, weeklyGoal, progressSummary, groupChallenge, disciplineScore, isDemo). Groups: bitcoin-basics, risk-masters, psychology, behavioral-discipline, advanced-analysis. Labels: `LEVEL_LABEL`.

### Added — Components

- `src/components/academy/community/CommunityHub.tsx`: Main community hub. Sub-components: `ProfileSetup` (name input + privacy explanation), `MyScoreWidget` (5 dimension mini-scores), `ActiveChallengeCard` (current week challenge + join button), `NavTile` (route cards for 5 sub-sections), `SafetyRules` (expandable 7-rule list). Default-private messaging throughout.

- `src/components/academy/community/LeaderboardView.tsx`: Anti-profit leaderboard. Sub-components: `ScoreBar` (gradient for self, muted for others), `LeaderboardRow` (rank, avatar, name, demo badge, score bar), `MyScoreBreakdown` (5 dimension breakdown with weights), `LeaderboardView` (6 category tabs, anti-profit disclaimer, skeleton when no profile, safety rules footer). Demo peers labeled `نمایشی`.

- `src/components/academy/community/ChallengeCenter.tsx`: Weekly challenge UI. Sub-components: `checkChallengeCompletion()` (reads arena state + journal rate), `ActiveChallengePanel` (rules, scoring, reward, responsible trading note, join/check/complete buttons), `ChallengeHistoryCard` (past challenge status), `ChallengeCenter` (progress bar, active challenge, next week preview, history).

- `src/components/academy/community/StudyGroups.tsx`: Study group interest system. Sub-components: `GroupCard` (name, level, members, discipline score, focus/goal/challenge fields, interest button), `PrivacyGate` (opt-in gate for studyGroupInterest), `StudyGroups` (privacy gate → interest management → group cards). No chat, no DMs.

- `src/components/academy/community/PeerJournals.tsx`: Opt-in journal sharing. Functions: `sanitizeForSharing()` (strips PII, truncates, adds mentor note), `buildMentorNote()` (behavioral flag → coaching message). Sub-components: `SharedEntryCard` (asset, setup, mistake tags, lesson, mentor note), `SharingToggle` (opt-in/out with aria role=switch), `PeerJournals` (toggle + sanitized entries + 3 demo entries). Default off.

- `src/components/academy/community/InstructorDashboard.tsx`: Consent-gated instructor view. Sub-components: `ConsentGate` (explicit list of shared/not-shared data), `MetricBlock`, `WeakTopicsList` (knowledge-graph nodes not yet completed), `RiskPatternBar`, `InstructorDashboard` (profile → consent → `ConsentedView`), `ConsentedView` (6-metric grid, weakest/strongest dims, risk pattern bars, weak topics).

### Added — Routes

- `src/app/academy/community/page.tsx` — Updated: adds `CommunityHub` below existing `CommunityCareerPanel`
- `src/app/academy/community/leaderboards/page.tsx` — `LeaderboardView`
- `src/app/academy/community/challenges/page.tsx` — `ChallengeCenter`
- `src/app/academy/community/groups/page.tsx` — `StudyGroups`
- `src/app/academy/community/journals/page.tsx` — `PeerJournals`
- `src/app/academy/community/instructor/page.tsx` — `InstructorDashboard`

### Added — Documentation

- `docs/COMMUNITY_LEARNING_LAYER.md`: Full spec — privacy model, leaderboard anti-profit formulas, challenge criteria, study group architecture, journal sanitization, instructor consent flow, Phase 19 migration path.
- `docs/REWARD_SYSTEM.md`: Phase 18 section — community challenge XP bonuses, anti-gaming rules.
- `docs/TRADING_DNA_MODEL.md`: Phase 18 section — community leaderboard integration, excluded signals (winRate, avgPnlPct, totalPnl).
- `docs/MENTOR_AI_MODEL.md`: Phase 18 section — Instructor Dashboard architecture, consent stages, shared vs. not-shared data table, privacy boundaries.

### QA

- `npx tsc --noEmit`: 0 errors
- `npm run lint`: 0 errors, 0 warnings
- `npm run build`: Pass — all 6 community routes build as dynamic server routes

---

## [v0.17] — 2026-06-27 — Trading Arena V2: Behavioral Trading Simulator

### Added — Core Library

- `src/lib/trading-arena.ts`: Complete paper-trading engine. Types: `OpenPosition`, `ClosedTrade`, `PendingOrder`, `TradingArenaState`, `MentorFlag`. Functions: `createFreshArenaState()`, `loadArenaState()`, `saveArenaState()`, `executeMarketBuy()` (with slippage ±0.05%), `closePosition()`, `addLimitOrder()`, `cancelLimitOrder()`, `processPriceTick()` (fills limit orders + checks SL/TP), `computeUnrealizedPnl()`, `computeNetEquity()`, `computeArenaStats()`, `resetArenaState()`. Mentor flag detection at trade open: `no-stop-loss`, `over-risk`, `impulse-entry`, `revenge-trade`, `good-discipline`, `proper-sizing`, `target-hit`, `fomo-entry`. Fee: 0.1% per side. Max positions: 5. Storage: `tecpey-trading-arena`.

- `src/lib/trading-scenarios.ts`: 6 production scenarios with deterministic LCG/custom price sequences. Each scenario includes: objective, marketContext, concept, allowedActions, initialBalance, priceSequence, successCriteria, failureCriteria, mentorFeedback (pass/fail headline + body + keyLesson), dnaImpact (6 behavioral dimensions). Scenarios: `beginner-btc` (interface basics), `volatility` (patience under swings), `fomo-scenario` (FOMO resistance — success = zero trades), `revenge-trading` (revenge control), `risk-management` (stop-loss discipline), `news-reaction` (event-driven decision quality).

- `src/lib/trading-journal.ts`: Trade journal storage. Types: `EmotionalState` (6 states), `MistakeTag` (10 tags), `JournalEntry`. Functions: `createJournalEntry()`, `loadJournal()`, `saveJournalEntry()`, `completeJournalEntry()`, `getJournalCompletionRate()`. Persian label tables: `EMOTIONAL_STATE_LABEL`, `MISTAKE_TAG_LABEL`. Storage: `tecpey-trading-journal`.

- `src/lib/trading-dna.ts`: Trading DNA behavioral signal extraction. `collectTradingDNASignals()` reads arena state + journal and produces: stopLossRate, overRiskRate, revengeTradeRate, impulseRate, journalCompletionRate, winRate, targetHitRate, scenariosCompleted, scenariosPassed, avgPnlPct. Scorer functions: `tradingRiskScore()`, `tradingPatienceScore()`, `tradingFOMOScore()`, `tradingRevengeScore()`, `tradingReflectionScore()`, `tradingDecisionScore()`. `blendWithTrading()` weights trading data 0%→40% as trades accumulate (0→10+ trades).

### Updated — Behavioral Engine

- `src/lib/behavioral-engine.ts`: Added `trading: TradingDNASignals` to `RawInputs`. `collectInputs()` now calls `collectTradingDNASignals()`. 7 dimension scorers now blend learning + trading signals: `scoreDisipline`, `scorePatience`, `scoreRiskManagement`, `scoreReflection`, `scoreFomoRisk`, `scoreRevengeRisk`, `scoreDecisionQuality`. Zero-safe: when no trading data exists, blend weight is 0% (full backward compatibility with Phase 16 behavior).

### Added — Components

- `src/components/academy/trading-arena/TradingArenaDashboard.tsx`: Main arena UI. Sub-components: `useSimulatedPrices` (±0.12%/2s random walk, BTC seed $65k, ETH seed $3.5k), `JournalModal` (pre-trade plan + emotional state modal), `TradeForm` (asset + order type + amount + SL/TP), `PositionRow` (live P&L, close button, SL warning), `TradeRow` (closed trade history), `MentorFlagBadge` (colored flag display), `TradingArenaDashboard` (main). Safety disclaimer always visible. Mentor flag analysis box with warning messages. Balance / equity / stats row. Reset with confirm gate.

- `src/components/academy/trading-arena/ScenarioPlayer.tsx`: Complete scenario experience. Sub-components: `PriceSparkline` (SVG line chart of scenario price history), `ScenarioCard` (list item with pass/fail badge + start button), `ActiveScenario` (briefing → trading → result phases with timer, SL/TP checking, success/failure evaluation, mentor feedback, DNA impact grid), `ScenarioList` (main with progress bar). All 6 success/failure evaluation modes implemented.

- `src/components/academy/trading-arena/JournalView.tsx`: Trade journal UI. Sub-components: `PostTradeForm` (reflection + mistake tags + lesson learned), `JournalEntryDetail` (expandable entry with pre/post sections), `MistakePatternSummary` (horizontal bar chart of most frequent mistakes), `JournalView` (main with stats row, pending reflections first, completed entries). Education note footer.

### Added — Routes

- `src/app/academy/trading-arena/page.tsx` — `/academy/trading-arena`
- `src/app/academy/trading-arena/scenarios/page.tsx` — `/academy/trading-arena/scenarios`
- `src/app/academy/trading-arena/journal/page.tsx` — `/academy/trading-arena/journal`

### Updated — Documentation

- `docs/TRADING_SIMULATOR_SPECIFICATION.md` — v2.0, Phase 17 implementation summary
- `docs/TRADING_DNA_MODEL.md` — v2.0, signal collection and blending implementation details

### Safety and Responsible Trading

- "Simulated trading" banner on every route (cannot be dismissed)
- No profit guarantees anywhere in the UI
- Mentor feedback always educational, never financial advice
- Security disclaimer in JournalView footer
- Mentor flag system warns on over-risk, no-stop-loss, revenge trades, FOMO entries
- FOMO scenario's correct answer is "zero trades" — explicitly anti-gambling

### QA Results

- TypeScript: ✓ 0 errors
- ESLint: ✓ 0 errors, 0 warnings
- Build: ✓ PASS (287 pages generated, +3 new routes)

**Tag:** `v0.17-trading-arena-v2`

---

## [v0.16] — 2026-06-27 — AI Mentor V2: Behavioral Intelligence Engine

### Added — Behavioral Engine Libraries

- `src/lib/behavioral-engine.ts`: Client-side behavioral intelligence. Computes 12 behavioral dimensions from localStorage (academy-progress + spaced-repetition + reflection entries): Discipline, Patience, Risk Management, Consistency, Reflection, Confidence, FOMO Risk, Revenge Risk, Preparation, Knowledge Depth, Decision Quality, Execution Quality. Each score includes: value 0–100, trend (up/down/stable/new), Persian explanation, evidence items, action suggestion. `loadOrComputeSnapshot()` with 5-minute localStorage cache. `DIMENSION_LABELS` and `DIMENSION_DESCRIPTIONS` lookup maps. No network calls — pure computation.

- `src/lib/knowledge-graph.ts`: Static topic prerequisite graph for Term 1 concepts (13 concept nodes, 14 prerequisite edges). Functions: `findAllPrerequisites()` (BFS traversal), `getConceptRecommendations()` (returns prioritized review recommendations when a student fails), `getConceptStatusMap()` (mastered vs. weak based on lesson scores). If student fails `scarcity-vs-price`, automatically recommends reviewing `bitcoin-supply` first.

- `src/lib/smart-review.ts`: Adaptive review scheduler combining SM-2 due cards + low-score lesson retries + knowledge graph prerequisite recommendations + missing reflections + next unstarted lesson. Returns `SmartReviewQueue` with priority-sorted items, estimated minutes, due flashcard count. Deduplicates by item ID. `buildSmartReviewQueue()` operates purely from localStorage.

- `src/lib/coaching-engine.ts`: Deterministic coaching generation — no AI API calls. Generates daily, weekly, and monthly coaching cards from behavioral snapshots. Each card includes: headline, body, why, evidence, suggestedAction, expectedImprovement, focusDimension, tone (celebrate/encourage/challenge/warn). Also generates: `generateWarnings()` (critical/important/advisory), `generateEncouragements()` (positive reinforcement), `generateReviewReminder()`. All output in Persian. Full content table for all 12 dimensions (`DIMENSION_COACHING`).

### Added — AI Mentor V2 API

- `src/app/api/ai-mentor-v2/route.ts`: Anthropic Claude API integration for behavioral coaching. CSRF-protected, rate-limited (10 req/min). Injects full behavioral context (overall score, weakest/strongest dimension, learning velocity, style, top warnings) into Claude system prompt. Sensitive data filter (Seed Phrase, private keys). Falls back to local message gracefully when `ANTHROPIC_API_KEY` is absent. Supports `claude-haiku-4-5-20251001` as default model (configurable via `ANTHROPIC_MENTOR_MODEL`). No streaming required — synchronous JSON response.

### Added — Academy V2 Components

- `src/components/academy/v2/LearningInsightsDashboard.tsx`: Premium learning insights dashboard. Components: `RadarChart` (SVG polygon, 8 behavioral dimensions), `XpProgressBar` (animated gradient progress bar), `StudyCalendar` (30-day activity heatmap), `KnowledgeMapViz` (concept nodes by lesson, color-coded mastered/weak/pending), `ProjectionCard` (completion %, graduation ETA, scholarship probability, prop qualification probability), `DimensionBar` (all 12 dimensions with trend arrows), `ReviewQueueWidget` (smart review queue with type icons). Full daily coaching card. 5-minute client-side initialization via `useRef(initialized)`. RTL layout, ARIA labels, responsive grid.

- `src/components/academy/v2/MentorV2.tsx`: Behavioral coaching interface. NOT a chatbot. Shows: overall behavioral score with strongest/weakest dimensions, daily/weekly/monthly coaching tabs (expandable with why/evidence/action/improvement), behavioral score grid (12 score pills with trend icons), weakest-dimension focus card with action, smart review queue (prioritized items with type icons), warnings (critical/important), encouragements, and "Ask Mentor" section (calls `/api/ai-mentor-v2` with full behavioral context injection, handles errors gracefully, security disclaimer). No chatbot scroll, no history list — focus on behavioral coaching.

### Added — Routes

- `src/app/academy/mentor-v2/page.tsx` — `/academy/mentor-v2` with canonical metadata
- `src/app/academy/insights/page.tsx` — `/academy/insights` with canonical metadata

### Updated

- `.env.example`: Added `ANTHROPIC_API_KEY` and `ANTHROPIC_MENTOR_MODEL` entries

### Architecture

- Behavioral engine: fully client-side (no DB, no API). Works immediately for all users.
- Knowledge graph: static (no DB). Enables automatic prerequisite recommendations.
- Coaching engine: deterministic (no AI). Generates consistent, evidence-based coaching.
- AI API: used only when student explicitly asks a question. Falls back gracefully.
- All new components: RTL, keyboard-accessible, ARIA-labeled, responsive.

### QA Results

- TypeScript: ✓ 0 errors
- ESLint: ✓ 0 errors, 0 warnings
- Build: ✓ PASS (284 pages generated, +2 new routes)

**Tag:** `v0.16-ai-mentor-v2`

---

## [v0.15] — 2026-06-27 — Academy V2: World-Class Learning Experience

### Added — Learning Engine Libraries
- `src/lib/spaced-repetition.ts`: Complete SM-2 algorithm implementation (SuperMemo 1987 — Peter Wozniak). Types: `CardState`, `ReviewGrade`. Core functions: `createCard()`, `reviewCard()`, `isDue()`, `getDueCards()`, `daysUntilReview()`. Deck persistence: `loadDeck()`, `saveDeck()`, `upsertCard()`, `ensureCards()`. Storage key: `"tecpey-sr-deck"`.
- `src/lib/academy-progress.ts`: Progress Engine — XP, streak, level (12 levels, 0–39,000 XP), lesson completion, module scores, term status, badges. Functions: `awardXp()`, `recordLessonComplete()`, `recordModuleScore()`, `passTerm()`, `awardBadge()`, `isLessonUnlocked()`, `onProgressChange()`. Custom event `"tecpey-academy-progress-updated"` for reactive UI. Storage key: `"tecpey-academy-progress-v2"`.

### Added — Curriculum Data
- `src/data/academy/term1Curriculum.ts`: Enriched Term 1 data with full TypeScript types (`Term`, `Module`, `Lesson`, `QuizQuestion`, `Flashcard`, `LessonSection`, `PracticeExercise`). 1 module, 3 fully authored lessons (درس ۱: پول و اعتماد; درس ۲: بیت‌کوین؛ درس ۳: بلاکچین). Each lesson contains: learning objectives, content sections with callouts, in-lesson knowledge checks (SM-2-graded), flashcards with front/back/example/relatedTerms, key takeaways, mentor note, practice exercise (checklist/reflection/scenario), reflection prompt, responsible trading insert, next lesson teaser. 10-question module quiz with multi-type questions. Helper functions: `extractFlashcardIds()`, `getLessonById()`, `isLessonAccessible()`.

### Added — Academy V2 Components
- `src/components/academy/v2/QuizEngineV2.tsx`: Multi-type quiz engine with mastery gate. Supported types: `single`, `multi`, `ordering` (drag-and-drop), `matching`, `fillblank`, `scenario`. Features: immediate post-answer feedback with explanation, progress bar with live %, timer, difficulty labels, ARIA labels throughout. Grading: `gradeAnswer()` handles all types including partial credit for matching. State managed via `useReducer`. Configurable pass threshold (default: 80% knowledge-check, 75% module, 70% term exam), retake cooldown, review CTA. Result screen shows pass/fail with elapsed time.
- `src/components/academy/v2/FlashcardDeck.tsx`: SM-2 flashcard component. Card flip animation with front (question) / back (answer + example). Touch swipe support (right = easy grade 5, left = hard grade 1). Grade buttons: 4 levels (نمی‌دانستم/سخت/خوب/آسان → SM-2 grades 1/3/4/5). Due-only mode and study-all mode. Session stats (reviewed, easy, medium, hard, again). Awards `XP_TABLE.FLASHCARD_SESSION` XP once per day. Session complete screen with stats. Empty state when no cards due. Related terms display. Full ARIA accessibility.
- `src/components/academy/v2/LessonPlayerV2.tsx`: Full production lesson player. 4-phase flow: `reading → knowledge-check → flashcards → quiz → complete`. Reading phase: lesson header (title, objectives, meta tags), scrollable content with live scroll progress bar, section content renderer, callout component (warning/tip/important/responsible), key takeaways, collapsible mentor note, practice exercise panel (checklist with completion feedback), reflection journal (localStorage saved), responsible trading card. XP progress widget (reactive to progress events). Knowledge-check phase: QuizEngineV2 at 80% threshold. Flashcard phase: FlashcardDeck in study-all mode. Quiz phase (mastery gate): 80% required. Complete phase: trophy screen, XP display, next-lesson CTA, reflection prompt, responsible trading reminder.
- `src/components/academy/v2/LessonPlayerV2Client.tsx`: Thin client wrapper — wires `useRouter` for next-lesson navigation.
- `src/components/academy/v2/FlashcardsPageClient.tsx`: Daily flashcard hub with due-count/total stats, two modes (mрови امروز / مرور همه), counts from live SM-2 deck.

### Added — Routes
- `src/app/academy/learn/[termSlug]/[lessonIndex]/page.tsx`: Individual lesson page with `generateStaticParams()` (pre-generates all Term 1 lessons), `generateMetadata()`, notFound() on invalid slugs.
- `src/app/academy/flashcards/page.tsx`: Daily flashcard review page with canonical metadata.

### Learning Science Implemented
- **Active Recall**: Every lesson ends with mastery-gated quiz
- **Spaced Repetition**: SM-2 algorithm with exact SuperMemo 1987 EF formula
- **Immediate Feedback**: Explanation shown after every answer
- **Mastery Learning**: 80% gate — lesson locked until passed
- **Retrieval Practice**: Knowledge checks mid-lesson before quiz
- **Micro Learning**: 8–10 min lessons, single concept focus
- **Reflection**: Per-lesson reflection journal saved to localStorage
- **Responsible Trading**: Insert in every lesson and completion screen

### QA Results
- TypeScript: ✓ 0 errors
- ESLint: ✓ 0 errors, 0 warnings
- Build: ✓ PASS (282 pages generated)

**Tag:** `v0.15-academy-v2`

---

## [v0.14] — 2026-06-27 — Global Academy Strategy & Educational Constitution

### Added — Strategic Documents (10 documents, 4,247 lines)
- `docs/ACADEMY_COMPETITIVE_BENCHMARK.md`: Benchmarks 17 global/Iranian competitors; extracts principles; defines TecPey's gap
- `docs/ACADEMY_EDUCATIONAL_STANDARD.md`: Binding educational constitution — learning science, content standards, assessment rubrics, certification criteria, ethics, privacy
- `docs/ACADEMY_CURRICULUM_BLUEPRINT.md`: Complete 7-term curriculum + 3 advanced tracks + TCP/TCM professional track
- `docs/LEARNING_EXPERIENCE_GUIDE.md`: Lesson design, flashcard SM-2, spaced repetition, revision mode, streak, motivation architecture
- `docs/TRADING_SIMULATOR_SPECIFICATION.md`: Trading Arena full spec — real feeds, journal, scenario training, discipline-weighted leaderboard, replay mode
- `docs/MENTOR_AI_MODEL.md`: AI Mentor architecture — behavioral analysis, Socratic coaching, emotional detection, weekly/monthly reports
- `docs/TRADING_DNA_MODEL.md`: Proprietary 12-dimension behavioral competence framework with weighted composite scoring
- `docs/REWARD_SYSTEM.md`: XP, levels, badges, scholarships, prop qualification pathway, fraud prevention
- `docs/GLOBAL_STRATEGY.md`: 3-phase expansion (Iran → Middle East → Global) with language, localization, and compliance frameworks
- `docs/TECPEY_UNFAIR_ADVANTAGE.md`: Product differentiation — why TecPey exists and what no competitor provides

### Changed
- `README.md`: Bilingual (fa/en), Academy structure table, complete strategic docs index, updated roadmap through Phase 20, CI badge added

**Tag:** `v0.14-academy-strategy`

---

## [v0.13.5] — 2026-06-27 — Enterprise QA Stabilization and CI Readiness

### Fixed
- `package-lock.json`: synchronized with `package.json` to resolve `npm ci` failure in GitHub Actions (`@swc/helpers@0.5.23` mismatch)
- `src/app/crypto/[symbol]/page.tsx`: removed unused `Navbar` import (ESLint `no-unused-vars`)
- `src/components/academy/AiMentorExperience.tsx`: removed unused `useMemo` import (ESLint `no-unused-vars`)
- `src/components/academy/AcademyCertificatesClient.tsx`: replaced `<img>` with `<Image>` from `next/image` for QR code display; removed stale `eslint-disable-next-line` comment

### Changed
- `eslint.config.mjs`: rule tuning carried forward from Phase 13 sessions

### CI Workflow Fix
- `.github/workflows/ci.yml`: removed global `NODE_ENV=production` (caused `npm ci` to skip devDependencies, making `tsc` and `eslint` unavailable); scoped it to the Build step only
- `.github/workflows/ci.yml`: tightened ESLint gate to `--max-warnings 0` (was 130)

### QA Results
- ESLint: ✓ 0 errors, 0 warnings
- TypeScript: ✓ 0 errors
- Build: ✓ PASS (278 pages generated)
- `npm ci`: ✓ PASS
- GitHub Actions: ✓ PASS

**Tag:** `v0.13.5-enterprise-qa`

---

## [v0.13] — 2026-06-26 — Production Hardening

### Added
- `.github/workflows/ci.yml`: GitHub Actions CI — install, TypeScript, ESLint, build on every push and PR to `main`
- `src/app/global-error.tsx`: root-level production error boundary (replaces root layout on unhandled errors)
- `next.config.ts`: `headers()` — security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-DNS-Prefetch-Control) at Next.js level for defense-in-depth
- `next.config.ts`: `experimental.inlineCss: true` — inlines Tailwind CSS into HTML, eliminates render-blocking stylesheet request for first-time visitors
- `src/app/sitemap.ts`: 7 missing English pages added (`/en/swap`, `/en/business`, `/en/careers`, `/en/compare-exchanges`, `/en/listing`, `/en/media`, `/en/partners`)

### Changed
- `next.config.ts`: `poweredByHeader: false` — removes `X-Powered-By: Next.js` fingerprinting header
- `next.config.ts`: removed stale `experimental.cpus: 4` (undocumented in Next.js 16)
- `docs/Deployment.md`: updated Node.js version to 22.x; added CI/CD section
- `docs/Roadmap.md`: Phase 13 moved to Completed; Phase 14 promoted to next planned

**Tag:** `v0.13-production-hardening`

---

## [v0.12] — 2026-06-26 — Enterprise GitHub Foundation

### Added
- Professional `README.md` with full project documentation
- `LICENSE` (proprietary, TechnoPardakht)
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `docs/Architecture.md`
- `docs/Deployment.md`
- `docs/API.md`
- `docs/Branding.md`
- `docs/Roadmap.md`
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- GitHub remote configured and all branches/tags pushed

**Tag:** `v0.12-enterprise-foundation`

---

## [v0.11] — 2026-06-26 — Enterprise Visual Polish

### Changed
- Persian 404 page (`not-found.tsx`): full enterprise upgrade, all legacy CSS classes removed
- Persian About page (`about/page.tsx`): 15+ legacy class replacements with enterprise tokens
- `AcademyAuthClient.tsx`: password minimum validation updated to 10 characters (matches API)
- `PriceCardSkeletone.tsx`: replaced `bg-gray-600/50 animate-pulse` with `.skeleton` class
- `PriceTableSkeletone.tsx`: full enterprise skeleton refactor
- `ui/Skeleton.tsx`: enterprise `.skeleton` class, proper TypeScript props
- `ContentUI.tsx`: fixed invalid `bg-white/82` Tailwind value; ContentShell uses token-based dark mode

### Added
- `globals.css`: reduced-motion media query block for all animations
- `globals.css`: mobile safe-area inset utilities (`.pb-safe`, `.pt-safe`, `.sticky-cta-bar`)
- `globals.css`: horizontal table scroll utility (`.tp-table-scroll`)
- `globals.css`: unified form input class (`.tp-input`)
- `globals.css`: unified alert state classes (`.tp-alert-error/success/warn`)
- `globals.css`: unified badge system (`.tp-badge`, `.tp-badge-success/warn/error`)
- `globals.css`: empty state component class (`.tp-empty`)
- Mobile sticky CTAs now use `sticky-cta-bar` for iPhone notch support

**Tag:** `v0.11-enterprise-polish`

---

## [v0.10] — 2026-06-26 — Enterprise UI/UX Redesign

### Added
- Enterprise design system in `globals.css` (~200 lines): keyframes, skeleton, `.tp-card`, `.tp-btn-*`, `.tp-label`, `.tp-gradient-text`, focus rings, hover-lift, scrollbar, page transition
- `src/app/en/layout.tsx`: LTR wrapper for English subtree
- `src/app/en/not-found.tsx`: English 404 page
- English pages: `/en/about`, `/en/contact-us`, `/en/faq`, `/en/security`, `/en/fees` — full content parity with Persian equivalents
- `EnglishUI.tsx`: full rewrite with `EnglishShell`, `EnglishHero`, `EnglishCard`, `EnglishSectionLabel`, `EnglishCTA`

### Changed
- `TecpeyEnterpriseLanding.tsx`: hero CTAs updated to "ورود به صرافی" + "آکادمی رایگان" spec; MobileStickyCTA rebuilt as two equal-width buttons
- `EnglishLandingClient.tsx`: hero CTAs updated to "Enter Exchange" + "Enter Academy"; mobile sticky CTA added; stale import removed
- `HtmlLangDir.tsx`: `lang="en"` corrected to BCP 47 `"en-US"`
- `StructuredData.tsx`: added `@id` anchor to organization schema; fixed `inLanguage` to `["fa-IR", "en-US"]`

**Tag:** `v0.10-enterprise-ui`

---

## [v0.9.5] — QA Security & SEO Blockers (15 fixes)

### Security
- CSRF protection added to 20 previously unprotected state-changing API routes
- `csrf.ts`: fail-closed in production when `NEXT_PUBLIC_SITE_URL` is unset
- JWT secret fallback chain hardened — removed 4-env fallback, single secret per purpose
- Password minimum raised from 6 to 10 characters in API route
- Admin session shortened from 8 hours to 15 minutes

### SEO
- OG image paths made absolute everywhere (`https://tecpey.ir/images/...`)
- Breadcrumb fragment URL fixed (`/#academy` → `/academy`)
- Organization schema consolidated with `@id` anchor; duplicate removed from `page.tsx`
- `inLanguage` corrected to `["fa-IR", "en-US"]`

### Fixes
- `DATABASE_URL` logs clear error in production when missing or placeholder
- `/en/layout.tsx` created (LTR wrapper)
- `/en/not-found.tsx` created
- `TradingToolsClient.tsx` reformatted via Prettier

---

## [v0.1–v0.9] — Core Platform

### Included
- Next.js App Router architecture (Persian RTL primary)
- Academy: 7-term learning path, quizzes, term gates, progress tracking
- AI Mentor: context-aware educational prompt routing
- Trading Arena: practice simulator with discipline scoring
- Community career system: badges, hall of fame, career readiness
- Market board: real-time prices, swap, 50+ crypto dossiers
- Trader toolbox: 20+ analysis and risk tools
- Bilingual foundation: fa-IR + en-US routes
- SEO architecture: Schema.org, canonical URLs, structured data
- Footer, Navbar, authentication, onboarding flow
- Docker, Nginx, systemd deployment setup
