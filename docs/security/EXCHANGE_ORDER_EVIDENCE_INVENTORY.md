# Exchange Order Transactional Evidence Inventory

Status: **P0 implementation inventory**  
Issue: **#186**  
Parents: **#161, #100, #156**  
Coordinates with: **#30, #76, #77**  
Inventory base: **`86989c982c2f4926c6a64e6335f4f5df5f793db1`**  
Owner: **security-platform / exchange-platform**

## 1. Bounded objective

This slice makes mandatory Exchange order evidence commit with the authoritative PostgreSQL mutation that it proves. It covers:

1. user order admission and exact hold reservation;
2. durable command/idempotency creation;
3. final accepted or rejected command outcome;
4. user cancellation and residual hold release;
5. recoverable worker/lease semantics;
6. permanent prevention of route-side best-effort evidence.

This slice does **not** redesign custody, withdrawals, market ownership, the complete matching algorithm, or the broader Decimal migration owned by #30/#76/#77.

## 2. Existing authority that must be preserved

The repository already has a meaningful financial authority foundation:

- PostgreSQL owns orders, balances, holds, immutable wallet ledger rows, trades, command state and terminal state;
- `exchange_order_commands` provides tenant/principal/idempotency/request-hash authority;
- admission uses a PostgreSQL advisory transaction lock;
- order creation, exact hold reservation, immutable hold ledger and command creation share one transaction;
- worker leases, attempts and recovery state are durable;
- matching and cancellation share a cross-process market execution lock;
- cancellation conditionally transitions only `NEW` or `PARTIALLY_FILLED` orders;
- residual hold release is ledger-derived, serialized per order and idempotent;
- final/terminal paths prove the order hold is closed;
- Redis and in-memory books are rebuildable caches;
- only final accepted commands are restored as maker liquidity;
- API idempotency receipts make cancellation responses replayable;
- placement and cancellation require strict canonical session revocation authority;
- request quantity, price, stop price, quote cap and hold amounts remain exact strings at admission boundaries.

# 3. Production mutation-path inventory

## 3.1 User order placement route

**Path:** `src/app/api/orders/route.ts` — `POST /api/orders`

**Verified identity**

- principal: `getCanonicalSession(req, { strictRevocation: true })`;
- user ID: verified session `userId` or `studentId`;
- tenant: server-owned `PLATFORM.DEFAULT_TENANT_ID`;
- no request-controlled tenant or principal is accepted.

**Pre-admission controls**

- CSRF origin verification;
- principal-scoped rate limit;
- bounded JSON body;
- exact-string quantity/price/stop-price/quote-cap requirements;
- market state from `getActiveMarketStrict()`;
- risk enforcement and order-risk check;
- exact Decimal validation and hold calculation;
- exact available-balance precheck;
- required idempotency key.

**Delegated authority**

- `admitExchangeOrderCommand()`;
- `processExchangeOrderCommand()`.

**Current evidence defect**

After command finalization the route calls legacy best-effort `writeAudit()` with action `order_placed`. Order/hold/command/final state can already be committed when this audit write fails or the process exits. This call is observability only and cannot remain mandatory evidence.

**Required disposition**

- remove `writeAudit()` as order authority;
- construct a bounded server-derived financial evidence context;
- pass it into the canonical admission/finalization authority;
- keep structured logger metrics only as non-authoritative observability.

## 3.2 Transactional order admission

**Path:** `src/lib/trading/order-command-service.ts` — `admitExchangeOrderCommand()`

**Current transaction and locking**

- transaction-level advisory lock on tenant + user + idempotency key;
- exact canonical request hash;
- replay and changed-payload conflict detection;
- order insertion through `createOrderTx()`;
- exact hold mutation through `holdOrderFundsTx()`;
- immutable wallet hold ledger insertion;
- `exchange_order_commands` insertion;
- transactional `OrderAdmitted` domain event.

**Rows mutated atomically**

- `orders`;
- `wallet_balances`;
- `wallet_ledger`;
- `exchange_order_commands`;
- `order_events`.

**Existing idempotency**

- unique `(tenant_id, user_id, idempotency_key)`;
- immutable request hash;
- one unique command per order;
- duplicate exact command replays the original order/command;
- changed replay returns conflict.

**Current evidence defect**

`OrderAdmitted` is a domain event, not the governed mandatory financial audit authority. The admission transaction does not append typed `exchange.order.admit` evidence. Forced evidence failure therefore cannot currently roll back the order, hold, ledger and command tuple.

**Required disposition**

Append mandatory `exchange.order.admit` evidence in this same transaction after all authoritative rows exist and before commit. The event must represent hold reservation inside admission metadata; a separate `exchange.order.hold.reserve` action is unnecessary unless implementation proves that admission evidence cannot unambiguously represent it.

