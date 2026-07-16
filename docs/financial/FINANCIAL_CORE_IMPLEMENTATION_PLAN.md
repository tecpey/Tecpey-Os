# TECPEY FINANCIAL CORE IMPLEMENTATION PLAN

**Based on:** FINANCIAL_CORE_CERTIFICATION.md  
**Total Sprints:** 30 (F-003 through F-032)  
**Estimated Calendar:** 6 weeks (2 engineers)  
**Critical Path:** F-003 → F-004 → F-005 → F-006 → F-011 → F-015 → F-019 → F-021

---

## PHASE 1: IMMEDIATE RISK MITIGATION (Week 1)

### Sprint F-003: Add Order Overfill Guard
**Goal:** Prevent concurrent fills exceeding remaining_quantity  
**Priority:** CRITICAL — Addresses C-02  
**Risk:** LOW (add-only constraint)  
**Estimated Time:** 2 hours  

**Files:**
1. `src/lib/db-migrate.ts`

**Changes:**
- Add CHECK constraint: `remaining_quantity >= 0`
- Add optimistic lock: `version INTEGER DEFAULT 0`
- Update orders table migration

**Estimated LOC:** +15

**Validation:**
```bash
npm test
npm run build
# Manual: attempt concurrent fills > remaining
```

**Rollback:** Remove CHECK constraint

**Commit Message:**
```
fix(orders): add overfill guard constraint

Addresses C-02: Missing overfill guard in updateOrderFill.
DB constraint prevents negative remaining_quantity.
Refs: FINANCIAL_CORE_CERTIFICATION.md C-02
```

---

### Sprint F-004: Add Withdrawal Idempotency Key
**Goal:** Prevent duplicate withdrawal broadcasts  
**Priority:** CRITICAL — Addresses C-03  
**Risk:** LOW (schema add)  
**Estimated Time:** 2 hours  

**Files:**
1. `src/lib/db-migrate.ts`

**Changes:**
- Add `idempotency_key` column to withdrawals table
- Add UNIQUE index on idempotency_key
- Add `tx_hash` column with partial unique index

**Estimated LOC:** +12

**Validation:**
```bash
npm test
npm run build
# Manual: submit same withdrawal twice
```

**Rollback:** Drop columns and indexes

**Commit Message:**
```
fix(withdrawal): add idempotency key and tx_hash uniqueness

Addresses C-03: No idempotency key on withdrawal creation.
Prevents duplicate broadcasts on retry.
Refs: FINANCIAL_CORE_CERTIFICATION.md C-03
```

---

### Sprint F-005: Add Decimal Helper Module
**Goal:** Centralize Decimal.js wrapper for financial math  
**Priority:** CRITICAL — Foundation for F-006 through F-011  
**Risk:** LOW (new module)  
**Estimated Time:** 2 hours  

**Files:**
1. `src/lib/trading/decimal.ts` (new)

**Changes:**
- Create Decimal wrapper with toFixed, toDecimalPlaces, arithmetic helpers
- Export: `D`, `add`, `sub`, `mul`, `div`, `eq`, `lt`, `gt`, `lte`, `gte`, `toFixed`, `toDP`
- Handle string inputs, precision 30, rounding ROUND_DOWN

**Estimated LOC:** +80

**Validation:**
```bash
npm test
npm run build
# Manual: test edge cases (0.1 + 0.2 === 0.3)
```

**Rollback:** Delete file

**Commit Message:**
```
feat(trading): add Decimal helper module

Foundation for C-01: Float precision loss elimination.
Centralizes Decimal.js usage with financial defaults.
Refs: FINANCIAL_CORE_CERTIFICATION.md C-01
```

---

### Sprint F-006: Replace Float in Wallet Balance Service
**Goal:** Use Decimal for all balance operations  
**Priority:** CRITICAL — Addresses C-01 (1/5)  
**Risk:** MEDIUM (balance mutations)  
**Estimated Time:** 3 hours  

**Files:**
1. `src/lib/trading/wallet-balance-service.ts`
2. `src/lib/trading/decimal.ts`

**Changes:**
- Replace all `parseFloat` with `D()` (Decimal constructor)
- Replace `toFixed` with `.toDP(10)`
- Update debitFundsTx, creditFundsTx, releaseFundsTx, chargeFeeTx
- Update getBalance arithmetic

