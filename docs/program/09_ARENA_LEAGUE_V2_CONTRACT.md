# Arena & League v2: fairness, seasons, scoring + governed rewards

**Base main:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

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
Upgrade Arena + League into a reproducible competition system with explainable scoring and anti-abuse controls.

## Deliverables
- $100k virtual account and 3 attempts/cycle become versioned configuration.
- Explicit season lifecycle, timezone, enrollment, reset and immutable snapshot rules.
- Authoritative drawdown/exposure/risk-discipline and valid journal/execution metrics.
- Versioned scoring formula; historical seasons retain original version.
- Leaderboard snapshots + user-neighborhood rank; monthly/all-time views without unbounded recomputation.
- Replay/live data provenance and stale handling.
- Simulation/maker bots clearly labeled and excluded from human ranking contamination.
- Mentor challenges cannot alter fills/results.
- Reward policy separate from rank: fraud/KYC/legal checks and pending verification; no cash promise without approved policy.
- Anti-gaming evidence for duplicate accounts, replay abuse, impossible timing and suspicious scoring.
- Accessible chart/order controls with non-drag alternatives.

## Acceptance
Same immutable event history + scoring version always yields the same score/rank. Formula changes create a new version and never rewrite prior results.

## Delivery discipline
This Draft PR begins as an implementation contract. Code, migrations, tests and evidence are added to this same branch. It cannot become Ready until every acceptance item is implemented or explicitly split into a named follow-up.

## Release boundary
Opening this PR authorizes no merge, Staging mutation or Production mutation.