## 3.3 Matching command claim and recovery

**Paths:**

- `src/lib/trading/order-command-service.ts` — `claimCommand()`, `recoverExpiredCommandLease()`, `failCommand()`;
- `scripts/run-exchange-order-worker.ts`.

**Current authority**

- command claim is a conditional PostgreSQL state transition;
- worker identity, attempt number and lease expiry are durable;
- expired leases become retryable or terminal according to bounded attempts;
- attempt records are append-only;
- the worker discovers admitted, retryable and expired-processing commands;
- worker health fails when storage is unavailable or terminal reconciliation debt exists.

**Current evidence classification**

`exchange_order_command_attempts` is operational recovery evidence. It does not replace mandatory financial mutation evidence.

**Required disposition**

Preserve the command/attempt model. Mandatory financial evidence must be written by admission, finalization/rejection and cancellation transactions—not by a later worker log. Retry attempt records remain operational evidence.

## 3.4 Matching execution and settlement

**Path:** `src/lib/trading/engine.ts` — `InProcessMatchingEngine.placeOrder()` / `placeOrderLocked()`

**Current ownership and transaction boundaries**

- distributed market execution lock plus local serialization;
- authoritative order-book rebuild before matching;
- maker and incoming order validation under row locks;
- trade creation, order fills, balance/held-balance mutations, wallet ledger entries and order events share the matching transaction;
- filled, IOC remainder, no-liquidity, FOK and market-protection terminal paths release residual holds and prove closure;
- post-commit cache rebuild and event-bus emission are non-authoritative.

**Rows potentially mutated**

- `orders` for taker and maker state;
- `trades`;
- `wallet_balances`;
- `wallet_ledger`;
- `order_events`.

**Decimal residual owned elsewhere**

The engine still calculates candidate fills and fees through JavaScript numbers in several internal structures. That remains governed by #76/#77. #186 must not weaken or disguise this residual and must not introduce new `number` authority into evidence. Evidence must use normalized strings reconstructed from committed PostgreSQL/order/ledger state.

**Current evidence defect**

Transactional domain events exist, but no governed financial audit event proves the final order outcome. A committed acceptance/fill/rejection can exist without the mandatory audit row required by #161/#186.

**Required disposition**

- keep matching mutations in the existing engine transaction;
- append bounded mandatory final-outcome evidence from committed authoritative values;
- terminal rejection/expiry must append `exchange.order.reject` in the terminal mutation transaction;
- accepted/final command outcome must have one explicit governed action, proposed as `exchange.order.finalize`, unless the final design proves `exchange.order.admit` safely covers the complete final result;
- trade-level settlement evidence is not expanded into a new custody/ledger program in this slice; committed trade/ledger rows remain authoritative, while order-level evidence records bounded outcome, final state and trade count/fingerprint.

## 3.5 Command finalization

**Path:** `src/lib/trading/order-command-service.ts` — `finalizeCommand()`

**Current transaction**

- command row locked `FOR UPDATE`;
- lease ownership verified;
- order and committed outcome reconstructed;
- terminal hold closure verified;
- command state/result changed to `final`;
- completed attempt appended.

**Current evidence defect**

No mandatory typed financial evidence is coupled to the command transition to `final`. The API route writes best-effort evidence only afterward.

**Required disposition**

Finalization must append the required governed final-outcome event in the same transaction as command `final` state. Exact replay of an already-final command must not duplicate evidence; changed correlation/request evidence must conflict and roll back.

## 3.6 User cancellation route

**Path:** `src/app/api/orders/[id]/route.ts` — `DELETE /api/orders/[id]`

**Verified identity and controls**

- CSRF verification;
- strict canonical session;
- principal-scoped rate limit;
- UUID validation;
- required validated `Idempotency-Key`;
- canonical request hash;
- delegation to `cancelOrderIdempotently()`.

**Current evidence defect**

After a successful non-replayed cancellation, the route calls legacy best-effort `writeAudit()` with action `order_cancelled`. The order transition, hold release, wallet ledger and idempotency receipt are already committed.

**Required disposition**

Remove route-side `writeAudit()` authority. Pass a bounded cancellation evidence context into the canonical cancellation transaction.

## 3.7 Canonical idempotent cancellation authority

**Path:** `src/lib/trading/order-cancel-authority.ts` — `cancelOrderIdempotently()`

**Current ownership and locking**

- tenant/principal-scoped `ApiCommandScope`;
- prelookup scoped to order and owner;
- distributed market execution lock;
- API command claim/replay/conflict authority;
- owned order read;
- terminal-state check;
- final admission-command requirement;
- conditional `NEW`/`PARTIALLY_FILLED` -> `CANCELLED` update with version increment;
- exact residual hold release;
- hold-closure assertion;
- transactional `OrderCancelled` domain event;
- transactionally completed API command receipt;
- post-commit book rebuild/cache/event-bus effects.

