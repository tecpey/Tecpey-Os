# TecPey growth landing implementation checkpoint

A shared FA/EN landing replaces duplicate implementations. It combines the selected mountain direction with the existing TecPey shell, theme tokens and animated background.

Journey order: entry → attributed translated news → market data and heatmap → seven Academy terms → virtual Arena and journal → league → planned graduation Pro gift → Term 8 growth seasons → exchange in development → skills record.

## Current integrations
- `/api/crypto-news`: real archive, source links and publication timestamps, refresh/error/empty states.
- `/api/markets?source=public&limit=30`: existing provider authority, upstream freshness filtering and precise small-asset price formatting. Recharts treemap uses actual available cap/volume weights; a list provides accessible details and links. No synthetic values fill missing weights.
- `/api/arena/leaderboard`: intent-triggered authenticated read; no shared query caching, pending cancellation, hidden-page clearing and explicit close.
- Existing localized Academy, mentor, Arena, profile and Term 8 routes.

## Remaining product work
This is a landing change, not a dashboard/backend completion claim.
- Add independently sourced global indicators with definitions, timestamps and an API contract before displaying numeric gauges.
- Build reward budgets, published eligibility, award records and grant processing. Current learning-league policy disallows cash and automatic entitlements are disabled; this proposal does not change that policy or activate payouts.
- Define and implement one-time one-month Pro graduation entitlement independently of league position, including existing graduates, reprocessing/idempotency and expiry rules.
- Exchange execution, connected real-trade mentor analysis and deposits/withdrawals remain outside this implementation.
- Reuse the market/news building blocks in the user dashboard only after its own authenticated layout and state review.

## Validation
- 26 targeted locale, route-boundary, numerical integrity, freshness and market-containment tests passed.
- TypeScript check and scoped ESLint passed.
- UI style authority and disabled-capability attestation passed; the latter now checks the active shared component, preserving all three required boundary strings.
- Additional disabled-capability and calm-entry regression results recorded in the draft PR.
- Browser visual QA is blocked, as documented in `design-qa.md`. No merge or deployment is part of this checkpoint.
