# Production Decisions — Phase 39.5 Final Governance Lock

**Date:** 2026-07-05  
**Phase:** 39.5 — Strategic Freeze & TecPey DNA Synchronization (Final Governance Lock)  
**Status:** Official — Irreversible or high-cost architectural decisions made for the launch window.  
**Purpose:** Every major architectural choice that will be difficult or expensive to reverse after Soft Launch must be explicit, justified, and have a documented future migration path. No implicit architecture.

**Rule:** If a decision is not recorded here, it was not consciously made.

---

## D-01 — Schema Management: Schema-on-Connect (No Production Migration Runner Wired for Launch)

**Decision:** Production will continue using `CREATE TABLE IF NOT EXISTS` on connection (`src/lib/db-schema.ts`) for the launch window. The existing migration runner (`src/lib/db-migrate.ts`) will not be the active production path at Soft Launch.

**Why:**
- Migration runner exists but was not wired or battle-tested in Phase 39.5.
- Current schema is stable; no breaking changes planned for Phase 40.
- Wiring and full validation would add risk and delay to the hardening timeline.

**Alternatives Rejected:**
- Wire migration runner immediately (rejected due to scope and testing time).
- Full manual schema management forever (rejected — this is temporary).

**Future Migration Path:**
- Phase 41: Wire `db-migrate.ts` as the authoritative path. Backfill `_migrations` table. Deprecate schema-on-connect for new environments.
- All Phase 40 schema changes must be additive only.

**Owner:** CTO + Platform Engineering Lead  
**Reversibility:** High cost after launch (manual schema drift cleanup).  
**Expiration:** Phase 41.

---

## D-02 — Academy State Storage: localStorage as Primary Until Phase 43

**Decision:** Academy progress, Trading DNA, trading journal, spaced repetition, behavioral profiles, community challenges, and smart review will remain localStorage-backed for the launch window.

**Why:**
- Server-side persistence migration is explicitly scoped to Phase 43.
- Moving even partial state to server in Phase 40 would require auth unification, DB schema work, and migration tooling not available in the current hardening window.
- Early users are expected to be power users who can tolerate browser-based storage.

**Alternatives Rejected:**
- Minimal server persistence for progress + certificates in Phase 40 (rejected — scope and timeline).
- Accept permanent localStorage (rejected — explicitly time-bounded).

**Future Migration Path:**
- Phase 43: Server-side persistence layer (SyncLayer abstraction). One-way migration from localStorage with user consent/export.
- User communication and warnings required at launch (see LAUNCH_ACCEPTED_RISKS.md R-01).

**Owner:** Chief Product Officer + Academy Director  
**Reversibility:** High user impact and data loss risk if not handled carefully later.  
**Expiration:** Phase 43.

---

## D-03 — Price / Market Data Source of Truth: Client-Side Only (No Independent Server Oracle at Launch)

**Decision:** Market prices displayed to users are provided entirely by client-side sources (TradingView widget + WebSocket). There is no server-side price feed or independent oracle at Soft Launch.

**Why:**
- Current architecture is client-side for display and charting.
- Building or integrating a reliable server-side price source was not in Phase 39.5/40 scope.
- Primary user base is Persian-speaking retail; tolerance for client-reported data issues is assumed higher in early phase.

**Alternatives Rejected:**
- Integrate external price oracle in Phase 40 (rejected — time and cost).
- Claim "live verified prices" without infrastructure (rejected — misleading).

**Future Migration Path:**
- Phase 45: Server-side price aggregation for critical pairs with independent health checks.
- Until then: explicit user disclaimers and client-reported health endpoint.

**Owner:** CTO + Chief Architect  
**Reversibility:** Medium — adding server source later is additive but changes trust model.  
**Expiration:** Phase 45.

---

## D-04 — Redis as Critical Infrastructure with No High-Availability at Launch

**Decision:** Redis (single instance or Upstash) is accepted as a single point of failure for withdrawal queues (BullMQ), nonce management, rate limiting coordination, and future order book state.

**Why:**
- Multi-region or highly available Redis was not scoped for launch.
- Current deployment is single-server or managed single-region.
- Degraded mode can be declared and tested.

**Alternatives Rejected:**
- Require HA Redis before Soft Launch (rejected — infrastructure cost and complexity).

