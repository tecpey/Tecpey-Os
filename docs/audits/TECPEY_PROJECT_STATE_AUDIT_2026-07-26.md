# TecPey Project State Audit — 2026-07-26

## 1. Executive Summary

This audit evaluates TecPey from repository and GitHub evidence at `main` commit `52ad2af621bdb9750fecf56060c6c841492078ba`. It does not treat the presence of a route, component, schema, or test as proof that a capability is operationally activated. The audited repository contains a substantial multilingual education platform, a PostgreSQL-authoritative virtual Trading Arena, Mentor AI foundations, financial-core and withdrawal infrastructure, mature security authority tests, deterministic database migrations, and a hardened production-container contract. The exact audited `main` SHA had eight successful GitHub Actions check runs.

TecPey is not currently evidenced as a production-active real-money exchange, custody platform, white-label service, or fully multi-tenant system. Production custody is deliberately disabled by `src/lib/wallet/custody-launch-policy.ts`; the runtime reports a single-tenant deployment model in `src/app/api/health/route.ts`; real-money reconciliation, external-provider certification, disaster-recovery drills, staging activation, and broader isolation work remain tracked by open Issues. This is a sound launch boundary, not an implementation failure, provided public claims and operator decisions continue to describe it truthfully.

The most defensible controlled Soft Launch is the public Persian/English experience plus authenticated education, governed Mentor assistance, and virtual practice, with real-money Exchange, custody, withdrawals, public reputation ranking, and enterprise platform claims disabled or explicitly gated. The single most important next engineering phase is operational recovery and data durability under [Issue #110](https://github.com/tecpey/Tecpey-Os/issues/110), because Academy, Arena, Mentor, notification, and financial authorities now depend on PostgreSQL/Redis durability but repository-owned production backup, restore, RPO/RTO, and cross-release recovery evidence is not complete.

## 2. TecPey Product Definition

TecPey is intended to be a multilingual **Digital Financial Education & Trading Operating System**, not merely a cryptocurrency exchange. Its differentiating product loop connects structured education, simulated execution, reflection, and permissioned behavioral guidance:

> Learn → practise safely → reflect on evidence → receive governed guidance → progress toward separately approved financial services.

The repository expresses this model through Academy routes and authorities under `src/app/academy`, `src/app/api/academy`, and `src/lib/academy-*`; Arena authorities under `src/app/api/trading-arena`, `src/lib/trading-arena-account.ts`, `src/lib/trading-arena-execution-v2.ts`, and `src/lib/trading-arena-reflections.ts`; and Mentor context under `src/lib/mentor-memory.ts` and `src/lib/ai/mentor-provider.ts`. Exchange and wallet modules are infrastructure within the wider system, not proof that real-money service is enabled.

## 3. Strategic Positioning

- **Education first.** Academy progression and assessments precede any claim of financial execution. The curriculum and learning model are described in `docs/TECPEY_MASTER_BLUEPRINT.md`, `docs/ACADEMY_CURRICULUM_BLUEPRINT.md`, and `docs/ACADEMY_EDUCATIONAL_STANDARD.md`.
- **Safety first.** Financial, custody, authorization, migration, and readiness boundaries fail closed. Examples include `src/lib/wallet/custody-launch-policy.ts`, `src/lib/db.ts`, `server.ts`, and the authority checks in `scripts/check-*.mjs`.
- **Controlled progression.** The official Arena uses virtual capital and server-owned execution evidence; real-money functionality has independent activation gates.
- **Iran first, multilingual direction.** The root Persian experience is RTL and the `/en` experience is LTR. Route inventory and Playwright projects demonstrate FA/EN coverage, although full feature parity is incomplete.
- **Future enterprise direction.** Multi-tenancy, white-label operations, developer tooling, and a broader AI operating layer are documented ambitions and open programs, principally Issues [#20](https://github.com/tecpey/Tecpey-Os/issues/20), [#84](https://github.com/tecpey/Tecpey-Os/issues/84), and [#109](https://github.com/tecpey/Tecpey-Os/issues/109). They are not current operating characteristics.

## 4. Current Repository Snapshot

| Attribute | Audited evidence |
|---|---|
| Audit date | 2026-07-26 |
| Exact `main` SHA | `52ad2af621bdb9750fecf56060c6c841492078ba` |
| Framework/runtime | Next.js `16.2.11`, React `19.2.4`, TypeScript, Node `>=20.11`; `package.json`, `server.ts` |
| Persistence | PostgreSQL via `pg`; Redis and BullMQ; `src/lib/db.ts`, `src/lib/redis-pubsub.ts`, `package.json` |
| Open pull requests | 0 at audit time (`gh pr list --state open`) |
| Open issues | 23 at audit time (`gh issue list --state open`) |
| Milestones | No GitHub milestones returned at audit time |
| Main CI | Eight successful exact-SHA checks: quality, repository hygiene, API mutation security, sensitive mutation audit, public browser Golden Path, container/SBOM/vulnerability gate, rollback/restore, and image publication/provenance |

Major directories have distinct responsibilities: `src/app` contains public/product routes and APIs; `src/components` contains UI; `src/lib` contains domain and infrastructure authority; `migrations` and `src/lib/db-migration-registry.ts` govern schema history; `scripts` contains authority and operational commands; `src/tests` and `tests/e2e` contain automated evidence; `.github/workflows` defines CI and supply-chain gates; `deploy` contains service/deployment assets; `storage` is a runtime persistence mount; `public` holds shipped static assets; and `docs` combines strategy, implementation contracts, runbooks, and point-in-time reports.

## 5. Implemented and Evidenced Capabilities

### Landing and internationalization

The repository has Persian and English public routes under `src/app` and `src/app/en`, locale-aware metadata, RTL/LTR presentation, responsive navigation, CSP nonce propagation, and public browser tests in `tests/e2e/specs/public-golden-path.spec.mjs`. Four governed projects cover Chromium/Firefox, FA/EN, and mobile/desktop in `tests/e2e/playwright.config.mjs`. This is strong evidence for the governed public paths, not for complete application-wide translation parity. Open Issue [#80](https://github.com/tecpey/Tecpey-Os/issues/80) retains broader product-surface work; [#254](https://github.com/tecpey/Tecpey-Os/issues/254) appears stale after merged PR #257 but remained open at audit time.

### Academy

Structured terms, lessons, quizzes, assessments, onboarding, progress, certificates, achievements, labs, and related learning surfaces exist under `src/app/academy` and `src/components/academy`. Canonical progress, assessment, and certificate operations are PostgreSQL-backed in `src/lib/academy-progress.ts`, `src/lib/academy-assessment.ts`, and `src/lib/academy-certificates.ts`, with authority and PostgreSQL tests under `src/tests/security/academy-*`. The browser-persistence authority in `scripts/check-browser-persistence.mjs` prevents unclassified client storage from becoming official authority.

Limitations remain. Several engagement, simulation, and Mentor UI experiences use classified browser storage for disposable state; English route depth does not mirror every Persian Academy route; certificate signing uses a configured symmetric secret and is not evidence of a complete certificate revocation/rotation program. Cross-device and staging recovery evidence remains part of Issues #26, #110, and #156.

### Mentor AI

`src/lib/mentor-memory.ts` stores profiles, conversations, memories, and authorized Academy/Arena context in PostgreSQL. `src/lib/ai/mentor-provider.ts` provides an external-model boundary with time limits and degraded educational fallback. Security tests under `src/tests/security/ai-mentor-*` and `npm run ai:redteam:check` govern model and data boundaries.

This is an educational and behavioral assistance foundation, not autonomous financial advice or a complete TecPey AI Operating System. Some interaction state remains a classified client cache, durable event delivery is incomplete (`src/lib/mentor-events.ts` documents an in-process path), and conversation persistence failures can degrade without turning every generated response into a durable record. The larger platform is open Issue #84.

### Trading Arena

The official Arena authority is server-side. `src/lib/trading-arena-account.ts`, `src/lib/trading-arena-execution-v2.ts`, and the `/api/trading-arena` routes manage virtual accounts, attempts, balances, positions, orders, executions, fees, revision/idempotency controls, and server-resolved market inputs using PostgreSQL and decimal strings. `src/lib/trading-arena-reflections.ts` and related Community projection modules provide server-owned reflection evidence. Tests in `src/tests/security/trading-arena-*` and the Arena authority guard cover these boundaries.

Legacy local-only modules `src/lib/trading-arena.ts` and `src/lib/trading-journal.ts` remain explicitly quarantined by `scripts/check-browser-persistence.mjs` and are still used by some scenario/historical experiences. Therefore the core virtual execution journey is implemented and governed, while all replay/scenario/journal variants should not be described as uniformly server-authoritative or complete.

### Exchange core

Authenticated order admission, holds, matching, trades, ledger evidence, idempotency, and decimal-safe arithmetic exist in `src/lib/trading`, `src/app/api/orders`, `src/app/api/trades`, and `src/app/api/orderbook`. PostgreSQL-backed tests and `npm run exchange:check` enforce key invariants. The server also enforces a single active web/matching-node boundary rather than claiming distributed matching safety.

This core is implemented but not approved for real-money launch. Issue [#30](https://github.com/tecpey/Tecpey-Os/issues/30) retains reconciliation, ambiguous-result recovery, sequencing, and production evidence. Public documentation must distinguish engineering presence from activation.

### Wallet and ledger

The repository includes database-authoritative withdrawal admission, signed-transaction persistence before broadcast, BullMQ workers, confirmation processing, ledger integration, and security tests in `src/lib/wallet`, `src/app/api/wallet`, `src/tests/wallet`, and `src/tests/security/withdrawal-*`. `npm run withdrawals:check` and `npm run custody:check` enforce authority and activation boundaries.

Production custody is explicitly disabled by `src/lib/wallet/custody-launch-policy.ts`. HSM/MPC adapters in `src/lib/wallet/keystore.ts` are not production implementations. Issue [#106](https://github.com/tecpey/Tecpey-Os/issues/106) owns the non-exportable signer gate; Issue [#29](https://github.com/tecpey/Tecpey-Os/issues/29) retains provider, chain, reconciliation, and operational evidence. No deposit, signing, broadcast, or withdrawal service should be presented as active.

### Authentication and security

The system has HttpOnly JWT sessions, JTI revocation, strict production secret handling, Origin-based CSRF checks, TOTP, WebAuthn/passkeys, API body limits, operation manifests, tenant/principal context helpers, and transaction-coupled audit evidence. Representative evidence includes `src/lib/auth-session.ts`, `src/lib/csrf.ts`, `src/lib/admin-auth.ts`, `src/lib/webauthn-*`, `scripts/check-api-security-manifest.mjs`, and `scripts/check-sensitive-mutation-audit-authority.mjs`.

The controls are substantial but not a claim of complete security. Issue [#164](https://github.com/tecpey/Tecpey-Os/issues/164) records a broad production CSP `connect-src` fallback in `src/proxy.ts`; Issue [#162](https://github.com/tecpey/Tecpey-Os/issues/162) records disabled repository-wide ESLint correctness rules; Issue [#100](https://github.com/tecpey/Tecpey-Os/issues/100) retains the full red-team program; Issue #109 retains platform-wide isolation proof.

### Admin/control plane

Individual administrator identities, database-backed sessions, permission checks, passkey/step-up foundations, audit evidence, and a command-center surface exist under `src/app/admin`, `src/app/api/admin`, and `src/lib/admin-*`. Issue [#13](https://github.com/tecpey/Tecpey-Os/issues/13) remains open for complete privileged-route inventory, dual control, domain coverage, and enterprise operational workflows. The current surface is a foundation, not a complete enterprise control plane.

### Notifications and CRM

PostgreSQL-backed notification preferences, consent, outbox/domain events, in-app delivery workers, and producer authority exist in `src/lib/notifications`, notification API routes, worker scripts, and `scripts/check-notification-*.mjs`. CRM lead handling includes encrypted/hashed fields, persistence, delivery workers, and tests in `src/lib/crm-*` and `src/tests/security/crm-lead-*`. Broad multichannel campaigns, deterministic group audiences, and full operational CRM remain within Issue [#85](https://github.com/tecpey/Tecpey-Os/issues/85).

### Community/social learning

Community profile consent, canonical Arena reflection projection, journal challenges, immutable reputation evidence, private discipline scoring, and transaction-coupled audit are present in `src/lib/community-*`, `src/app/api/community`, and corresponding security tests. Public ranking, rewards, scholarships, and real Instructor authority remain disabled. Issues [#160](https://github.com/tecpey/Tecpey-Os/issues/160) and [#226](https://github.com/tecpey/Tecpey-Os/issues/226) explicitly preserve that fail-closed position; the larger social network remains Issue [#82](https://github.com/tecpey/Tecpey-Os/issues/82).

### Infrastructure and deployment

PR #258 introduced the canonical migration/readiness contract documented in `docs/architecture/DATABASE_MIGRATION_RUNTIME_CONTRACT.md` and `migrations/README.md`. `server.ts` verifies schema and dependencies before listen; HTTP health is verify-only. PR #259 introduced the rootless multi-stage `Dockerfile`, digest-governed `docker-compose.production.yml`, compiled custom-server/bootstrap artifacts, bounded shutdown in `src/lib/runtime-shutdown.ts`, and `.github/workflows/container-supply-chain.yml` for SBOM, vulnerability, rollback, restore, provenance, and signing evidence. Production backup policy and broader disaster recovery remain Issue #110; real staging scheduler activation remains Issue [#229](https://github.com/tecpey/Tecpey-Os/issues/229).

### QA and accessibility

The default CI runs lint, type checking, PostgreSQL migration evidence, authority guards, security and product-domain tests, and production builds. Separate workflows govern APIs, sensitive mutations, Exchange authority, browser Golden Paths, repository hygiene, staging evidence, and the container supply chain. Playwright uses zero retries and fail-on-flaky behavior. `@axe-core/playwright` checks the governed public routes. This does not prove every authenticated route, Academy lesson, browser state, or assistive-technology combination is accessible.

## 6. Capability Maturity Matrix

| Capability | Maturity | Supporting evidence | Limitation | Launch relevance |
|---|---|---|---|---|
| Persian/English public landing | Production-evidenced for governed paths | `src/app/page.tsx`, `src/app/en/page.tsx`, `tests/e2e/specs/public-golden-path.spec.mjs` | Not complete application-wide parity; #80 remains open | Included |
| Academy canonical progress/assessment | Implemented and governed | `src/lib/academy-progress.ts`, `src/lib/academy-assessment.ts`, Academy tests | Staging/cross-device recovery evidence incomplete | Controlled inclusion |
| Certificates | Implemented and governed | `src/lib/academy-certificates.ts`, certificate routes/tests | Rotation/revocation lifecycle incomplete | Controlled inclusion |
| Academy engagement/lab variants | Partially implemented | `src/components/academy`, persistence inventory | Some disposable browser-local experience state | Controlled; disclose limits |
| Mentor memory and educational chat | Implemented and governed | `src/lib/mentor-memory.ts`, `src/lib/ai/mentor-provider.ts`, AI tests | Some non-durable event paths; provider/config dependent | Controlled inclusion |
| TecPey AI Operating System | Planned | Issue #84, `docs/AI_PLATFORM.md` | Platform gateway, tools, evaluations, enterprise controls incomplete | Post-launch |
| Arena virtual execution | Implemented and governed | `src/lib/trading-arena-account.ts`, `src/lib/trading-arena-execution-v2.ts`, Arena routes/tests | Not every legacy scenario/replay path migrated | Controlled inclusion |
| Legacy Arena scenarios/journal | Stubbed or simulated | `src/lib/trading-arena.ts`, `src/lib/trading-journal.ts` | Browser-local and quarantined | Not canonical evidence |
| Exchange core | Implemented but gated | Exchange libraries, APIs, PostgreSQL tests | #30 reconciliation/recovery/production proof | Disabled for Soft Launch |
| Withdrawal pipeline | Implemented but gated | withdrawal routes/workers/tests | Provider/chain/custody evidence incomplete | Disabled |
| Production custody | Disabled for Soft Launch | `src/lib/wallet/custody-launch-policy.ts`, custody tests | No production HSM/MPC signer | Disabled |
| Community evidence/private score | Implemented and governed | `src/lib/community-*`, Community authority tests | Limited product surface | Controlled/optional |
| Public reputation ranking | Disabled for Soft Launch | Issues #160/#226, ranking policy | Fairness, privacy, activation gates | Disabled |
| Notifications/in-app foundations | Implemented and governed | notification repositories/workers/guards | Complete multichannel platform incomplete | Controlled |
| Enterprise admin control plane | Partially implemented | admin routes, sessions, RBAC, audit | #13 dual control and domain completeness | Restricted operations |
| Production migration/readiness | Production-evidenced | `server.ts`, migration registry, migration/startup tests | External operational execution still matters | Required |
| Production container contract | Production-evidenced in CI | `Dockerfile`, Compose, supply-chain workflow | Post-merge registry publication/attestation is an operational event | Required |
| Backup/restore and DR program | Requires independent verification | partial volume-restore CI; Issue #110 | RPO/RTO, production backups, cross-release drills incomplete | P0/P1 depending launch data |
| Multi-tenant/white-label | Planned | Issues #20/#109; health reports single tenant | Isolation/config/control plane not complete | Post-launch |
| Developer platform | Planned | strategic docs and future routes | No complete public API/SDK/webhook portal contract | Post-launch |

## 7. Architecture Assessment

### Frontend and application layer

Next.js App Router supplies pages and route handlers in one TypeScript codebase. Server and client components are separated by explicit client boundaries. `next.config.ts`, `src/proxy.ts`, and the custom server establish runtime behavior. The route tree is broad, which accelerates integrated product delivery but increases the need for authority manifests and surface-specific testing.

### Backend, APIs, and domains

Server-side domain modules under `src/lib` own authentication, Academy, Arena, Exchange, wallet, notifications, community, CRM, and operational behavior. APIs under `src/app/api` are in-process adapters rather than a separately deployed service tier. Authority scripts protect key invariants, but a broad repository audit remains Issue #156.

### Database and migrations

PostgreSQL is the durable authority. `src/lib/db-migration-registry.ts` defines ordered migration identity, dependency, owner/domain, canonical SHA-256 content checksum, and a plan fingerprint. `scripts/run-database-migrations.ts` is the operational executor. Production HTTP and startup paths verify schema but do not migrate it. Advisory locking, interrupted-query cancellation, checksums, historical ledger compatibility, and startup failure are covered by migration/readiness tests. `migrations/README.md` is the concise operator contract.

### Redis, queues, and workers

Redis backs BullMQ withdrawal/notification operations, revocation and runtime coordination where configured. Production requires authenticated Redis and the custom server verifies it. Worker processes are explicit scripts rather than hidden request-time jobs. Some domain events still use in-process delivery, so Redis/BullMQ is not a universal event backbone.

### Runtime and deployment

`scripts/run-production-bootstrap.ts` is the governed entry: migrate for the one-shot migration action or verify readiness before starting the compiled custom server. The production container is rootless and minimal; Compose orders PostgreSQL/Redis health, migration completion, and web startup. `server.ts` does not listen until database schema and dependencies are ready. `/api/health?probe=live` is process liveness; regular health/readiness is dependency-aware. `src/lib/runtime-shutdown.ts` implements bounded HTTP/WebSocket/worker/Redis drain.

### Security boundaries

The design uses layered request admission: sessions and principal context, CSRF Origin checks, validation/body limits, permissions, idempotency/revision controls, durable domain transactions, and immutable audit for sensitive mutations. The strongest domains have repository authority tests that fail on policy drift. Remaining weaknesses are explicitly tracked rather than masked by a blanket “secure” claim.

### Persistence model and multi-tenant readiness

Canonical product and financial authorities use PostgreSQL; Redis is coordination/queue infrastructure; object/file storage is limited and not a complete governed media platform. Tenant/principal context foundations exist, but the deployed mode is single tenant and repository-wide isolation is not proven. Multi-tenancy therefore remains a future architecture program, not a switch that can be enabled safely.

## 8. Data Ownership and Persistence Assessment

| Data domain | Current authority | Evidence and remaining gap |
|---|---|---|
| Academy progress | PostgreSQL authoritative | `src/lib/academy-progress.ts`; browser storage may cache disposable UI state |
| Assessments | PostgreSQL authoritative | `src/lib/academy-assessment.ts`; staging/cross-device drills still needed |
| Certificates | PostgreSQL authoritative with configured signing | `src/lib/academy-certificates.ts`; lifecycle/rotation gap |
| Mentor memory/conversations | PostgreSQL authoritative for canonical memory | `src/lib/mentor-memory.ts`; some UI caches and non-durable event delivery remain |
| Arena balances/trades | PostgreSQL authoritative in Arena v2 | `src/lib/trading-arena-account.ts`, `src/lib/trading-arena-execution-v2.ts`; legacy scenario modules remain local/simulated |
| Exchange activity | PostgreSQL/ledger authoritative | Exchange domain modules; launch reconciliation/recovery incomplete |
| Wallet/withdrawal activity | PostgreSQL authoritative pipeline | withdrawal modules/tests; production custody/provider path disabled |
| Preferences | Mixed by importance | server session/notification/Mentor preferences exist; theme and disposable UX preferences may be browser-local |
| Notifications | PostgreSQL/outbox authoritative for governed flows | notification repositories/workers; complete multichannel delivery incomplete |
| Community records | PostgreSQL for governed consent/evidence/challenges | broader social graph/product incomplete |
| Audit history | PostgreSQL transaction-coupled in governed sensitive domains | full privileged-surface inventory remains #13/#156 |

The permanent target is clear: critical user and financial state must not be authoritative in `localStorage` or `sessionStorage`. `scripts/check-browser-persistence.mjs` enforces classification, but it also documents current exceptions. Those exceptions are acceptable only when they are disposable UX state or quarantined simulations that cannot influence official evidence. Cross-device correctness is strongly evidenced for several canonical stores, but production restore and failure-mode proof is incomplete until #110.

## 9. Security and Trust Assessment

**Implemented controls:** unified server sessions, HttpOnly cookies, CSRF Origin checks, principal/tenant contexts, RBAC foundations, TOTP, WebAuthn/passkeys, request-size limits, API operation manifests, database transactions, idempotency/revision controls, CSP nonces, strict production secrets, migration readiness, custody activation denial, and sensitive mutation audit.

**Tested controls:** auth/session/revocation suites, AI trust tests, withdrawal/custody gates, Exchange authority and conservation tests, Academy/Arena authority tests, Community consent/evidence tests, API security policy tests, browser accessibility checks, migration concurrency/checksum/startup tests, and container/supply-chain authority.

**Gated controls/capabilities:** custody signing and broadcast, withdrawals, real-money Exchange, public ranking, Instructor access, broad notification audiences, multi-tenant operation, and privileged financial dual control.

**Incomplete controls:** CSP endpoint allowlisting (#164), repository-wide lint correctness rules (#162), platform isolation (#109), full red-team completion (#100), production DR (#110), complete admin dual control (#13), and external compliance/provider certification associated with real-money operation.

Real-money activation remains blocked until custody, reconciliation, compliance, provider, recovery, staging, and operational evidence are independently accepted. Repository code must never be interpreted as authorization to handle customer assets.

## 10. Testing and Quality Evidence

| Command/workflow | What it directly proves |
|---|---|
| `npm run lint` | Current ESLint configuration passes; does not resolve disabled rules in #162 |
| `npm run typecheck` | TypeScript compilation contract without output |
| `npm run build` | Next.js production build plus compiled custom server/bootstrap/migration executables |
| `npm run migrations:check` | Registry, runtime-DDL, production-start, and migration authority guards |
| `npm run test:migrations` | Ordering, checksums, locks, concurrency, interruption, recovery, convergence |
| `npm run test:readiness` / `test:startup` | Verify-only state classification and pre-listen fail-closed startup |
| `npm run ui:check` / `ui:public:check` | Governed design/public source authority; not visual proof for all routes |
| `npm run test:e2e:public` | Production public Golden Path in four browser/locale/viewport projects when dependencies are available |
| `npm run auth:check`, `api:security:check`, `audit:sensitive:check` | Session/API/mutation authority policies |
| `npm run custody:check`, `withdrawals:check`, `exchange:check` | Financial/custody source-boundary rules and tests |
| `npm run release:check` | Aggregated local authority suite; external deployment approval is still separate |
| `.github/workflows/ci.yml` | Exact-head installation, migrations, domain/security tests, build, and hygiene |
| `.github/workflows/public-browser-golden-path.yml` | FA/EN, RTL/LTR, mobile/desktop, Chromium/Firefox, axe and interaction evidence |
| `.github/workflows/container-supply-chain.yml` | Container contract, SBOM, vulnerability threshold, rollback/restore, provenance/signing controls |

Main was green at the exact audited SHA. That is reproducible repository evidence, not a substitute for live staging, real provider certification, recovery drills, or human security review.

## 11. Soft Launch Readiness

The controlled Soft Launch boundary should be read as an educational product boundary:

| Capability | Current launch boundary |
|---|---|
| Public landing | Included for governed FA/EN routes |
| Persian/English experience | Included on governed public paths; application-wide parity still incomplete |
| Academy | Controlled inclusion; canonical progression server-backed |
| Mentor AI | Controlled educational assistance; provider/config dependent, no financial advice |
| Virtual Trading Arena | Controlled inclusion as simulation; official core server-backed |
| Real-money Exchange | Disabled/gated |
| Custody and withdrawals | Disabled/gated |
| Community | Limited governed learning evidence; broad social layer and public ranking disabled |
| White-label/multi-tenant | Post-launch/planned |
| Developer platform | Post-launch/planned |
| AI Operating System | Long-term platform direction |

The repository is not fully production-ready as a complete TecPey vision. It has production-evidenced infrastructure components and product authorities that can support a controlled educational launch after the remaining operational gates are accepted.

## 12. Critical Path to Soft Launch

GitHub labels are inconsistent with the controlled launch boundary: several strategic product programs carry `P0` in their titles even though their own contracts or safe gating make them post-launch. The following prioritization is based on release impact rather than title alone.

### P0 — controlled Soft Launch blockers

1. **#110 — disaster recovery and data durability.** Depends on the migration/runtime and deployment contracts merged through PRs #258/#259. Required to protect authoritative Academy/Arena/Mentor data and becomes an absolute gate for financial activation.
2. **#229 — real staging scheduler/alert evidence.** Requires repository-owned deployment to an actual staging host; cannot be proven by mocks or CI fixtures.
3. **#164 — fail-closed CSP endpoint allowlisting.** Bounded security hardening for production browser egress.
4. **#162 — restore lint correctness authority.** Removes known static-analysis blind spots before broader Beta work.
5. **#156/#50 — release evidence reconciliation.** These are broad umbrellas; remaining work must be decomposed and accepted without reopening already-proven areas.

Issue #254 appears fulfilled by PR #257 and should be reconciled/closed rather than reimplemented. Issue #77 appears superseded by the Decimal-safe matching work described as merged in #30 and should be verified and closed or labelled duplicate.

### P1 — before Beta or expansion

- **#26:** finish repository authority consolidation, hygiene, staging, and cross-device evidence.
- **#85:** complete consent-aware communications beyond current in-app/outbox foundations.
- **#160:** Community lifecycle, retention, and future Instructor governance while ranking remains disabled.
- **#80/#83:** complete and runtime-verify public/discovery product surfaces without expanding the controlled financial boundary.
- **#13:** extend the admin control plane, privileged inventory, and dual control before sensitive operational expansion.
- **#100:** execute the remaining independent red-team program before a higher-risk release.

### P2/post-launch programs

- **#226:** shadow-only reputation projection; public ranking remains separately gated.
- **#82:** full social-learning network.
- **#84:** full TecPey AI Operating System.
- **#20/#109:** multi-tenant and white-label platform plus complete isolation proof.
- **#30/#29/#106:** P0 for real-money activation, but safely deferred from an education/Arena Soft Launch only while Exchange, custody, and withdrawals remain disabled.

Recommended dependency order: migration/deployment foundations (complete) → #110 recovery → #229 staging evidence → #164/#162 bounded security/quality → #156/#50 exact release reconciliation → controlled launch → product Beta work → real-money certification chain (#109, #13, #30, #29, #106, compliance, #100) → enterprise/multi-tenant programs.

### Complete open-issue inventory at audit time

| Issue | Repository contract | Audit disposition |
|---|---|---|
| #13 | Enterprise Admin Control Plane/security program | P1 foundation; P0 before sensitive financial operations |
| #20 | Multi-tenant and white-label platform | P2/post-launch program |
| #26 | Backend consolidation, hygiene, completion audit | P1 umbrella; decompose remaining evidence |
| #29 | Withdrawal authority and broadcast idempotency | Core merged; remaining work P0 for real money |
| #30 | Exchange reconciliation/recovery/production sequencing | P0 for real money; gated from educational launch |
| #50 | Platform-wide strict QA/release evidence | Controlled-launch reconciliation umbrella |
| #77 | Decimal-safe fill/wallet conservation | Likely stale after merged exactness work; verify before closing |
| #80 | Public UI/UX completeness | P1 product completion after governed Golden Path |
| #82 | Full governed social-learning network | P2 while current Community remains limited |
| #83 | News, Coins, and Trader Toolbox completion | P1 product depth |
| #84 | TecPey AI Operating System | P2 platform program |
| #85 | Consent-aware notification/communication platform | P1; current foundations are narrower |
| #100 | Platform-wide adversarial Red Team | P1 controlled launch review; P0 for real money |
| #106 | Production custody launch gate | P0 for custody/real money; current production gate is disabled |
| #109 | Cross-tenant/principal isolation | P0 for financial/multi-tenant activation; P2 for explicitly single-tenant education scope |
| #110 | Failure recovery, rollback, and DR drills | Highest controlled-launch operational priority |
| #156 | Repository-wide QA and engineering README | P0/P1 umbrella; this audit addresses documentation only |
| #160 | Community, Instructor, and lifecycle authority | P1/P2; fail-closed ranking/Instructor boundary retained |
| #162 | React hooks/immutability/TypeScript lint authority | P1 bounded quality gate |
| #164 | Fail-closed CSP connection policy | P1-labelled bounded security gate; complete before public launch approval |
| #226 | Shadow-only reputation projection | P2; public ranking remains disabled |
| #229 | Real staging scheduler/host evidence | P0 operational evidence |
| #254 | Public Browser Golden Path/truthful claims | Appears fulfilled by PR #257; reconcile and close if acceptance evidence still passes |

## 13. Known Risks and Technical Debt

- Production backup policy, RPO/RTO, cross-release restore, and queue/object-store recovery are not fully evidenced (#110).
- Real staging scheduler and alert activation is not evidenced (#229).
- CSP production connection policy can fall back to broad schemes in `src/proxy.ts` (#164).
- ESLint correctness rules are disabled in repository configuration (#162).
- Some active experience state and legacy simulation modules remain browser-local but classified by `scripts/check-browser-persistence.mjs`.
- The official Arena and canonical Academy paths are server-backed, but full cross-device and failure-mode coverage is not uniform across every experience.
- Mentor events include an in-process/non-durable path in `src/lib/mentor-events.ts`.
- Current runtime is single tenant; platform-wide isolation is incomplete (#109/#20).
- Real-money reconciliation, custody, external providers, and incident recovery remain unapproved (#30/#29/#106/#100).

## 14. Product and UX Risks

- **Truthful claims:** Public copy was corrected by PR #257, but every new surface must continue to separate educational market information, simulation, and unavailable real-money execution.
- **Expectation mismatch:** The breadth of routes can look like activation. Disabled/gated state labels must remain visible for Exchange, custody, ranking, Instructor, and enterprise capabilities.
- **Incomplete routes:** Issues #80 and #83 record remaining public product depth and interaction gaps.
- **FA/EN parity:** Public Golden Path parity is evidenced, but the Persian Academy route tree is deeper than English.
- **Accessibility:** Axe/WCAG-oriented checks cover governed public paths across four projects; authenticated product surfaces do not have equivalent comprehensive evidence.
- **Visual coherence:** Multiple generations of Academy/internal QA components and design tokens create design-system fragmentation risk; broad redesign is not justified by this audit.
- **Onboarding continuity:** Academy, Arena, and Mentor are technically connected through data, but the journey can still be unclear across legacy and current experiences.
- **Generic presentation risk:** Some static cards and broad aspirational surfaces can read as generated catalogue content unless provenance, source freshness, and functional depth are maintained (#83).

## 15. Documentation Risks

The documentation tree contains strong current contracts and a large volume of historical phase reports without a consistently enforced authority hierarchy.

- `docs/architecture/DATABASE_MIGRATION_RUNTIME_CONTRACT.md`, `migrations/README.md`, and `docs/operations/PRODUCTION_DEPLOYMENT_CONTRACT.md` are current implementation contracts.
- `docs/TECPEY_MASTER_BLUEPRINT.md` is strategic direction, not proof of implementation.
- `docs/PRODUCTION_DECISIONS.md` includes stale decisions about browser authority, migration availability, market data, and custody defaults that conflict with current code.
- `docs/LAUNCH_ACCEPTED_RISKS.md` retains a stale summary reference to schema-on-connect even though its detailed entry was superseded.
- `docs/architecture/TECPEY_BACKEND_AUTHORITY_MAP.md` predates the canonical migration registry and current Arena/Mentor work.
- `docs/FINAL_IMPLEMENTATION_GATE.md` and `docs/LAUNCH_MODE_POLICY.md` are point-in-time phase authorities whose unresolved statements do not uniformly reflect current main.
- `docs/internal-qa` contains many “final”, “10/10”, and “world-class” reports. These are historical evidence, not current release authority.
- `docs/Deployment.md`/`DEPLOY_UBUNTU_24_PRODUCTION.md` references should be checked against the current production contract; the repository does not contain the referenced `.env.production.example`.

This audit records contradictions but intentionally changes no third document. A separate documentation-authority reconciliation should archive or supersede stale reports without erasing history.

## 16. Recommended Next Steps

1. Execute Issue #110 with production-like PostgreSQL/Redis backup, restore, cross-release, corruption, and recovery-time evidence. This has the highest dependency leverage and trust benefit.
2. Complete Issue #229 on an actual staging host, including scheduler, alert delivery, duplicate prevention, and collected evidence.
3. Close the bounded browser egress and lint-authority gaps in #164 and #162.
4. Reconcile stale/duplicate issues (#254 and likely #77) and decompose broad umbrellas (#50/#156/#26) into remaining falsifiable gates.
5. Run an exact-scope controlled launch review that includes user-data durability, public claims, authenticated Academy/Arena journeys, privacy/consent, and incident ownership.
6. Keep real-money Exchange, custody, and withdrawals disabled until #30, #29, #106, relevant #109/#13 controls, compliance/provider certification, and #100 evidence pass.
7. Treat Community, AI OS, multi-tenant/white-label, and developer-platform work as staged product programs, not prerequisites silently mixed into the first controlled educational launch.

## 17. Final Verdict

Today, TecPey is a substantial education-first digital-finance application with multilingual public surfaces, server-authoritative Academy and virtual-practice foundations, governed Mentor memory, an implemented but gated financial core, and unusually strong repository-level migration, security, and deployment authority checks.

It is not yet an activated real-money exchange, production custody or withdrawal service, complete social network, full enterprise admin platform, multi-tenant/white-label SaaS, public developer ecosystem, or finished AI operating system. Those distinctions are supported by code gates and open Issues, not merely roadmap language.

The public landing, controlled Academy journeys, governed educational Mentor, and official virtual Arena are the defensible Soft Launch scope, subject to operational data-recovery and staging evidence. Exchange, custody, withdrawals, public ranking, and enterprise claims remain gated. The single most important next engineering phase is Issue #110: prove that authoritative user and operational state can be backed up, restored, reconciled, and recovered predictably before inviting users to depend on it.