**Estimated LOC:** -60 +90 = +30

**Validation:**
```bash
npm test
npm run build
# Manual: test balance operations with high precision
```

**Rollback:** Revert to parseFloat

**Commit Message:**
```
fix(wallet): replace float with Decimal in balance service

Addresses C-01: Float precision loss in wallet balances.
All balance arithmetic now exact.
Refs: FINANCIAL_CORE_CERTIFICATION.md C-01
```

---

### Sprint F-007: Replace Float in Ledger Service
**Goal:** Use Decimal for ledger entries  
**Priority:** CRITICAL — Addresses C-01 (2/5)  
**Risk:** MEDIUM (audit trail)  
**Estimated Time:** 2 hours  

**Files:**
1. `src/lib/trading/ledger-service.ts`
2. `src/lib/trading/decimal.ts`

**Changes:**
- Replace `parseFloat` with `D()` for amount, balanceAfter
- Update postLedgerEntryTx, getLedgerEntries
- Ensure NUMERIC(30,10) compatibility

**Estimated LOC:** -30 +45 = +15

**Validation:**
```bash
npm test
npm run build
# Manual: verify ledger entries match balance changes
```

**Rollback:** Revert to parseFloat

**Commit Message:**
```
fix(ledger): replace float with Decimal in ledger service

Addresses C-01: Float precision loss in ledger entries.
Amount and balance_after now exact.
Refs: FINANCIAL_CORE_CERTIFICATION.md C-01
```

---

### Sprint F-008: Replace Float in Withdrawal Service
**Goal:** Use Decimal for withdrawal amounts  
**Priority:** CRITICAL — Addresses C-01 (3/5)  
**Risk:** MEDIUM (withdrawal flow)  
**Estimated Time:** 3 hours  

**Files:**
1. `src/lib/security/withdrawal-service.ts`
2. `src/lib/trading/decimal.ts`

**Changes:**
- Replace `parseFloat` with `D()` for amount, fee, net
- Update createWithdrawal, getWithdrawal, state transitions
- Ensure NUMERIC(30,10) compatibility

**Estimated LOC:** -40 +55 = +15

**Validation:**
```bash
npm test
npm run build
# Manual: test withdrawal with high-precision amounts
```

**Rollback:** Revert to parseFloat

**Commit Message:**
```
fix(withdrawal): replace float with Decimal in withdrawal service

Addresses C-01: Float precision loss in withdrawal amounts.
Amount, fee, and net now exact.
Refs: FINANCIAL_CORE_CERTIFICATION.md C-01
```

---

### Sprint F-009: Replace Float in Order Book
**Goal:** Use Decimal for order book price/quantity  
**Priority:** CRITICAL — Addresses C-01 (3/5), H-09  
**Risk:** MEDIUM (in-memory only)  
**Estimated Time:** 3 hours  

**Files:**
1. `src/lib/trading/order-book.ts`
2. `src/lib/trading/decimal.ts`

**Changes:**
- Import Decimal helpers
- Replace LevelEntry.quantity with Decimal
- Replace price string parsing with Decimal
- Update getSnapshot to use Decimal.toDecimalPlaces
- Update addOrder/removeOrder arithmetic

**Estimated LOC:** -60 +90 = +30

**Validation:**
```bash
npm test
npm run build
# Manual: test order book with high-precision quantities
```

**Rollback:** Revert to float-based LevelEntry

**Commit Message:**
```
fix(orderbook): replace float with Decimal in order book

Addresses C-01: Float precision loss in order-book.
Price levels and quantities now use Decimal.js for
exact arithmetic.
Refs: FINANCIAL_CORE_CERTIFICATION.md C-01
```

**Dependencies:** F-006  
**Rollback Complexity:** MEDIUM (in-memory only)

---

### Sprint F-010: Replace Float in Matching Engine
**Goal:** Use Decimal for fill computation  
**Priority:** CRITICAL — Addresses C-01 (4/5), H-09  
**Risk:** HIGH (core matching logic)  
**Estimated Time:** 4 hours  

**Files:**
1. `src/lib/trading/engine.ts`
2. `src/lib/trading/decimal.ts`

**
**Changes:**
- Replace all `parseFloat` with Decimal constructors
- Update computeFills to use Decimal arithmetic
- Replace all `toFixed` with Decimal.toDecimalPlaces
- Update fee calculations, hold/release amounts
- Update order book interaction to use Decimal