**Rows mutated atomically**

- `orders`;
- `wallet_balances`;
- `wallet_ledger`;
- `order_events`;
- `api_command_receipts`.

**Current evidence defect**

The transaction lacks typed `exchange.order.cancel` mandatory evidence. `OrderCancelled` is a domain event and the route audit is best-effort.

**Required disposition**

Append `exchange.order.cancel` in this transaction. Cancellation evidence must include the exact released residual amount and hold asset from committed authority. This makes a separate `exchange.order.hold.release` action unnecessary for user cancellation unless implementation demonstrates ambiguity.

## 3.8 Engine cancellation method

**Path:** `src/lib/trading/engine.ts` — `InProcessMatchingEngine.cancelOrder()`

This method duplicates substantial cancellation behavior but lacks:

- durable API idempotency receipt;
- mandatory financial evidence;
- canonical route usage.

Repository search found no production call to `getMatchingEngine().cancelOrder`; the permanent Exchange guard explicitly rejects route use of it.

**Classification:** dormant/compatibility engine interface path, not an approved production cancellation authority.

**Required disposition**

- do not migrate routes to this method;
- add permanent source guard evidence that production routes/services cannot call it;
- either delegate it to the canonical cancellation authority in a later bounded cleanup or retain it as non-route engine compatibility with explicit documentation.

## 3.9 Legacy non-transactional order helpers

**Path:** `src/lib/trading/order-service.ts`

Legacy helpers:

- `createOrder()`;
- `cancelOrder()`;
- `updateOrderFill()`;
- `setOrderStatus()`.

`createOrder()` and `cancelOrder()` mutate state and then use fire-and-forget `void withDb(...)` for `order_events`. Repository search found no current production call to `createOrder()` and no route call to `cancelOrder()`.

Transaction-aware helpers used by canonical authorities:

- `createOrderTx()`;
- `getOrderByIdTx()`;
- `updateOrderFillTx()`;
- `setOrderStatusTx()`.

**Classification:** legacy public mutation surface remains dangerous even when currently unreachable.

**Required disposition**

- permanent guard must prohibit new production use of non-transactional helpers;
- no new evidence integration may be added to these helpers;
- removal/deprecation can occur only after exact import/reference evidence and is not required to complete #186 if guards prove them unreachable.

## 3.10 Legacy wallet compatibility helpers

**Path:** `src/lib/trading/wallet-service.ts`

Legacy number-based wrappers:

- `postHold()`;
- `postRelease()`.

Canonical order authority uses:

- `holdOrderFundsTx()`;
- `releaseOrderHoldResidualTx()`;
- `assertOrderHoldClosedTx()`;
- trade settlement transaction helpers.

**Required disposition**

Permanent guards must prevent order admission/cancellation from returning to `postHold()`/`postRelease()` or other split number-based balance mutations.

## 3.11 Order-book recovery

**Path:** `src/lib/trading/order-book-recovery.ts`

- clears local/Redis cache state;
- rebuilds from PostgreSQL;
- joins `orders` to `exchange_order_commands`;
- includes only final accepted commands and open limit orders;
- never treats Redis as financial authority.

**Required disposition**

No mandatory audit write belongs in recovery. Recovery must remain a projection repair process and must never create a second financial mutation or second mandatory order event.

## 3.12 Admin/system cancellation inventory

Repository search found no production Admin/system route that cancels Exchange orders and no caller using the interface convention `userId = "system"`. The only approved user cancellation route is `DELETE /api/orders/[id]`.

**Required disposition**

- document this absence as the current inventory result;
- any future Admin/system cancellation must use a separate verified actor source, the same market/hold authority and mandatory evidence, rather than calling legacy engine or order-service helpers.

# 4. Current evidence systems and their roles

| Evidence | Current role | Mandatory financial authority? |
|---|---|---|
| `order_events` | Transactional domain lifecycle/recovery evidence | No; not governed by mandatory sensitive mutation policy |
| `wallet_ledger` | Immutable financial hold/release/trade authority | Yes for amounts, but not a complete actor/action audit event |
| `exchange_order_commands` | Durable command, idempotency and recovery authority | Yes for command state, not a complete mandatory audit event |
| `exchange_order_command_attempts` | Append-only worker/recovery evidence | Operational only |
| `api_command_receipts` | Cancellation replay/result authority | Yes for idempotency, not a complete financial audit event |
| route `writeAudit()` | Best-effort generic audit after commit | No; must be removed as authority |
| `sensitive_mutation_audit_events` | Mandatory append-only audited mutation evidence | Required target; Exchange actions/resources are not yet typed |

