# Trading Arena UI Authority Contract

**Status:** Phase A implementation candidate
**Scope:** Production Arena dashboard and server-evidence journal

## Source-of-truth hierarchy

1. `/api/trading-arena/execution` is the only production execution interface.
2. PostgreSQL stores the active attempt, execution aggregate, revision, commands and events.
3. Server market snapshots determine fills, projected equity, stop-loss and take-profit behavior.
4. The browser stores only form input and the latest disposable rendering projection.
5. A command is valid only with the current `expectedRevision` and a unique idempotency key.

The production dashboard may not import the legacy browser execution engine, create random prices, reset durable Arena state, or write journal entries to localStorage.

## Command behavior

- Market buy, limit buy, close position, cancel order and market refresh are submitted to the execution API.
- A `409 revision_conflict` response is parsed as an authoritative snapshot and applied before the user retries.
- A reused idempotency key with different semantics fails closed.
- Ambiguous network and 5xx failures retain the same idempotency key and original expected revision for a safe retry of the same command payload.
- Form values are cleared only after a successful authoritative response.
- Responses with lower revisions, older market observations or stale response ordering cannot overwrite newer UI state.
- When positions or pending orders exist, periodic `refresh_market` commands allow the server to process fills and protective exits.
- When the account has no live command state, polling is read-only.

## Ambiguous command recovery

When a request fails without a definitive server result, the client preserves the complete command, original expected revision and idempotency key in memory. Background polling retries that exact command first. A different command is blocked until the server returns success, replay, revision conflict or another definitive response. An identity from a previous attempt is never replayed against a new attempt.

## Journal boundary

Phase A removes localStorage from the production journal and displays:

- open-position plans and emotional state;
- pending-order evidence;
- closed-trade execution, fees, realized PnL, closure reason and Mentor flags.

Phase B will add server-owned post-trade reflections, mistake tags and learned lessons linked to execution identities. Until that API exists, the UI must not pretend that browser-only reflections are durable.

## Scenario quarantine

The legacy scenario player invokes a browser execution engine whose trade helpers persist directly to localStorage. The production scenario route is therefore quarantined behind an explicit migration notice. It must not import `ScenarioPlayer` again until scenario commands and progress are server-owned, cross-device and linked to Mentor evidence.

## Failure behavior

- Missing Academy profile, unavailable database, missing active attempt and unavailable price feed are explicit states.
- Price-dependent commands fail closed when the server feed is unavailable.
- Transient failures preserve the user's order form.
- No browser fallback may create or mutate execution truth.

## Required merge evidence

- production environment contract;
- TypeScript and ESLint;
- browser persistence and Admin boundary guards;
- Academy and Arena UI authority guards;
- stale-response/idempotency parser tests;
- complete automated tests;
- production build on the exact merge head.