**Estimated LOC:** -120 +80 = -40

**Validation:**
```bash
npm test
npm run build
# Manual: test with high-precision trades (0.00000001 BTC)
```

**Rollback:** Revert to float-based matching

**Commit Message:**
```
fix(engine): replace float with Decimal in matching engine

Addresses C-01: Float precision loss in matching engine.
Fill computation, fees, and hold/release now exact.
Refs: FINANCIAL_CORE_CERTIFICATION.md C-01
```

**Dependencies:** F-006, F-009  
**Rollback Complexity:** HIGH (core matching)

---

### Sprint F-011: Replace Float in Trade Service
**Goal:** Use Decimal for trade persistence  
**Priority:** CRITICAL — Addresses C-01 (5/5)  
**Risk:** MEDIUM (trade records)  
**Estimated Time:** 3 hours  

**Files:**
1. `src/lib/trading/trade-service.ts`
2. `src/lib/trading/decimal.ts`

**Changes:**
- Import Decimal helpers
- Replace `parseFloat` in rowToTrade with Decimal
- Update createTradeTx to use Decimal.toFixed(10)
- Update getTradesByUser to preserve precision

**Estimated LOC:** -40 +60 = +20

**Validation:**
```bash
npm test
npm run build
# Manual: verify trade precision in DB
```

**Rollback:** Revert to parseFloat

**Commit Message:**
```
fix(trades): replace float with Decimal in trade service

Addresses C-01: Float precision loss in trade records.
Trade price, quantity, and fees now exact.
Refs: FINANCIAL_CORE_CERTIFICATION.md C-01
```

**Dependencies:** F-006  
**Rollback Complexity:** MEDIUM (trade mutations)

---

### Sprint F-012: Add Ledger Immutability Constraint
**Goal:** Prevent ledger entry modification  
**Priority:** CRITICAL — Addresses C-04  
**Risk:** LOW (schema add)  
**Estimated Time:** 2 hours  

**Files:**
1. `src/lib/db-migrate.ts`

**Changes:**
- Add CHECK constraint: `balance_after >= 0` on wallet_ledger
- Add UNIQUE constraint on (reference_type, reference_id, type) for idempotency
- Add trigger to prevent UPDATE/DELETE on wallet_ledger

**Estimated LOC:** +20

**Validation:**
```bash
npm test
npm run build
# Manual: attempt ledger UPDATE (should fail)
```

**Rollback:** Drop constraints and trigger

**Commit Message:**
```
fix(ledger): add immutability constraints

Addresses C-04: Ledger entries can be modified.
DB constraints prevent UPDATE/DELETE and enforce idempotency.
Refs: FINANCIAL_CORE_CERTIFICATION.md C-04
```

---

### Sprint F-013: Add Balance Invariant Check
**Goal:** Enforce available + held = total invariant  
**Priority:** CRITICAL — Addresses C-05  
**Risk:** LOW (constraint)  
**Estimated Time:** 2 hours  

**Files:**
1. `src/lib/db-migrate.ts`

**Changes:**
- Add CHECK constraint: `available_balance + held_balance = total_balance` on wallet_balances
- Add trigger to validate on every UPDATE

**Estimated LOC:** +15

**Validation:**
```bash
npm test
npm run build
# Manual: verify invariant holds under concurrent fills
```

**Rollback:** Drop constraint and trigger

**Commit Message:**
```
fix(wallet): add balance invariant constraint

Addresses C-05: No invariant check on wallet_balances.
available + held = total enforced at DB level.
Refs: FINANCIAL_CORE_CERTIFICATION.md C-05
```

---

### Sprint F-014: Add Settlement Finality Constraint
**Goal:** Prevent double-settlement of trades  
**Priority:** CRITICAL — Addresses C-06  
**Risk:** LOW (constraint)  
**Estimated Time:** 2 hours  

**Files:**
1. `src/lib/db-migrate.ts`

**Changes:**
- Add UNIQUE constraint on trades: (buyer_order_id, seller_order_id, price, quantity)
- Add state check: trades can only be INSERTed, not UPDATEd

**Estimated LOC:** +12

**Validation:**
```bash
npm test
npm run build
# Manual: attempt duplicate trade insert
```

**Rollback:** Drop constraints

