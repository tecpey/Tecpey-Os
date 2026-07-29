# TecPey Backend Authority Map

**Status:** Authoritative architecture and implementation reality map  
**Date:** 2026-07-19  
**Scope:** Current `main` only  
**Related execution tracker:** #26  

## 1. Purpose

This document defines which TecPey backend paths are authoritative, which paths are transitional, and which paths are not safe to treat as production-complete.

It exists to prevent three recurring failures:

1. inferring production readiness from UI presence or file names;
2. allowing two generations of logic to act as competing sources of truth;
3. deleting or extending code without first identifying the domain authority boundary.

A capability is considered complete only when its state authority, authorization, transaction boundary, recovery behavior, tests, CI evidence and runtime activation are all known.

## 2. Permanent backend invariants

1. PostgreSQL and governed backend services are the source of truth for durable domain state.
2. Browser storage is disposable only; it must never define account, learning, trading, wallet, compliance, admin or Mentor truth.
3. Financial and privileged mutations fail closed when their required authority service is unavailable.
4. Every state-changing HTTP route requires authenticated authority, input validation, bounded payloads, rate limits and CSRF protection where cookie authentication is used.
5. Financial values remain decimal strings or arbitrary-precision decimal values until final presentation.
6. Queue messages identify work; the database record remains the authority for amount, destination, ownership and current state.
7. External side effects require an idempotency claim persisted before or atomically with the side effect whenever technically possible.
8. Administrator actions require an individual principal, explicit permission, server-side revocable session, step-up for sensitive actions and immutable audit.
9. Cross-device recovery is mandatory for all user history and progress.
10. Multi-tenant claims are not valid until tenant context is enforced through identity, database, cache, queue, storage, event, AI memory and audit boundaries.

## 3. Runtime topology

### 3.1 Current runtime

- Next.js 16 application served through `server.ts`.
- Custom HTTP server handles Next.js requests and `/ws` WebSocket upgrades.
- PostgreSQL is the durable data store.
- Redis supports rate limiting, revocation, WebAuthn challenges, pub/sub and BullMQ.
- BullMQ withdrawal workers currently run inside the application process when `REDIS_URL` is configured.
- Redis pub/sub distributes realtime events to WebSocket clients.
- The matching engine and its mutex/order-book projection are process-local.

### 3.2 Current scale boundary

Production is intentionally restricted to one web/matching application node. The code detects multiple active web nodes and exits because distributed matching is not implemented.

This is an honest safety guard, not horizontal scalability. Worker scaling may be independent, but the web/matching application is not multi-node ready.

### 3.3 Required target separation

The production target should separate:

- web/API application;
- matching engine ownership per market;
- withdrawal workers;
- confirmation workers;
- Mentor/profile update workers;
- scheduled jobs;
- WebSocket fan-out.

Each process must expose lifecycle, health, shutdown and ownership semantics.

## 4. Database and migration authority

### 4.1 Current authority

`src/lib/db.ts` owns the PostgreSQL pool and invokes five migration layers during first database use:

1. `runMigrations`;
2. compatibility migrations;
3. user-state migrations;
4. Admin Control Plane migrations;
5. Admin hardening migrations.

The inlined TypeScript migration registries are the executable authority. SQL files under migration/documentation folders are human-readable references unless explicitly wired into a runner.

Applied migrations are tracked by filename and checksum in `_migrations`.

### 4.2 Current strengths

- checksum mismatch is rejected;
- user-state migrations are transactional;
- DB absence disables DB operations instead of inventing local persistence;
- health probing is side-effect free;
- `withTx` provides an explicit transaction wrapper.

### 4.3 Current risks

- schema initialization occurs on first application DB use rather than through a dedicated deployment migration command;
- `schemaInit` prevents duplicate work only inside one process;
- multiple application instances may race migration execution during deployment;
- migration authority is split across several registries, increasing ordering and ownership risk;
- compatibility migrations can hide historical schema drift and should not become a permanent substitute for clean forward migrations;
- operational rollback and backup/restore evidence is not yet attached to the repository gates.

### 4.4 Required direction

Create one migration manifest and one deployment-time migration command. Application startup should verify schema compatibility, not become the primary migration orchestrator.