**Future Migration Path:**
- Phase 45: Multi-AZ or multi-region Redis with failover. Circuit breakers and degraded-mode queues for withdrawals.
- Phase 40/41: Explicit degraded-mode behavior documented and tested.

**Owner:** SRE Lead + Wallet Engineer  
**Reversibility:** Medium — adding HA later is significant but non-breaking if queues are designed for it.  
**Expiration:** Phase 45.

---

## D-05 — Alerting Delivery: Log + Optional Webhook (No Guaranteed Delivery Platform at Launch)

**Decision:** Platform alerting will use structured logging + optional webhook to `ALERT_WEBHOOK_URL`. There is no PagerDuty, OpsGenie, or guaranteed delivery + escalation system at launch.

**Why:**
- Full alerting/on-call platform was not in Phase 39.5/40 scope.
- Current `emitAlert` implementation is a lightweight notification sketch.
- For the initial small cohort, log monitoring + manual escalation is accepted.

**Alternatives Rejected:**
- Stand up full alerting platform before Soft Launch (rejected — time and operational overhead).

**Future Migration Path:**
- Phase 41–42: Integrate proper incident management tool with on-call rotations and escalation.
- Phase 40: Require webhook configured and tested for critical alerts; manual log monitoring in first weeks.

**Owner:** SRE Lead + DevSecOps Lead  
**Reversibility:** Low cost to add later; high risk if critical incidents are missed.  
**Expiration:** Phase 41.

---

## D-06 — Certificate Signing: Symmetric Secret Without Rotation or Revocation Infrastructure at Launch

**Decision:** Certificates are signed using `CERTIFICATE_SIGNING_SECRET` (symmetric). No key rotation procedure, versioning, or revocation list (CRL/OCSP-style) will be in place at Soft Launch.

**Why:**
- Full PKI or HSM-backed certificate infrastructure was not scoped.
- Current implementation is simple and sufficient for early Academy credentials.
- Risk is accepted with user communication.

**Alternatives Rejected:**
- Implement basic revocation list in Phase 40 (rejected — time).
- Use self-signed or external CA immediately (rejected — complexity and cost).

**Future Migration Path:**
- Phase 43: Move to proper key management (rotation, versioning, minimal revocation). Re-issue or re-sign existing certificates if needed.
- Phase 40: Secret treated as high-value; minimal denylist accepted as future work.

**Owner:** Academy Director + Chief Security Officer  
**Reversibility:** High — rotation or compromise requires re-issuance of all prior certificates.  
**Expiration:** Phase 43.

---

## D-07 — Migration Strategy: Additive-Only Schema Changes During Launch Window

**Decision:** Any database schema changes required during Phase 40 or the immediate post-launch period must be strictly additive (new tables, new columns with defaults, new indexes). No DROP COLUMN, no NOT NULL without defaults, no type changes that require rewrite.

**Why:**
- No production migration runner is wired.
- Manual changes carry high risk; additive changes are the only safe manual operations.

**Alternatives Rejected:**
- Allow breaking changes with manual migration (rejected — data loss risk).

**Future Migration Path:**
- Once migration runner is active (Phase 41), full forward and backward migrations become possible.
- All launch-window changes must be reviewed for compatibility with the future migration system.

**Owner:** CTO + Platform Engineering Lead  
**Reversibility:** Low — breaking changes would require data migration scripts written under pressure.  
**Expiration:** Phase 41.

---

## D-08 — Hot Wallet Strategy: Env-Var Keys (HotWalletKeyStore) as Default; HSM/MPC Gated and Not Production-Ready

**Decision:** Production withdrawals will use environment-variable private keys via `HotWalletKeyStore`. HSM and MPC providers are explicitly gated and must not be selectable in production unless `WALLET_ENABLE_HSM=true` and `WALLET_ENABLE_MPC=true` (and even then only if fully implemented).

**Why:**
- HSM/MPC scaffolding from Phase 39 is incomplete and throws at runtime (see WALLET_PHASE39_READINESS_REPORT.md).
- Hot wallet with strict key hygiene (zeroing, never logged) is the only production-ready path at launch.

**Alternatives Rejected:**
- Allow HSM/MPC to be selected via env var without gating (rejected — will cause signing failures).