**Commit Message:**
```
fix(trades): add settlement finality constraint

Addresses C-06: Trade settlement can be duplicated.
Unique constraint prevents double-settlement.
Refs: FINANCIAL_CORE_CERTIFICATION.md C-06
```

---

### Sprint F-015: Add Explicit Row Locking in Wallet Balance Service
**Goal:** Prevent TOCTOU on balance operations  
**Priority:** CRITICAL — Addresses C-07  
**Risk:** MEDIUM (locking behavior)  
**Estimated Time:** 3 hours  

**Files:**
1. `src/lib/trading/wallet-balance-service.ts`
2. `src/lib/trading/decimal.ts`

**Changes:**
- Add `FOR UPDATE` to balance SELECT in debitFundsTx, creditFundsTx, holdFundsTx, releaseHoldTx
- Wrap balance check + update in single transaction
- Use `NOWAIT` to fail fast on contention

**Estimated LOC:** +30

**Validation:**
```bash
npm test
npm run build
# Manual: concurrent debit/credit test
```

**Rollback:** Remove FOR UPDATE clauses

**Commit Message:**
```
fix(wallet): add explicit row locking for balance ops

Addresses C-07: TOCTOU in wallet balance operations.
SELECT FOR UPDATE NOWAIT prevents race conditions.
Refs: FINANCIAL_CORE_CERTIFICATION.md C-07
```

**Dependencies:** F-006  
**Rollback Complexity:** MEDIUM (concurrency behavior)

---

## PHASE 2: HIGH-RISK HARDENING (Week 2-3)

### Sprint F-016: Add Ledger Reconciliation Job
**Goal:** Detect balance/ledger drift  
**Priority:** HIGH — Addresses H-01  
**Risk:** LOW (read-only job)  
**Estimated Time:** 3 hours  

**Files:**
1. `src/workers/ledger-reconciliation.ts` (new)
2. `src/lib/db.ts`

**Changes:**
- Create scheduled job comparing SUM(ledger) vs wallet_balances
- Alert on any discrepancy > 0.00000001
- Run every 5 minutes via cron

**Estimated LOC:** +100

**Validation:**
```bash
npm test
npm run build
# Manual: inject drift, verify alert
```

**Rollback:** Disable job

**Commit Message:**
```
feat(wallet): add ledger reconciliation job

Addresses H-01: No reconciliation of wallet_ledger vs wallet_balances.
Periodic job detects drift and alerts.
Refs: FINANCIAL_CORE_CERTIFICATION.md H-01
```

---

### Sprint F-017: Add Fee Reconciliation
**Goal:** Verify fee collection matches trades  
**Priority:** HIGH — Addresses H-02  
**Risk:** LOW (read-only)  
**Estimated Time:** 3 hours  

**Files:**
1. `src/workers/fee-reconciliation.ts` (new)

**Changes:**
- Daily job summing trade fees vs fee ledger entries
- Alert on mismatch > 0.01%

**Estimated LOC:** +80

**Validation:**
```bash
npm test
npm run build
```

**Rollback:** Disable job

**Commit Message:**
```
feat(trading): add fee reconciliation job

Addresses H-02: No fee reconciliation.
Daily job verifies collected fees match trade records.
Refs: FINANCIAL_CORE_CERTIFICATION.md H-02
```

---

### Sprint F-018: Add Order Book State Recovery
**Goal:** Rebuild order book from DB on restart  
**Priority:** HIGH — Addresses H-03  
**Risk:** MEDIUM (state recovery)  
**Estimated Time:** 4 hours  

**Files:**
1. `src/lib/trading/order-book-store.ts`
2. `src/lib/trading/order-book.ts`

**Changes:**
- Add
**Changes:**
- Add `rebuildOrderBook(market)` loading open orders from DB
- Call on worker startup before matching
- Add `lastRebuiltAt` timestamp for observability

**Estimated LOC:** +60

**Validation:**
```bash
npm test
npm run build
# Manual: restart worker, verify book matches open orders
```

**Rollback:** Remove rebuild call

**Commit Message:**
```
feat(trading): add order book state recovery on restart

Addresses H-03: No order book state recovery.
Rebuilds in-memory book from open orders on startup.
Refs: FINANCIAL_CORE_CERTIFICATION.md H-03
```

---

