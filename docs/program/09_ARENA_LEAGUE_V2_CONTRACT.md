# Arena & League v2: fairness, seasons, scoring + governed rewards

**Base main:** `96b56d0e469b356ccf8ee698c5a75a36d1cabe60`

**Dependencies:** Existing Arena execution authority; Pro Commerce for paid entitlements; Living Profile consumes rank snapshots.

## Global quality bar

- Authority-sensitive state is server-owned, tenant-bound and fail-closed; clients cannot create entitlement, identity, mastery, rank or safety truth.
- No fabricated intelligence without named authority + provenance/freshness.
- Content-first design; glass only for navigation/controls/light overlays; no glass-on-glass.
- WCAG 2.2 AA minimum, 44px preferred primary targets, visible focus, reduced-motion/transparency-safe behavior.
- FA/EN parity, RTL/LTR correctness, logical CSS, bidi isolation.
- Schema validation, CSRF/rate limits, session/tenant checks, idempotency/replay defense, audit logs and negative tests.
- Structured logs, reason codes, degraded states and exact freshness.
- TypeScript, ESLint, unit/integration/security/browser tests, repository audit and exact-head CI.
- Immutable exact-SHA staging-first release with rollback proof; Production requires separate explicit approval.

## Objective

Upgrade Arena + League into a reproducible learning-competition system with explainable scoring, bounded risk, immutable ranking evidence and anti-abuse controls. Current Ready scope is **account-level, non-prize learning competition** unless a named reward/compliance authority explicitly activates more.

## Implemented authority in this track

### Versioned account + season rules
- `$100,000` virtual starting capital and three attempts/cycle are server defaults; season configuration independently persists versioned initial balance, attempts/cycle, timezone, enrollment/start/end boundaries and scoring-policy version.
- Season lifecycle is one-way: `draft -> enrollment -> active -> closing -> finalized`.
- Enrollment is tenant/workspace/student scoped and can be withdrawn/disqualified before immutable finalization.
- Season configuration is canonicalized and digest-bound so a historical season cannot silently inherit a later formula/configuration.

### Execution + risk truth
- Server market snapshots determine fills; browser chart/widget state is never execution authority.
- Live snapshots carry source + provider observation time and reject stale, implausibly future or invalid market evidence before an authoritative command executes.
- Decimal-based fees/PnL, position/order limits, allocation caps, per-position stop-defined risk, aggregate stop-risk, drawdown and unbounded exposure telemetry are server-owned.
- Command time is monotonic and serialized. Idempotency and request hashes prevent a duplicated/reused command identity from silently changing execution.
- Mentor-facing risk context is a projection of execution evidence; Mentor text/challenge metadata cannot alter fill price, fee, slippage or authoritative result.

### Immutable scoring + ranking
- Closed-trade evidence is checked for chronology, settlement consistency, canonical position identity and immutable mentor flags before scoring.
- `arena-league-scoring-v1` is deterministic and versioned; historical season snapshots retain their original scoring-policy identity.
- Score rows are append-only, tenant/workspace/student-bound and digest-bound. Replays with different evidence fail closed.
- Daily activity ordinal is transaction-serialized across generic and season scoring so concurrency cannot mint duplicate early-trade participation points.
- Retroactive insertion after later same-day evidence is rejected unless it is an exact replay.
- Monthly/yearly/lifetime and season-specific rankings materialize immutable versioned snapshots; newer generic cutoffs create new versions instead of rewriting prior snapshots.
- Authenticated reads expose bounded leaderboard results plus a snapshot-version-bound private viewer neighborhood; public visibility revocation does not erase the owner’s private rank.

## Journal / reflection fairness boundary

Trading Arena reflections are real server authority: they are written only for an owned closed trade, bind `student + attempt + closedTradeId`, preserve immutable trade evidence, use optimistic revision control and idempotent command replay, and reject corrupt evidence.

However, **post-trade reflection completion does not change `arena-league-scoring-v1` trade points**. Trade scoring is committed at close time, while a reflection is intentionally written later and may be revised. Retroactively mutating an append-only close-time score would make outcomes depend on observation timing and would violate deterministic historical replay.

Accordingly:
- the v1 trade adapter sets `journalCompleted=false` deliberately;
- journal/reflection remains valid learning/Mentor evidence, not a hidden retroactive v1 rank modifier;
- if future competition policy rewards a post-trade reflection, it must introduce a new scoring-policy version and an immutable, separately identified scoring event rather than rewriting the historical trade score;
- historical v1 scores must never be reinterpreted as if a later reflection existed at close time.