**Future Migration Path:**
- Phase 40+: Complete HSM/MPC with proper transport, auth, circuit breakers, and tests.
- Phase 42+: Policy engine + multisig for high-value withdrawals.

**Owner:** Wallet Engineer + Chief Security Officer  
**Reversibility:** Medium — switching signing backend later requires careful key migration.  
**Expiration:** Ongoing (gating is permanent until providers are production-ready).

---

## D-09 — Trading Engine Transaction Boundary: Two-Transaction Model Accepted for Launch

**Decision:** Order placement + hold and matching will remain two separate transactions (as documented in TRADING_CORE.md from Phase 30). Full single-transaction (order + hold + match) is deferred.

**Why:**
- Current implementation is stable.
- Making it fully atomic would require significant refactoring and testing not in Phase 40 scope.
- Risk of partial state is accepted with monitoring and manual recovery procedures.

**Alternatives Rejected:**
- Force single-transaction refactor in Phase 40 (rejected — scope and risk).

**Future Migration Path:**
- Phase 41+: Refactor to single transaction with proper DB migration support.
- Phase 40: Reconciliation and manual recovery procedures for any partial states.

**Owner:** Trading Engineer + Chief Architect  
**Reversibility:** Medium — changes affect core matching and wallet balance logic.  
**Expiration:** Phase 41+.

---

## D-10 — Withdrawals: BullMQ Asynchronous with Manual Recovery for Stuck Jobs

**Decision:** Withdrawals are processed asynchronously via BullMQ. In-flight jobs that become stuck due to Redis blips, process restarts, or provider failures will require manual intervention or recovery queue processing.

**Why:**
- Full exactly-once, crash-safe, observable pipeline with automatic recovery for all states was not completed in Phase 38–39.
- Idempotency via tx_hash exists for broadcast, but intermediate states can still be orphaned.

**Alternatives Rejected:**
- Pause all withdrawals until fully crash-safe pipeline (rejected — delays launch).

**Future Migration Path:**
- Phase 41+: Improved job visibility, state machine hardening, automatic recovery for common stuck states.
- Phase 40: Manual recovery runbooks and DLQ monitoring.

**Owner:** Wallet Engineer + SRE Lead  
**Reversibility:** Low cost to improve later; high operational burden if many jobs stick.  
**Expiration:** Phase 41.

---

## D-11 — No 24/7 On-Call at Soft Launch

**Decision:** There will be no formal 24/7 on-call rotation or guaranteed SLA response at Soft Launch. Core team will monitor and respond during defined hours.

**Why:**
- Team size and operational maturity do not yet support full on-call.
- Soft Launch cohort is small and expected to be understanding.

**Alternatives Rejected:**
- Stand up formal on-call before Soft Launch (rejected — team capacity).

**Future Migration Path:**
- Phase 42: Formal on-call rotation, escalation matrix, and coverage expansion.

**Owner:** CTO + SRE Lead  
**Reversibility:** Low — adding on-call later is primarily process and tooling.  
**Expiration:** Phase 42.

---

## D-12 — English / International Discoverability Is Secondary at Launch

**Decision:** Full English parity, structured data completeness, hreflang correctness, and LLM discoverability assets (`llms.txt`, entity graph, AEO) are not required for Soft Launch. Persian experience is the primary and complete surface.

**Why:**
- Core user base is Persian-speaking.
- Global/English expansion and discoverability work is scoped to later phases.
- Launching with incomplete English is acceptable if clearly communicated.

**Alternatives Rejected:**
- Delay launch until English + global discoverability is complete (rejected — timeline).

**Future Migration Path:**
- Phase 45: Global launch readiness with full SEO/GEO/AEO/LLMO.
- Phase 40–42: Progressive improvement on English pages and structured data.

**Owner:** Chief Product Officer + Growth lead  
**Reversibility:** Low cost — additive work later.  
**Expiration:** Phase 45.

---

## Summary of Irreversible or High-Cost Decisions

All decisions above are recorded as the baseline for the launch window. Any attempt to change them after code changes begin must go through the FINAL_IMPLEMENTATION_GATE and updated sign-off.

*This document is the authoritative record of conscious architectural choices. Future teams must respect the migration paths or explicitly revisit the decisions with new evidence.*

---

*Persian-first governance. English engineering terminology preserved.*