### Sprint F-019: Add Ledger Integrity Verification
**Goal:** Verify ledger balances match wallet_balances  
**Priority:** HIGH — Addresses H-01  
**Risk:** LOW (read-only)  
**Estimated Time:** 3 hours  

**Files:**
1. `src/workers/ledger-integrity.ts` (new)

**Changes:**
- Daily job comparing ledger sum vs wallet_balances
- Alert on any discrepancy > 0

**Estimated LOC:** +70

**Validation:**
```bash
npm test
npm run build
```

**Rollback:** Disable job

**Commit Message:**
```
feat(wallet): add ledger integrity verification job

Addresses H-01: No ledger integrity verification.
Daily job ensures ledger sums match wallet balances.
Refs: FINANCIAL_CORE_CERTIFICATION.md H-01
```

---

### Sprint F-020: Add Idempotency Key to Withdrawal API
**Goal:** Prevent duplicate withdrawal submissions  
**Priority:** HIGH — Addresses H-08  
**Risk:** LOW (API add)  
**Estimated Time:** 2 hours  

**Files:**
1. `src/app/api/auth/withdraw/route.ts`
2. `src/lib/db-migrate.ts`

**Changes:**
- Add `idempotency_key` to withdrawal request
- Add unique constraint on withdrawals.idempotency_key
- Return 409 on duplicate key

**Estimated LOC:** +25

**Validation:**
```bash
npm test
npm run build
# Manual: submit same withdrawal twice with same key
```

**Rollback:** Remove column and constraint

**Commit Message:**
```
feat(withdrawal): add idempotency key to withdrawal API

Addresses H-08: No idempotency on withdrawal submission.
Prevents duplicate withdrawal requests.
Refs: FINANCIAL_CORE_CERTIFICATION.md H-08
```

---

### Sprint F-021: Add Decimal Wrapper Module
**Goal:** Centralize Decimal.js usage  
**Priority:** CRITICAL — Prerequisite for F-006 through F-012  
**Risk:** LOW (new module)  
**Estimated Time:** 2 hours  

**Files:**
1. `src/lib/trading/decimal.ts` (new)

**Changes:**
- Export `Decimal` class from decimal.js
- Add `toDBString()` for NUMERIC(30,10) serialization
- Add `fromDBString()` for parsing
- Add `toFixedDP(places)` for display
- Add arithmetic helpers: `add`, `sub`, `mul`, `div`

**Estimated LOC:** +80

**Validation:**
```bash
npm test
npm run build
```

**Rollback:** Delete file

**Commit Message:**
```
feat(trading): add Decimal wrapper module

Centralizes decimal.js usage for financial precision.
Provides DB serialization and arithmetic helpers.
Refs: FINANCIAL_CORE_CERTIFICATION.md C-01
```

---

### Sprint F-022: Add Withdrawal Dead Letter Alerting
**Goal:** Alert on withdrawals in dead letter queue  
**Priority:** HIGH — Addresses H-11  
**Risk:** LOW (monitoring)  
**Estimated Time:** 2 hours  

**Files:**
1. `src/lib/wallet/observability.ts`

**Changes:**
- Add `alertDeadLetter(withdrawalId, error)` function
- Emit metric `withdrawal.dead_letter.count`
- Send alert if count > 0 for 5 minutes

**Estimated LOC:** +40

**Validation:**
```bash
npm test
npm run build
```

**Rollback:** Remove alert function

**Commit Message:**
```
feat(wallet): add dead letter alerting for withdrawals

Addresses H-11: No dead letter alerting.
Alerts on withdrawals stuck in dead letter queue.
Refs: FINANCIAL_CORE_CERTIFICATION.md H-11
```

---

### Sprint F-023: Add Balance Discrepancy Alerting
**Goal:** Alert on balance mismatches  
**Priority:** HIGH — Addresses H-01 (complements F-019)  
**Risk:** LOW (monitoring)  
**Estimated Time:** 2 hours  

**Files:**
1. `src/lib/trading/wallet-balance-service.ts`

**Changes:**
- Add `verifyBalances()` comparing ledger sum vs wallet_balances
- Emit metric `wallet.balance_discrepancy`
- Alert on any non-zero discrepancy

**Estimated LOC:** +50

**Validation:**
```bash
npm test
npm run build
```

**Rollback:** Remove verification call