## 5. Identity, sessions and authorization

### 5.1 User session authority

New user sessions use the unified `tecpey_session` JWT cookie. The canonical session helper normalizes unified and legacy session formats.

Legacy Academy/student/user cookies are still read for migration compatibility but are not intended to be issued by new login flows.

JTI revocation is checked through Redis with a short in-process cache.

### 5.2 User-session strengths

- HttpOnly cookie-based authentication;
- JTI per token;
- explicit production secret validation;
- strict revocation mode is available for sensitive mutations;
- Academy state mutations currently request strict revocation.

### 5.3 User-session risks

- ordinary canonical-session reads allow access when the Redis revocation check throws;
- unified session signing may fall back to Academy/JWT secrets instead of requiring one independent production session secret;
- the non-async `setUnifiedSessionCookie` helper signs in a detached promise and can return a response before cookie creation succeeds;
- canonical-session comments still describe the retired shared admin-token model and must be corrected;
- legacy cookie read support has no explicit removal date or telemetry gate.

### 5.4 Administrator authority

The Admin Control Plane is separate from user identity and is now the authoritative administrator path:

- individual `admin_users` identities;
- explicit roles and permissions;
- server-side `admin_sessions` with JTI, idle/absolute expiry, revocation and permission version;
- Passkey/WebAuthn authentication with user verification;
- bootstrap-only temporary shared token;
- recent step-up checks for sensitive actions;
- immutable hash-chained audit events;
- dual-control approval data model.

Normal Command Center authorization is Passkey-only and database-backed. The retired shared session cookie and normal shared-token access are prohibited by CI.

### 5.5 Remaining administrator work

- complete privileged-route inventory beyond the already migrated surfaces;
- session/device inventory and remote revocation UI;
- additional administrator invitation/enrollment flow after first bootstrap;
- complete dual-control execution for withdrawals, permission changes, recovery and high-risk configuration;
- tenant-aware administrator scopes after the tenant foundation exists;
- production bootstrap and recovery drill evidence.

## 6. Academy authority

### 6.1 Current authoritative stores

- `academy_state_documents`: general progress projection per student and locale;
- `academy_lesson_progress`: normalized official lesson/answer completion;
- `academy_term_learning_progress`: normalized term summary;
- flashcards and reflection memory in server-side Academy state;
- certificates, events, achievements, quiz/term records in PostgreSQL.

### 6.2 Current strengths

- official FA/EN lesson identities are validated;
- cross-device hydration exists;
- writes are transaction protected;
- normalized official lesson progress prevents zero-padded or fabricated lesson aliases from inflating official completion;
- flashcard/reflection revisions detect stale-device conflicts;
- state mutations emit Academy events and schedule Mentor updates;
- no DB configuration produces explicit service failure instead of local success.

### 6.3 Critical integrity gap

`POST /api/academy-state` still accepts generic client-selected actions including:

- `award_xp`;
- `pass_term`;
- `award_badge`;
- generic `lesson_complete` and `module_score`.

The endpoint limits values but does not prove that the client earned the reward through an authoritative quiz, official lesson or server-side rule. Repeated authenticated requests can therefore attempt to manufacture general progress, XP, badges or term state.

The normalized official lesson tables are stronger than the generic document, creating two progress generations with unclear precedence.

### 6.4 Required direction

- official learning events must be produced only by server-owned lesson, quiz, exam and certificate workflows;
- generic client reward actions must be removed or converted to server-issued, idempotent commands;
- one projection service should derive XP, streak, badges and completion from authoritative events;
- the generic document may remain a read projection/cache, never the mutation authority;
- reconcile legacy term-progress tables and normalized official term-learning tables.

## 7. Mentor AI authority

### 7.1 Current authority

The canonical `/api/ai-mentor` route uses:

- authenticated server session;
- PostgreSQL Mentor profile, memories, insights and conversations;
- server-collected Academy and Arena behavioral inputs;
- deterministic behavioral scoring;
- Academy curriculum/context;
- safe local educational fallback when the external AI provider is absent or fails.

Mentor V2 forwards to the canonical backend rather than maintaining separate browser-authoritative memory.

### 7.2 Current strengths