## Current rewards truth

Rank and credential evidence are separate from financial reward execution.

- The current Academy monthly reward proposal returns zero Arena Pro days, zero cash share and `not_permitted_in_learning_league`.
- Automatic Arena entitlement issuance remains disabled.
- Entitlement authority records `cashExecutionEnabled: false`; no payout worker is introduced here.
- Credential/medal issuance is derived from finalized snapshot evidence and is replay-safe; it is recognition, not a promise of cash value.
- No public copy or API may imply a cash/prize entitlement from rank while the governed reward/compliance tracks are incomplete.

Any future non-zero public incentive or prize requires **#720 Rewards** (eligibility, fraud/accounting and payout authority) and, where identity/KYC/KYT/legal/sanctions applies, **#713 Compliance**. A rank alone is never sufficient payment authority.

## Anti-gaming boundary

This track proves account-level controls: immutable/replay-safe source events, impossible chronology/settlement rejection, bounded request/rate controls, transaction-serialized daily scoring, tenant isolation, student-only principal binding, explicit enrollment/disqualification and immutable snapshot versions.

It does **not** claim that one `student_id` proves one natural person. Duplicate-natural-person/account correlation, coordinated abuse/anomaly review and prize-impacting integrity holds are owned by **#742 Arena League identity-integrity and anomaly hold authority**. Until that closes, this track is a non-prize account-level learning leaderboard and must not advertise one-person-one-account prize eligibility.

## Live vs replay / maker boundary

The current execution slice is live server-authoritative practice. Historical OHLCV can be shown as governed chart context, but production scored historical replay and simulation/market-maker actors are not complete here.

**#741 Arena deterministic historical replay and simulation/maker isolation** owns:
- frozen/versioned historical datasets and no-future-data leakage;
- replay scenario clock and deterministic execution identity;
- explicit live/replay provenance in scored evidence;
- any simulation/maker actor identity and hard exclusion from human ranking/credentials/rewards.

Until #741 closes, no historical replay or maker/simulation capability may be represented as a production-complete scored competition mode. Existing score rows are constrained to `principal_type='student'`.

## Accessibility + interaction acceptance

- The current Arena chart is informational and does not require drag to operate; timeframe selection uses explicit buttons.
- Order intent uses labelled form controls/buttons rather than drag gestures, so no essential trading action depends on dragging.
- Any future replay scrubber, chart manipulation or order-control gesture must provide a single-pointer alternative consistent with WCAG 2.2 Dragging Movements.
- FA/EN, RTL/LTR, keyboard focus, mobile reflow, reduced motion and automated axe/browser evidence remain mandatory; physical/manual evidence is not inferred from automation alone.

## Ready acceptance for #705

#705 can become Ready for the **non-prize live Arena + account-level League v2 slice** only when all of the following are true on the same exact head:

1. execution/risk, season, scoring, ranking/neighborhood, credential and disabled-reward authorities above remain implemented and tested;
2. journal-v1 temporal boundary above is explicit and no production path retroactively mutates trade scores;
3. live market source/freshness evidence remains fail-closed;
4. generic and season ranking snapshots remain deterministic under replay/concurrency/adversarial tests;
5. tenant/workspace/student isolation and API security evidence are green;
6. FA/EN browser/accessibility automation is green and no essential current Arena action requires dragging;
7. no unresolved inline review finding remains and independent review is bound to the exact head;
8. exact-head CI, Full Suite, Browser, API Security, Repository Audit, Secret Scanning, Sensitive Mutation and protected PostgreSQL/RLS evidence required by branch protection are green.

The named follow-ups #741/#742/#720/#713 are not silently waived: Ready status here simply means this bounded non-prize live slice does not claim their capabilities.

## Delivery discipline

This Draft PR began as an implementation contract. Code, migrations, tests and evidence stay reviewable on the same branch. Any new authority outside the Ready boundary above requires implementation here or an explicit named follow-up with a fail-closed product truth.

## Release boundary

Ready or merge eligibility does not equal launch approval. Opening/marking Ready/merging this PR authorizes no Staging or Production mutation. Exact-candidate staging/rollback evidence and any broader Go decision remain separately governed.