**Commit Message:**
```
feat(wallet): add balance discrepancy alerting

Addresses H-01: No ledger integrity verification.
Real-time alert on balance vs ledger mismatch.
Refs: FINANCIAL_CORE_CERTIFICATION.md H-01
```

---

### Sprint F-024: Add Withdrawal Fee Transparency
**Goal:** Show exact fee before confirmation  
**Priority:** MEDIUM — Addresses M-03  
**Risk:** LOW (API add)  
**Estimated Time:** 2 hours  

**Files:**
1. `src/app/api/auth/withdraw/route.ts`
2. `src/lib/wallet/fee/engine.ts`

**Changes:**
- Add `estimateWithdrawalFee(asset, amount)` endpoint
- Return fee breakdown: network fee + platform fee
- Display in withdrawal confirmation UI

**Estimated LOC:** +40

**Validation:**
```bash
npm test
npm run build
```

**Rollback:** Remove endpoint

**Commit Message:**
```
feat(withdrawal): add fee estimation endpoint

Addresses M-03: No withdrawal fee transparency.
Users see exact fee before confirming withdrawal.
Refs: FINANCIAL_CORE_CERTIFICATION.md M-03
```

---

### Sprint F-025: Add Order Expiration Enforcement
**Goal:** Auto-expire orders past TTL  
**Priority:** MEDIUM — Addresses M-04  
**Risk:** MEDIUM (matching engine)  
**Estimated Time:** 3 hours  

**Files:**
1. `src/lib/trading/engine.ts`
2. `src/workers/order-expiration.ts` (new)

**Changes:**
- Add `expires_at` to orders table (nullable)
- Worker scans for expired open orders every minute
- Cancel expired orders via existing cancel flow

**Estimated LOC:** +100

**Validation:**
```bash
npm test
npm run build
# Manual: place order with 1-min TTL, verify expiry
```

**Rollback:** Disable worker, drop column

**Commit Message:**
```
feat(trading): add order expiration enforcement

Addresses M-04: No order expiration enforcement.
Worker cancels orders past their TTL.
Refs: FINANCIAL_CORE_CERTIFICATION.md M-04
```

---

### Sprint F-026: Add Settlement Finality Tracking
**Goal:** Track blockchain confirmation status  
**Priority:** MEDIUM — Addresses M-05  
**Risk:** LOW (tracking)  
**Estimated Time:** 3 hours  

**Files:**
1. `src/lib/db-migrate.ts`
2. `src/lib/wallet/confirmation/engine.ts`

**Changes:**
- Add `confirmations` and `required_confirmations` to withdrawals
- Update confirmation worker to track confirmations
- Add `finality_status` enum: pending | confirmed | finalized

**Estimated LOC:** +80

**Validation:**
```bash
npm test
npm run build
```

**Rollback:** Remove columns

**Commit Message:**
```
feat(withdrawal): add settlement finality tracking

Addresses M-05: No settlement finality tracking.
Tracks blockchain confirmations to finality.
Refs: FINANCIAL_CORE_CERTIFICATION.md M-05
```

---