- server-fed behavioral context;
- privacy-oriented secret detection;
- CSRF and rate limiting;
- safe educational fallback;
- no profit promise or direct signal policy in the prompt;
- model failure does not block the Academy experience.

### 7.3 Current risks

- conversation saves are fire-and-forget, so a successful response does not guarantee memory persistence;
- `getOrCreateMentorProfile` is executed inside `Promise.all` but its result is ignored;
- client-provided history is still accepted as a fallback and can influence the prompt;
- Academy-account-only sessions may use Mentor without a `studentId`, producing no durable memory;
- external AI calls have no explicit timeout, abort controller, circuit breaker or queue isolation;
- prompt/model versions are not persisted with each generated answer;
- the route catches broad failures and can hide operational defects behind a successful fallback response.

### 7.4 Required direction

- require a durable student identity for personalized Mentor;
- persist user message before model execution and assistant message before reporting durable success;
- remove client history after an explicit migration criterion;
- store prompt version, model, latency, token/cost metadata, fallback reason and safety outcome;
- add timeouts, provider gateway, retry policy and cost budgets;
- consume authoritative Arena and Exchange events rather than UI summaries.

## 8. Trading Arena authority

### 8.1 Current authoritative foundation

Merged server-side foundation:

- one Arena account per student;
- 30-day cycle;
- `$100,000` virtual initial capital;
- exactly three attempts;
- one active attempt plus available attempts;
- server-persisted decision journal and Mentor signal generation.

### 8.2 Current non-authoritative engine

`src/lib/trading-arena.ts` is explicitly a browser engine:

- initial balance remains `10,000`;
- state is stored in `localStorage`;
- IDs and slippage use `Math.random`;
- financial values use JavaScript `number`;
- market ticks and order execution can be driven by the client;
- functions mutate persistence as a hidden side effect.

This file must not remain the production execution authority.

### 8.3 Stale draft implementation

PR #15 contains useful work for revisioned PostgreSQL execution state, but it is based on an old `main` and contains temporary export workflows/trigger files. It must not be merged directly.

### 8.4 Required clean implementation

- rebuild the useful execution logic on a clean branch from current `main`;
- store cash, reserved cash, holdings, positions, orders, fills, trades, fees, realized/unrealized PnL and scenario state server-side;
- use decimal strings/Decimal math, never browser `number` as authority;
- server owns price inputs and simulation clock;
- use optimistic revision plus transaction/advisory locking;
- every mutation has idempotency key and actor/attempt ownership checks;
- derive attempt failure/pass from server rules;
- emit immutable Arena events for Mentor and analytics;
- preserve live and historical replay as separate controlled market-data modes;
- remove Arena and Trading Journal browser-persistence baselines after migration.

## 9. Exchange authority

### 9.1 Current authority

The Exchange order route currently provides:

- authenticated order reads/writes;
- CSRF and rate limits;
- market/rule validation;
- trade restriction enforcement;
- atomic order creation plus wallet hold;
- matching engine execution;
- DB trade, balance, ledger and event writes;
- post-match audit and response refresh.

### 9.2 Current strengths

- order plus hold is transactional;
- matching writes are grouped in PostgreSQL transactions;
- in-memory order-book mutations occur after transaction commit;
- startup rebuild exists;
- production is blocked from unsafe multi-node matching;
- stop-limit and unsupported paths have explicit validation gates;
- some Decimal precision remediations are already merged.

### 9.3 Production blockers

- critical paths still convert quantity, price, holds, fees and fill math to `number`/`parseFloat`;
- epsilon comparisons (`1e-10`) are used as financial correctness rules;
- the per-market lock is process-local;
- the in-memory order book can diverge from DB/Redis between processes or failures;
- market-buy hold estimation depends on an in-memory best ask and is not reserved against a deterministic maximum-cost rule;
- the asynchronous risk observation does not block the order; only the separate enforcement service blocks known restrictions;
- DB creation/hold and engine matching are separate transactions, so accepted-but-unmatched recovery semantics must be explicit and tested;
- reconciliation evidence between order state, trades, wallet balances and ledger is not yet attached to a release gate.

### 9.4 Required direction