# 5. Mandatory typed evidence design

## 5.1 Actions

Add at minimum:

- `exchange.order.admit`;
- `exchange.order.reject`;
- `exchange.order.cancel`.

Add `exchange.order.finalize` for the accepted/final command outcome unless implementation demonstrates that one admission event can truthfully and atomically represent both pre-matching admission and final matching result. The default implementation decision is to use `finalize` because admission and matching can occur in different transactions and workers.

Separate hold actions are not initially required:

- admission evidence includes exact hold reservation;
- cancellation/rejection evidence includes exact hold release/closure;
- immutable `wallet_ledger` remains the amount authority.

## 5.2 Resources

Add:

- `exchange_order`;
- `exchange_balance_hold` only if a separate hold action becomes necessary.

## 5.3 Actor and correlation policy

- user admission/cancellation actor: verified canonical principal;
- worker finalization actor: `service`, bound to a fixed service identity;
- tenant: server-owned command tenant;
- resource ID: domain-separated one-way order fingerprint;
- correlation: stable command/idempotency-derived identifier so exact retries resolve to the same event;
- request hash: canonical command/request hash already used by order admission or API command authority.

## 5.4 Bounded metadata

Allowed order-level metadata should be derived from committed server authority and remain bounded:

- policy version;
- market symbol or one-way market fingerprint according to policy;
- side, type, time-in-force;
- normalized quantity and price strings;
- hold asset and exact normalized hold amount;
- state transition and terminal reason;
- exact released residual string when applicable;
- accepted boolean;
- bounded trade count and optional one-way trade-set fingerprint;
- replay/idempotency outcome.

Never store:

- cookies, access/API credentials or unrestricted request bodies;
- raw IP/user-agent values;
- wallet addresses or KYC data;
- arbitrary exception text;
- unbounded arrays of trade IDs;
- JavaScript-number-derived financial evidence when committed exact strings are available.

# 6. Implementation sequence

1. Extend typed actions/resources and financial redaction tests.
2. Add `exchange-order-evidence.ts` with domain-separated fingerprints and bounded event builders.
3. Inject user audit context into `admitExchangeOrderCommand()` and write `exchange.order.admit` in the existing admission transaction.
4. Remove route-side placement `writeAudit()`.
5. Couple final accepted/rejected command evidence to authoritative engine/finalization transactions without creating a second matching authority.
6. Inject cancellation audit context into `cancelOrderIdempotently()` and write `exchange.order.cancel` with exact released residual in the existing transaction.
7. Remove route-side cancellation `writeAudit()`.
8. Add rollback, replay, concurrency, cross-principal and evidence-redaction tests.
9. Extend permanent Exchange and Sensitive Mutation guards to reject split route-side evidence and legacy helper reintroduction.
10. Record exact API Security Manifest reviewed deltas.
11. Produce final unchanged-head evidence across all required workflows.

# 7. Required adversarial evidence

The implementation is not complete until tests prove:

- forced mandatory-evidence rejection rolls back order, hold, ledger, command and domain event admission;
- no accepted placement response is possible without `exchange.order.admit` evidence;
- exact duplicate admission creates one order, one hold and one mandatory event;
- changed idempotent replay conflicts without a second mutation or event;
- final accepted/rejected command evidence is unique and coupled to final state;
- cancellation evidence failure rolls back cancellation, hold release, release ledger, domain event and API receipt;
- cancellation racing matching/fill cannot double release or record a false cancellation;
- repeated cancellation replays the proven result without duplicate evidence;
- cross-principal cancellation does not reveal or mutate another principal's order;
- worker retry/recovery does not duplicate financial evidence;
- queue/cache outage leaves durable recoverable state and does not fabricate rollback;
- forbidden secret/PII keys are rejected at application and database evidence boundaries;
- permanent guards reject route `writeAudit()` for order placement/cancellation and reject legacy split authorities.

# 8. Release gates

Final release evidence must be generated on one unchanged commit SHA:

```bash
npm run db:migrate
npm run db:migrate
npm run exchange:check
npm run test:exchange-order-authority
npm run sensitive:audit:check
npm run api:security:check
npm run typecheck
npm run lint
npm test
npm run build
```

Required GitHub workflows:

- CI;
- Full Suite Diagnostics;
- Exchange Authority;
- Sensitive Mutation Audit;
- API Security Manifest.

# 9. Initial release decision

**NO-GO for #186 completion.**

The financial mutation foundation is materially strong, but order admission, final outcome and cancellation can still commit without mandatory typed audit evidence. This inventory authorizes a narrow migration into the existing transactions; it does not authorize a new order path, matching redesign, custody expansion or weakened gate.