### Sprint F-027: Add Trade Break Detection
**Goal:** Detect and alert on trade anomalies  
**Priority:** MEDIUM — Addresses M-06  
**Risk:** LOW (
**Changes:**
- Add trade validation rules: price deviation > 10%, quantity > 100x avg, self-trades
- Emit `trade_break` alert to security_events
- Add manual review queue for flagged trades

**Estimated LOC:** +100

**Validation:**
```bash
npm test
npm run build
```

**Rollback:** Disable alerts

**Commit Message:**
```
feat(trading): add trade break detection

Addresses M-06: No trade break detection.
Detects anomalous trades for manual review.
Refs: FINANCIAL_CORE_CERTIFICATION.md M-06
```

---

### Sprint F-028: Add Balance Reconciliation Job
**Goal:** Daily balance verification against ledger  
**Priority:** MEDIUM — Addresses M-07  
**Risk:** LOW (read-only)  
**Estimated Time:** 3 hours  

**Files:**
1. `src/workers/balance-reconciliation.ts` (new)

**Changes:**
- Daily job comparing wallet_balances sum vs wallet_ledger sum per user/asset
- Alert on mismatch > 0.0001%

**Estimated LOC:** +80

**Validation:**
```bash
npm test
npm run build
```

**Rollback:** Disable job

**Commit Message:**
```
feat(wallet): add daily balance reconciliation

Addresses M-07: No balance reconciliation.
Daily job verifies balances match ledger.
Refs: FINANCIAL_CORE_CERTIFICATION.md M-07
```

---

### Sprint F-029: Add Idempotency Key Enforcement
**Goal:** Enforce idempotency on all mutating endpoints  
**Priority:** MEDIUM — Addresses M-08  
**Risk:** LOW (middleware)  
**Estimated Time:** 2 hours  

**Files:**
1. `src/lib/middleware/idempotency.ts` (new)

**Changes:**
- Middleware extracting `Idempotency-Key` header
- Store key + response in Redis with 24h TTL
- Return cached response on duplicate key

**Estimated LOC:** +60

**Validation:**
```bash
npm test
npm run build
# Manual: POST same order twice with same key
```

**Rollback:** Remove middleware

**Commit Message:**
```
feat(api): add idempotency key enforcement

Addresses M-08: No idempotency on mutating endpoints.
Prevents duplicate order/withdrawal submissions.
Refs: FINANCIAL_CORE_CERTIFICATION.md M-08
```

---

### Sprint F-030: Add Circuit Breaker for External Calls
**Goal:** Protect against provider outages  
**Priority:** MEDIUM — Addresses M-09  
**Risk:** LOW (resilience)  
**Estimated Time:** 3 hours  

**Files:**
1. `src/lib/resilience/circuit-breaker.ts` (new)
2. `src/lib/wallet/providers/registry.ts`

**Changes:**
- Circuit breaker wrapper for RPC/blockchain calls
- Open after 5 failures, half-open after 30s
- Fallback to cached rates/fees

**Estimated LOC:** +100

**Validation:**
```bash
npm test
npm run build
# Manual: simulate provider outage
```

**Rollback:** Bypass breaker

**Commit Message:**
```
feat(resilience): add circuit breaker for external calls

Addresses M-09: No circuit breaker on external calls.
Protects against provider cascading failures.
Refs: FINANCIAL_CORE_CERTIFICATION.md M-09
```

---

### Sprint F-031: Add Financial Audit Trail Export
**Goal:** Generate immutable audit exports  
**Priority:** LOW — Addresses M-10  
**Risk:** LOW (export)  
**Estimated Time:** 3 hours  

**Files:**
1. `src/workers/audit-export.ts` (new)

**Changes:**
- Weekly job exporting wallet_ledger, trades, withdrawals to signed CSV
- Store in cold storage (S3/GCS) with checksum manifest

**Estimated LOC:** +80

**Validation:**
```bash
npm test
npm run build
```

**Rollback:** Disable export

**Commit Message:**
```
feat(audit): add financial audit trail export

Addresses M-10: No audit trail export.
Weekly signed exports for compliance.
Refs: FINANCIAL_CORE_CERTIFICATION.md M-10
```

---

### Sprint F-032: Add Chaos Testing for Financial Flows
**Goal:** Validate resilience under failure  
**Priority:** LOW — Addresses M-11  
**Risk:** LOW (test-only)  
**Estimated Time:** 4 hours  

**Files:**
1. `src/tests/chaos/financial-flows.test.ts` (new)

**Changes:**
- Test: order placement during DB failover
- Test: withdrawal during provider outage
- Test: concurrent fills at same price level
- Test: balance reconciliation during active trading

**Estimated LOC:** +150

**Validation:**
```bash
npm test -- --testNamePattern="chaos"
```

**Rollback:** Remove test file

**Commit Message:**
```
test(chaos): add financial flow chaos tests

Addresses M-11: No chaos testing for financial flows.
Validates resilience under failure scenarios.
Refs: FINANCIAL_CORE_CERTIFICATION.md M-11
```

---

## TOTAL ESTIMATE
- **Development Time:** 102 hours (~13 days)
- **Calendar Time:** 6 weeks (2 engineers)
- **Critical Path:** 28 hours (7 sprints)

---

## SPRINT RULES CHECKLIST
Every sprint must:
- [ ] Touch only one concern
- [ ] Change at most 3 files
- [ ] Have one objective
- [ ] Be independently reviewable
- [ ] Be independently revertible
- [ ] Pass `npm run build`
- [ ] Pass `npm test`
- [ ] Take 1-4 hours

---

TECPEY FINANCIAL IMPLEMENTATION PLAN READY