- end-to-end Decimal/string arithmetic;
- market-partition ownership or distributed lock/sequence model;
- event/outbox recovery for accepted orders;
- deterministic market-order reservation and refund rules;
- replayable order-book reconstruction and reconciliation;
- integration tests covering concurrent orders, partial fills, FOK/IOC, crash recovery and ledger conservation.

## 10. Wallet and withdrawal authority

### 10.1 Current pipeline

The withdrawal pipeline contains:

- PostgreSQL withdrawal state machine;
- BullMQ jobs and DLQ;
- chain provider registry;
- build, sign, broadcast and confirmation stages;
- HotWallet signing implementation;
- fail-closed HSM/MPC runtime guard;
- chain confirmation tracking and metrics.

### 10.2 Current strengths

- unsupported HSM/MPC implementations cannot be selected silently;
- signing uses actual public keys rather than wallet-address bytes;
- jobs move through explicit states;
- duplicate jobs with an already-recorded `tx_hash` are skipped;
- confirmation monitoring is queued after broadcast.

### 10.3 Critical blockers

1. The executor loads the withdrawal record but uses amount, destination, asset and chain values from the queue job. The DB record must be revalidated and must remain authoritative.
2. The read/check for `tx_hash` is not a locked idempotency claim. Two workers can observe no hash and both broadcast.
3. State updates use `withDb` without checking whether DB access was enabled or the update succeeded.
4. The transaction may be broadcast before `tx_hash` persistence. If persistence fails, retry can rebroadcast.
5. An `already known` response cannot recover the transaction hash and is converted to failure/DLQ despite possible successful network submission.
6. Provider correctness remains incompletely proven for multi-input Bitcoin, EVM recovery/y-parity and Tron compatibility.
7. Production key custody, rotation, withdrawal policy, hot-wallet limits and reconciliation drills are not complete.

### 10.4 Required direction

- lock and claim the DB withdrawal row before build/broadcast;
- reconstruct the job exclusively from the locked DB record;
- use a durable broadcast-attempt/idempotency record;
- persist signed raw transaction/hash material needed for safe recovery before network submission where the chain permits;
- make broadcast/persistence failure states recoverable without blind rebroadcast;
- certify each chain independently through deterministic fixtures and testnet evidence;
- keep unsupported chains/providers disabled.

## 11. Admin, compliance and risk

### 11.1 Admin

Admin identity, permissions, Passkey sessions and immutable audit are real foundations. The Command Center currently covers a limited set of operations and is not yet a complete cross-domain operations product.

### 11.2 Compliance

The repository includes compliance provider bootstrapping, KYC/AML adapters, risk restrictions and administrative withdrawal controls. Production claims still require provider credentials, jurisdiction decisions, negative tests and operational review evidence.

### 11.3 Risk

Risk enforcement and observational risk analysis are separate. Any rule that must block a financial action must execute synchronously in the authority transaction or through an already-persisted restriction state.

## 12. Queues, realtime and observability

### 12.1 Current capabilities

- structured logger;
- DB/Redis health semantics;
- metrics and security metrics;
- alerts module;
- Redis pub/sub;
- WebSocket manager;
- BullMQ withdrawal and confirmation queues;
- graceful stop calls for withdrawal workers and Redis pub/sub.

### 12.2 Gaps

- app shutdown does not explicitly close the HTTP server, WebSocket clients or PostgreSQL pool before `process.exit`;
- workers run inside the web process, coupling API availability and financial processing;
- backup/restore, rollback, disaster recovery and alert-delivery evidence are not current;
- trace correlation and durable outbox semantics are incomplete;
- no verified production SLO/error-budget document is authoritative.

## 13. Multi-tenant and white-label reality

