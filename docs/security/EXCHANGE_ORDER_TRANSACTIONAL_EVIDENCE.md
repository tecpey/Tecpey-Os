# Exchange Order Transactional Evidence Authority

Status: **P0 security and financial authority implemented**  
Issue: **#186**  
Parents: **#161, #100, #156**  
Coordinates with: **#30, #76, #77**  
Owners: **security-platform / exchange-platform**

## Purpose

Exchange order evidence is part of financial correctness, not post-commit observability. An order admission, final accepted/rejected outcome, or cancellation must never become durable unless its mandatory typed evidence is durable in the same PostgreSQL transaction that owns the financial state transition.

PostgreSQL remains the source of truth for orders, balances, holds, wallet ledger entries, trades, domain events, command state, idempotency receipts and mandatory audit evidence. Redis, in-memory books, logs and queue delivery are projections or operational accelerators only.

## Typed evidence actions

- `exchange.order.admit`
- `exchange.order.finalize`
- `exchange.order.reject`
- `exchange.order.cancel`

Resource:

- `exchange_order`

The events are stored in `sensitive_mutation_audit_events` and inherit its append-only, correlation-conflict, bounded-metadata and forbidden-secret controls.

## Admission authority

`POST /api/orders` verifies strict canonical session authority, CSRF, principal-scoped rate limits, exact-string financial input, authoritative market state, risk policy and an exact idempotency key.

`admitExchangeOrderCommand()` commits one tuple:

1. order row;
2. exact balance hold;
3. immutable hold ledger entry;
4. durable Exchange command;
5. `OrderAdmitted` domain event;
6. mandatory `exchange.order.admit` evidence.

The evidence is appended by the `exchange_order_command_admission_evidence` PostgreSQL trigger. Any evidence error rolls back the complete tuple. Exact duplicate admission replays the original command and does not duplicate order, hold, ledger or evidence. Changed idempotent payload conflicts.

The placement route no longer writes best-effort `order_placed` audit records after commit.

## Final accepted/rejected outcome authority

Matching and terminal rejection remain inside the existing Exchange engine transaction. Final lifecycle events are observed by the deferred constraint trigger `exchange_order_final_evidence` at transaction end, after all trade, order, hold-release and wallet-ledger mutations are complete.

The trigger derives evidence only from committed PostgreSQL authority:

- order state and exact financial strings;
- durable command tenant, principal and request hash;
- committed trades and a bounded one-way trade-set fingerprint;
- terminal reason code;
- exact hold-closure state.

It writes:

- `exchange.order.finalize` for accepted outcomes;
- `exchange.order.reject` for committed rejected/expired outcomes.

Terminal rejected outcomes cannot emit evidence unless the order hold residual is exactly zero. Evidence failure aborts the matching/terminal transaction, restoring the prior order state and hold.

The `exchange_order_command_final_evidence_gate` trigger independently prevents a command from entering `final` unless exact evidence exists for the same tenant, order fingerprint, service actor, action, request hash, correlation and final state.

## Cancellation authority

`DELETE /api/orders/[id]` requires strict canonical session authority, CSRF, a validated idempotency key and the canonical request hash. It delegates only to `cancelOrderIdempotently()`.

The canonical cancellation transaction commits:

1. conditional `NEW` or `PARTIALLY_FILLED` to `CANCELLED` transition;
2. exact ledger-derived residual hold release;
3. hold-closure assertion;
4. `OrderCancelled` domain event;
5. mandatory `exchange.order.cancel` evidence containing the exact released amount;
6. durable API command receipt.

Mandatory evidence is written before the successful API receipt. Evidence failure rolls back cancellation, balance mutation, release ledger, domain event and receipt. Exact replay returns the stored result without duplicate evidence or release.

The cancellation route no longer writes best-effort `order_cancelled` audit records after commit.

## Evidence privacy and integrity

Evidence uses domain-separated SHA-256 fingerprints for order, market, correlation and trade-set identity. It never stores:

- raw order IDs in metadata;
- raw trade ID arrays;
- idempotency keys or correlation seeds;
- cookies, access or refresh tokens;
- API keys, passwords, WebAuthn/TOTP material;
- IP addresses or full user-agent strings;
- unrestricted request bodies;
- wallet addresses or KYC payloads.

Financial metadata is derived from PostgreSQL exact strings and Decimal-safe boundaries. No new JavaScript-number financial authority is introduced. Remaining matching-number work stays governed by #76/#77.

## Legacy cutover policy

Migration `0037_exchange_order_transactional_evidence.sql` fails closed if legacy Exchange commands exist without exact admission evidence, or final commands exist without exact final/reject evidence. Historical financial events must be explicitly reconciled; migration never fabricates transaction-coupled evidence after the fact.

Migration `0038_exchange_order_final_evidence_gate.sql` installs the deferred final-event trigger and the final-command gate.

Both migrations are ordered after sensitive-mutation audit authority and are checksum-pinned and idempotent.

## Recovery semantics

Worker attempts, leases and backoff remain durable in `exchange_order_commands` and `exchange_order_command_attempts`.

When final evidence fails:

- the financial engine transaction rolls back;
- order and hold remain in their prior authoritative state;
- the command is recorded as `retryable` with bounded backoff;
- a due retry re-enters the canonical processor;
- successful recovery creates exactly one final/reject evidence event and one final command result.

A forged direct command-final update is rejected by PostgreSQL even when application code is bypassed.

## Permanent controls

- `scripts/check-exchange-order-admission.mjs`
- `scripts/check-exchange-order-evidence.mjs`
- `Exchange Authority` GitHub workflow
- exact API Security Manifest reviewed deltas for placement and cancellation routes
- Sensitive Mutation Audit workflow
- focused PostgreSQL rollback, replay, concurrency, forged-final and recovery tests

The guards prohibit route-side best-effort order audit authority and production route use of legacy split order, hold or engine-cancellation helpers.

## Operational verification

Before release, run on one unchanged commit SHA:

```bash
npm run db:migrate
npm run db:migrate
npm run exchange:check
npm run test:exchange-order-authority
npm run audit:sensitive:check
npm run test:sensitive-mutation-audit
npm run api:security:check
npm run test:api-security-manifest
npm run typecheck
npm run lint
npm test
npm run build
```

Required GitHub workflows:

- CI
- Full Suite Diagnostics
- Exchange Authority
- Sensitive Mutation Audit
- API Security Manifest

## Completion decision

**GO for #186 merge only when all required workflows pass on one unchanged exact head.**

The implementation closes the identified evidence gap for order admission, accepted/rejected final outcome and user cancellation. It does not claim completion of the broader Decimal/matching work in #76/#77, custody, withdrawals or distributed market-ownership programs.
