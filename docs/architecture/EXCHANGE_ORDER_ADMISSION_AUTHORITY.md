# Exchange Order Admission Authority

## Release invariant

An Exchange placement request is successful only when one durable PostgreSQL command identifies the exact request, one order exists, the exact hold is committed, and execution is either final or explicitly recoverable. A rejected, expired, filled or cancelled order may not retain a positive order-hold residual.

## Command lifecycle

`admitted -> processing -> final`

Recoverable failures transition to `retryable`; expired worker leases are reclaimed. Exhausted retries transition to `failed_terminal` and block release until operational reconciliation. API responses never translate an ambiguous command into a clean terminal result.

## Authority boundaries

- strict Redis-backed session revocation is mandatory for placement and cancellation;
- PostgreSQL owns order, command, hold, ledger, trade and terminal state;
- a PostgreSQL advisory lock owns one market matching/cancellation critical section across all processes;
- Redis and in-memory order books are rebuildable caches, never financial authority;
- an idempotency key is bound to the canonical tenant, principal, request and hold fingerprint;
- exact duplicate retries replay the committed command; changed reuse fails with conflict;
- market buys require an explicit maximum quote amount;
- terminal transitions and residual hold release share one transaction;
- worker recovery reconstructs already-committed engine outcomes before attempting execution again.

## Deployment gate

Migration `0027_exchange_order_admission_authority.sql` refuses to install while legacy open orders exist. Operators must first reconcile or deliberately terminate those orders and prove their holds and ledger evidence. This prevents ambiguous pre-authority orders from silently entering the new recovery model.

## Runtime operations

Run `npm run exchange:worker` continuously under a supervised service. Alert on:

- `failed_terminal > 0`;
- commands remaining `processing` beyond their lease;
- growing `retryable` age or attempt count;
- terminal orders with a non-zero ledger-derived hold residual;
- market-lock contention that remains elevated;
- PostgreSQL or Redis authority/cache rebuild failures.

## Permanent evidence

- `npm run exchange:check`
- `npm run test:exchange-order-authority`
- clean migration followed by an idempotent migration rerun
- project-wide TypeScript, ESLint, full tests and build
- dedicated Exchange Authority CI workflow