Multi-tenant/white-label is a strategic requirement and an open issue (#20), not a completed implementation.

Until a tenant context is enforced across every applicable table, session, permission, cache key, queue payload, object path, webhook, event, metric, AI memory and audit record, TecPey must not claim production multi-tenancy.

Current single-tenant foundations should avoid irreversible assumptions, but the soft-launch core should not be delayed by pretending full tenant isolation already exists.

## 14. Browser persistence debt

The required CI guard currently records 45 matching lines across 15 source files. Remaining clusters include:

- Mentor migration/UI fallbacks;
- legacy Academy engagement/simulation/specialized surfaces;
- Offline Sync;
- Community profile/challenges;
- Smart Review;
- Trading Arena;
- Trading Journal.

Each line requires classification:

- **authoritative domain state:** must migrate and be removed;
- **one-time migration bridge:** retain only with expiry and telemetry;
- **disposable UI preference/cache:** may remain only when explicitly documented and rebuildable;
- **offline operation:** must reconcile through server-owned commands and conflict policy.

## 15. Documentation and repository drift already confirmed

1. `docs/TECPEY_MASTER_BLUEPRINT.md` begins with unrelated Python logging lines.
2. The Master Blueprint and Final Implementation Gate still describe missing migration/test capabilities that now exist.
3. The Final Gate has not been reconciled with merged Admin, Academy and persistence work.
4. `README.md` claims `multi-tenant` architecture as a status badge although tenant isolation is still an open gate.
5. `README.md` shows a private-license badge while the repository visibility is public; licensing and repository exposure must be reviewed explicitly.
6. `package.json` still names the package `tecpey-landing`, which understates the current TecPey OS repository.
7. PR #15 is stale and includes temporary diagnostic/export files.
8. Issue #13 checklists are stale relative to the merged Admin foundation and Passkey migration.

These are governance/metadata defects. They are not safe reasons to delete product code, but they must be corrected during repository hygiene.

## 16. Dependency cleanup candidates — verification required

The current package includes overlapping or potentially unused families:

- `chart.js`, `react-chartjs-2`, and `recharts`;
- `lucide` and `lucide-react`;
- multiple UI/infrastructure libraries whose current import ownership must be proven.

No dependency may be removed until repository import search, build, tests and runtime ownership confirm it is unused.

## 17. Priority backlog

### P0 — blocks credible soft launch

1. Rebuild and complete server-authoritative Trading Arena execution state.
2. Remove client-authoritative Academy reward/pass/badge mutations.
3. Fix withdrawal DB authority and broadcast idempotency/recovery.
4. Finish Decimal precision through Exchange matching, holds, fees and ledger paths.
5. Add order/trade/ledger and withdrawal/on-chain reconciliation evidence.
6. Verify production KYC/AML provider behavior and jurisdiction controls.
7. Execute staging backup/restore, rollback, incident and alert-delivery drills.
8. Produce an end-to-end Golden Path test: signup → Academy → assessment → Arena → Mentor → controlled exchange/wallet boundary.

### P1 — required for stable operation

1. Make user-session revocation policy explicit and remove unsafe secret fallbacks.
2. Remove detached session-cookie signing helper.
3. Make Mentor persistence durable and add provider timeout/gateway/version audit.
4. Separate workers from the web process.
5. Add distributed matching design or preserve explicit single-node operational limits.
6. Finish admin enrollment, session inventory, dual-control and recovery.
7. Reduce remaining browser persistence to reviewed UI-only exceptions or zero.
8. Reconcile and modernize governance documents/issues.

### P2 — post soft-launch/platform expansion

1. full multi-tenant/white-label isolation;
2. developer platform/API contracts;
3. broad AI Operating System and MCP distribution;
4. marketplace and advanced financial ecosystem;
5. organization/enterprise features at scale;
6. advanced Arena leagues, replay library, tournaments and prop pathways.

## 18. Definition of backend-complete

A backend domain is complete only when all of the following are true:

- authority table/service identified;
- no competing client or legacy authority;
- commands validated and authorized;
- transaction and concurrency policy tested;
- idempotency and recovery tested;
- events/audit emitted;
- observability and degraded behavior defined;
- cross-device recovery demonstrated;
- migrations deployed through a controlled process;
- CI and integration tests pass;
- runtime/staging evidence exists;
- operational owner and runbook exist.

## 19. Immediate execution order

1. Treat this document as the backend authority map.
2. Close/rebuild stale Arena PR #15 on current `main`, preserving only reviewed production logic.
3. Create focused P0 issues/PRs for Academy reward integrity, withdrawal idempotency and Exchange Decimal completion.
4. After P0 backend slices, run repository hygiene in small deletion PRs.
5. Update Master Blueprint, Final Gate, README and stale issues from code evidence.
6. Publish weighted completion report with separate percentages for soft launch and full TecPey OS vision.
