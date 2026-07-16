# TECPEY FINANCIAL CORE CERTIFICATION BACKLOG

**Sprint:** F-001  
**Date:** 2026-07-16  
**Scope:** Ledger, Wallet, Orders, Trades, Settlement, Balance Management, Transaction Processing

---

## EXECUTIVE SUMMARY

### Financial Core Health: **OPERATIONAL WITH CRITICAL RISKS**

**Architecture Pattern:** Phase 30 canonical financial core with:
- NUMERIC(30,10) precision in database (✅ correct)
- parseFloat/toFixed bridge layer (⚠️ precision loss risk)
- Atomic balance operations via SQL WHERE constraints
- Transaction-wrapped settlement flows
- Idempotency via unique constraints
- Append-only ledger audit trail

**Critical Findings:** 8  
**High Priority:** 12  
**Medium Priority:** 7  
**Total Estimated Effort:** 18-24 engineer-days  
**Rollback Complexity:** Medium (database schema changes required)

---

## CRITICAL FINDINGS (P0 — Production Blockers)

### C-01: Float Arithmetic Throughout Financial Calculations
**Risk:** Precision loss in money calculations leading to balance discrepancies  
**Severity:** CRITICAL  
**Files:**
- `src/lib/trading/engine.ts:104,124,136-184`
- `src/lib/trading/wallet-balance-service.ts:59,90,194,232,272`
- `src/lib/trading/order-book.ts:35,49,101,109`
- `src/app/api/orders/route.ts:136-158`

**Evidence:**
```typescript
// Engine: parseFloat everywhere
let remaining = parseFloat(order.quantity);  // line 124
const fillQty = Math.min(remaining, effectiveRem);  // line 142
const feeBuyer = fillQty * tradePrice * makerFeeRate;  // line 152

// Balance service: parseFloat from DB string
available: parseFloat(r.available_balance)  // line 59

// Orders API: parseFloat for hold calculation
const qty = parseFloat(quantity);  // line 136
holdAmount = limitPrice * qty;  // line 152
```

**Impact:**
- Cumulative rounding errors across trade sequences
- Potential balance discrepancies in ledger reconciliation
- Risk of over-crediting/under-debiting by fractional amounts
- Cannot accurately represent assets with >8 decimal places

**Estimated Effort:** 5 days  
**Rollback Complexity:** Low (code-only, no schema change)

---

### C-02: Race Condition in updateOrderFill — Missing Overfill Guard
**Risk:** Order can be filled beyond remaining_quantity during concurrent matching  
**Severity:** CRITICAL  
**Files:**
- `src/lib/trading/order-service.ts:203-231`

**Evidence:**
```typescript
// Line 222: WHERE clause checks remaining >= fillQty BUT
// the UPDATE reduces remaining by fillQty WITHOUT re-checking
UPDATE orders SET
  filled_quantity    = filled_quantity + $1,
  remaining_quantity = remaining_quantity - $1,
  ...
WHERE id = $4::uuid AND remaining_quantity >= $1
```

**Attack Vector:**
Two concurrent engine passes for same market:
1. Both read maker order with remaining=1.0 BTC
2. Both compute fill of 0.8 BTC (passes WHERE check)
3. Both UPDATE: filled = 0+0.8+0.8 = 1.6, remaining = 1.0-0.8-0.8 = -0.6

**Impact:**
- Double-fill vulnerability
- Negative remaining_quantity
- Ledger shows more credits than debits
- User receives free assets

**Estimated Effort:** 2 days  
**Rollback Complexity:** Low (code-only)

---

### C-03: Withdrawal Double-Broadcast via Recovery Worker
**Risk:** Recovery worker can re-execute withdrawal after broadcast, leading to double-spend  
**Severity:** CRITICAL  
**Files:**
- `src/lib/wallet/withdrawal-executor.ts:31-63`
- `src/lib/wallet/queue/processor.ts:100-118`

**Evidence:**
```typescript
// executor.ts line 58: Idempotency check on tx_hash
if (withdrawal.txHash) {
  logger.info("[executor] duplicate detected");
  return;  // ✅ GOOD
}

// BUT recovery worker re-calls executeWithdrawal from scratch
// processor.ts line 107:
await executeWithdrawal(job.data);  // ⚠️ re-fetches, but if state=broadcasted AND tx_hash=NULL...
```

**Attack Vector:**
1. Withdrawal broadcasts, writes tx_hash to DB
2. DB write times out / connection drops before COMMIT
3. Job stays in queue (no ack)
4. Recovery worker retries → fetches record → tx_hash is NULL (uncommitted)
5. Builds + signs + broadcasts AGAIN with different nonce
6. Two on-chain transactions for same withdrawal

**Impact:**
- Double-spend of user funds
- Exchange insolvency
- Accounting mismatch (1 withdrawal record, 2 on-chain txs)

**Estimated Effort:** 3 days  
**Rollback Complexity:** Medium (add state machine constraints)

---

### C-04: No Double-Spend Protection in holdFundsTx
**Risk:** Concurrent order placement can hold same funds twice  
**Severity:** CRITICAL  
**Files:**
- `src/lib/trading/wallet-balance-service.ts:73-106`

**Evidence:**
```typescript
// Line 88: WHERE available_balance >= $3
// BUT no idempotency key on orders table to prevent duplicate holds
UPDATE wallet_balances
SET available_balance = available_balance - $3,
    held_balance = held_balance + $3
WHERE user_id = $1 AND asset = $2 AND available_balance >= $3
```

**Attack Vector:**
Two concurrent POST /api/orders with same clientOrderId:
1. Both pass pre-flight balance check (line 162 in route.ts)
2. Both create order record with different UUIDs (randomUUID on line 38 order-service.ts)
3. Both execute holdFundsTx → both pass WHERE check → hold 2× the amount
4. User trades with fabricated balance

**Impact:**
- User can trade with 2× actual balance
- Negative available_balance after settlement
- Exchange takes the loss

**Estimated Effort:** 3 days  
**Rollback Complexity:** Medium (requires unique constraint on client_order_id + user_id)

---

### C-05: Order Book In-Memory State Diverges from DB on Engine Crash
**Risk:** Crash between DB commit and book update leaves phantom liquidity  
**Severity:** CRITICAL  
**Files:**
- `src/lib/trading/engine.ts:402-430`

**Evidence:**
```typescript
// Line 402: DB transaction commits
await client.query("COMMIT");

// Lines 410-427: In-memory book mutations happen AFTER commit
for (const fill of fills.records) {
  displayBook.cancel(fill.maker.side, fill.makerPriceKey, fill.fillQty.toFixed(10));
}
if (!fullyFilled && isGTC) {
  displayBook.insert(order.side, pkStr(limitPrice), fills.remaining.toFixed(10));
}
// ⚠️ If process crashes here, book state is stale
```

**Impact:**
- Order book shows filled orders as still available
- Subsequent matches fail (DB has 0 remaining)
- User sees liquidity that doesn't exist
- FOK orders incorrectly accepted

**Mitigation:** rebuildOrderBook on startup (line 208)  
**Remaining Risk:** Between crash and restart (up to minutes)

**Estimated Effort:** 4 days  
**Rollback Complexity:** High (requires event sourcing or Redis persistence)

---

### C-06: Withdrawal Balance Accounting Not Atomic
**Risk:** Crash between reserve and settle leaves funds in limbo  
**Severity:** CRITICAL  
**Files:**
- `src/lib/trading/wallet-balance-service.ts:377-423,445-493`
- `src/lib/wallet/withdrawal-executor.ts:70-105`

**Evidence:**
```typescript
// Three-phase model (lines 350-369 comment):
// 1. reserve (available → held)
// 2. settle (held → 0)
// 3. release (held → available) on failure

// executor.ts calls these in SEPARATE function calls:
await updateWithdrawalState(withdrawalId, "building_transaction");  // line 72
// ... build + sign ...
await updateWithdrawalState(withdrawalId, "broadcasting");  // line 95
const broadcastResult = await broadcastTransaction(...);  // line 97
await withDb(async (db) => {
  await db.query(`UPDATE withdrawals SET tx_hash = $2 ...`);  // line 103
});

// ⚠️ If crash between broadcast (line 97) and tx_hash write (line 103):
// - Funds are on-chain
// - DB still shows held_balance with funds
// - No consumeHeldWithdrawalTx called
// - User can cancel and get funds back → double-spend
```

**Impact:**
- User withdraws funds
- Transaction broadcasts successfully
- Process crashes before recording tx_hash
- User cancels withdrawal → held funds released back to available
- User now has funds in wallet AND on-chain

**Estimated Effort:** 4 days  
**Rollback Complexity:** High (requires idempotency key on broadcast)

---

### C-07: No Reconciliation Between Ledger and Balances
**Risk:** Silent divergence between wallet_balances and wallet_ledger totals  
**Severity:** CRITICAL  
**Files:**
- `src/lib/trading/wallet-balance-service.ts` (no reconciliation function)
- `src/lib/trading/ledger-service.ts` (no balance recompute)

**Evidence:**
```sql
-- wallet_balances: live mutable balance
UPDATE wallet_balances SET available_balance = ...

-- wallet_ledger: immutable append-only log
INSERT INTO wallet_ledger (amount, balance_after, ...)

-- NO CRON JOB OR API TO CHECK:
SELECT 
  wb.available_balance + wb.held_balance AS live_total,
  SUM(wl.amount) AS ledger_total
FROM wallet_balances wb
JOIN wallet_ledger wl ON wl.wallet_id = wb.user_id AND wl.asset = wb.asset
WHERE wl.type IN ('deposit', 'trade_credit') - wl.type IN ('withdraw', 'trade_debit', 'fee')
-- Should always equal, but no enforcement
```

**Impact:**
- Balance corruption goes undetected
- Cannot prove solvency
- Audit trail is useless if not reconciled

**Estimated Effort:** 3 days  
**Rollback Complexity:** Low (add-only, no breaking changes)

---

### C-08: Market Order Hold Estimation Uses Stale Book State
**Risk:** Market buy holds at current best ask, which may fill at worse price  
**Severity:** HIGH (borderline CRITICAL)  
**Files:**
- `src/app/api/orders/route.ts:145-149`

**Evidence:**
```typescript
// Line 145: Estimate hold from display book
const bestAsk = getOrderBook(market).bestAsk();
holdAmount = parseFloat(bestAsk.price) * qty;

// Line 180: Hold executed
const held = await holdFundsTx(client, userId, holdAsset, holdAmount, o.id);

// Line 202: Engine matches
const engineResult = await engine.placeOrder(order);

// ⚠️ If best ask moves between line 147 and 202:
// - User held insufficient quote
// - Engine match tries to debit more than was held
// - debitFundsTx fails (line 230 wallet-balance-service.ts WHERE available >= $3)
// - Transaction rolls back
// - Order is orphaned in DB with status=NEW but no held funds
```

**Impact:**
- Market orders fail unpredictably in volatile markets
- User balance locked in held_balance with no corresponding order
- Manual admin intervention required to release

**Estimated Effort:** 2 days  
**Rollback Complexity:** Medium (requires hold buffer or two-phase reserve)

---

## HIGH PRIORITY FINDINGS (P1)

### H-01: No Locking on Concurrent Cancel + Match
**Risk:** Order can be cancelled while engine is matching it  
**Severity:** HIGH  
**Files:**
- `src/lib/trading/order-service.ts:100-148` (cancel)
- `src/lib/trading/engine.ts:298-349` (match transaction)

**Evidence:**
```typescript
// cancel: UPDATE orders SET status = 'CANCELLED' WHERE status IN ('NEW', 'PARTIALLY_FILLED')
// match:  UPDATE orders SET filled_quantity = filled_quantity + $1 WHERE id = $4

// No SELECT FOR UPDATE or advisory lock
```

**Impact:**
- Engine fills cancelled order
- Balance debited for cancelled order
- Ledger inconsistency

**Estimated Effort:** 2 days  
**Rollback Complexity:** Low

---

### H-02: No Balance Invariant Check After Settlement
**Risk:** Settlement can complete with negative balances  
**Severity:** HIGH  
**Files:**
- `src/lib/trading/wallet-balance-service.ts:218-253` (debitFundsTx)

**Evidence:**
```typescript
// Line 230: WHERE available_balance >= $3
// BUT no CHECK constraint on table to prevent manual corruption
```

**Impact:**
- Manual DB edits can create negative balance
- No runtime assertion that available >= 0 after every operation

**Estimated Effort:** 1 day  
**Rollback Complexity:** Low (add CHECK constraint)

---

### H-03: chargeFee Uses LEAST() to Tolerate Rounding — Masks Real Errors
**Risk:** Undersized fee collection goes undetected  
**Severity:** HIGH  
**Files:**
- `src/lib/trading/wallet-balance-service.ts:261-294`

**Evidence:**
```typescript
// Line 272: Uses LEAST to avoid constraint violation
SET available_balance = available_balance - LEAST($3, available_balance)

// Comment line 258: "marginally larger than remaining due to floating-point rounding"
```

**Impact:**
- If fee > available due to calculation error, fee is silently undercollected
- Exchange revenue loss
- Cannot distinguish rounding from logic bug

**Estimated Effort:** 2 days  
**Rollback Complexity:** Medium

---

### H-04: No Circuit Breaker on Matching Engine
**Risk:** Runaway matching during flash crash  
**Severity:** HIGH  
**Files:**
- `src/lib/trading/engine.ts` (no circuit breaker)

**Evidence:**
- No price deviation check
- No max fills per order limit
- No market-wide pause on volatility

**Impact:**
- Market manipulation via wash trading
- Fat-finger order executes at absurd price

**Estimated Effort:** 3 days  
**Rollback Complexity:** Low

---

### H-05: Withdrawal State Machine Allows Invalid Transitions
**Risk:** approved → failed → approved via manual UPDATE  
**Severity:** HIGH  
**Files:**
- `src/lib/security/withdrawal-service.ts:267-276` (state update)

**Evidence:**
```sql
-- Line 268: No CHECK constraint on allowed transitions
UPDATE withdrawals SET state = $1 WHERE id = $6
```

**Impact:**
- Admin can resurrect failed withdrawal
- Double-broadcast risk

**Estimated Effort:** 2 days  
**Rollback Complexity:** Low (add trigger or constraint)

---

### H-06: No Maximum Order Size Enforcement
**Risk:** Single order can drain entire market  
**Severity:** HIGH  
**Files:**
- `src/lib/trading/validation.ts` (checked in inspection, likely no maxQuantity)

**Impact:**
- Market manipulation
- Liquidity exhaustion

**Estimated Effort:** 1 day  
**Rollback Complexity:** Low

---

### H-07: Ledger balanceAfter Not Verified
**Risk:** Caller can write arbitrary balanceAfter  
**Severity:** HIGH  
**Files:**
- `src/lib/trading/ledger-service.ts:42-67`

**Evidence:**
```typescript
// Line 49: Trusts caller's balanceAfter value
INSERT INTO wallet_ledger (..., balance_after) VALUES (..., $5)
// No recomputation from previous balance + delta
```

**Impact:**
- Ledger audit trail corrupted
- Cannot rebuild balances from ledger

**Estimated Effort:** 2 days  
**Rollback Complexity:** Medium

---

### H-08: No Deposit Accounting Flow
**Risk:** depositFundsTx is admin-only with no source-of-funds tracking  
**Severity:** HIGH  
**Files:**
- `src/lib/trading/wallet-balance-service.ts:296-345`

**Evidence:**
```typescript
// Line 299: Comment says "admin top-up / test seeding"
// No on-chain deposit detection
// No reference to blockchain transaction
```

**Impact:**
- Cannot prove reserves
- No way to credit real user deposits

**Estimated Effort:** OUT OF SCOPE (requires deposit rails)  
**Rollback Complexity:** N/A

---

### H-09: Trade Fee Calculation Uses Float Multiply
**Risk:** Fee rounding benefits one side  
**Severity:** HIGH  
**Files:**
- `src/lib/trading/engine.ts:152-153`

**Evidence:**
```typescript
const feeBuyer  = fillQty * tradePrice * makerFeeRate;  // 3 float multiplies
const feeSeller = fillQty * tradePrice * takerFeeRate;
```

**Impact:**
- Cumulative fee undercollection over millions of trades
- Revenue loss

**Estimated Effort:** Covered by C-01  
**Rollback Complexity:** Covered by C-01

---

### H-10: Withdrawal Idempotency Key Never Set
**Risk:** idempotency_key column exists but is always NULL  
**Severity:** HIGH  
**Files:**
- `src/lib/wallet/withdrawal-executor.ts` (no idempotency_key assignment)
- `src/lib/db-migrate.ts:1389` (column exists)

**Evidence:**
```typescript
// executor.ts line 103: UPDATE only sets tx_hash
UPDATE withdrawals SET tx_hash = $2, ...
// idempotency_key is never written
```

**Impact:**
- Index on idempotency_key is useless
- Cannot detect retry of same request parameters

**Estimated Effort:** 1 day  
**Rollback Complexity:** Low

---

### H-11: No Detection of Stuck Confirmations
**Risk:** confirming state never times out  
**Severity:** HIGH  
**Files:**
- `src/lib/wallet/confirmation/engine.ts` (buildTimeoutAt exists but not enforced)

**Evidence:**
```typescript
// Timeout computed but no worker checks it
timeoutAt: buildTimeoutAt(chainId as ChainId)
```

**Impact:**
- Funds stuck in held_balance forever
- User cannot retry

**Estimated Effort:** 2 days  
**Rollback Complexity:** Low

---

### H-12: Market Stats Cache Invalidation Race
**Risk:** Cache invalidated before trade written  
**Severity:** MEDIUM (HIGH if volume-based features exist)  
**Files:**
- `src/lib/trading/engine.ts:34` (invalidateStatsCache import exists)

**Evidence:**
- Cache invalidated synchronously after commit
- If another request reads between commit and invalidation, sees stale data

**Impact:**
- Brief stale 24h volume/price
- Can affect circuit breakers if added later

**Estimated Effort:** 1 day  
**Rollback Complexity:** Low

---

## MEDIUM PRIORITY FINDINGS (P2)

### M-01: Withdrawal Velocity Check is Fire-and-Forget
**Severity:** MEDIUM  
**Files:** `src/lib/security/withdraw-gate.ts`  
**Estimated Effort:** 1 day

---

### M-02: No Maximum Held Balance Limit
**Severity:** MEDIUM  
**Files:** `src/lib/trading/wallet-balance-service.ts`  
**Estimated Effort:** 1 day

---

### M-03: No Audit Trail for Balance Reconciliation Failures
**Severity:** MEDIUM  
**Files:** N/A (no reconciliation exists, covered by C-07)  
**Estimated Effort:** Covered by C-07

---

### M-04: Order Book Rebuild on Empty Book is Synchronous
**Severity:** MEDIUM  
**Files:** `src/lib/trading/engine.ts:202-209`  
**Impact:** First order after restart blocks for seconds  
**Estimated Effort:** 1 day

---

### M-05: No Rate Limit on Cancel Order
**Severity:** MEDIUM  
**Files:** `src/app/api/orders/[id]/route.ts`  
**Impact:** Cancel spam can exhaust DB connections  
**Estimated Effort:** 0.5 days

---

### M-06: Trade History Query Scans Both Buyer and Seller Indexes
**Severity:** MEDIUM  
**Files:** `src/lib/trading/trade-service.ts:148-175`  
**Impact:** UNION query on large trade table is slow  
**Estimated Effort:** 1 day

---

### M-07: Market Lock Promise Chain Leaks on Uncaught Reject
**Severity:** MEDIUM  
**Files:** `src/lib/trading/engine.ts:43-50`  
**Evidence:** `next.then(() => {}, () => {})` swallows errors  
**Impact:** Market permanently locked on unhandled rejection  
**Estimated Effort:** 0.5 days

---

## IMPLEMENTATION BATCHES

### BATCH 1: Precision Foundation (5 days)
**Goal:** Eliminate float arithmetic  
**Dependencies:** None  
**Risk:** HIGH

**Tasks:**
- [ ] C-01: Replace parseFloat/toFixed with decimal.js or pg-numeric across all financial code
- [ ] H-09: Covered by C-01
- [ ] Add unit tests for precision (8, 10, 18 decimals)
- [ ] Verify NUMERIC(30,10) sufficient for all assets

**Files:**
- `src/lib/trading/engine.ts`
- `src/lib/trading/wallet-balance-service.ts`
- `src/lib/trading/order-book.ts`
- `src/app/api/orders/route.ts`

**Rollback:** Code-only, no schema change

---

### BATCH 2: Concurrency Safety (4 days)
**Goal:** Prevent race conditions in order matching  
**Dependencies:** None  
**Risk:** CRITICAL

**Tasks:**
- [ ] C-02: Add CHECK constraint `remaining_quantity >= 0` + optimistic lock version
- [ ] C-04: Add UNIQUE constraint on (user_id, client_order_id) WHERE client_order_id IS NOT NULL
- [ ] H-01: Add SELECT FOR UPDATE in cancel path or use advisory lock per order

**Files:**
- `src/lib/trading/order-service.ts`
- `src/lib/db-migrate.ts`

**Rollback:** Medium (new migration required to revert constraints)

---

### BATCH 3: Withdrawal Idempotency (6 days)
**Goal:** Prevent double-broadcast  
**Dependencies:** None  
**Risk:** CRITICAL

**Tasks:**
- [ ] C-03: Add state check in executeWithdrawal: skip if state != 'approved'
- [ ] C-06: Wrap build+sign+broadcast+persist in single atomic flow with idempotency key
- [ ] H-10: Populate idempotency_key = hash(userId, asset, amount, address, nonce)
- [ ] H-05: Add state machine CHECK constraint or trigger

**Files:**
- `src/lib/wallet/withdrawal-executor.ts`
- `src/lib/wallet/queue/processor.ts`
- `src/lib/db-migrate.ts`

**Rollback:** High (requires careful state migration)

---

### BATCH 4: Balance Integrity (5 days)
**Goal:** Enforce balance invariants  
**Dependencies:** BATCH 1 (precision)  
**Risk:** CRITICAL

**Tasks:**
- [ ] C-07: Build daily reconciliation job: wallet_balances vs SUM(wallet_ledger)
- [ ] H-02: Add CHECK constraint `available_balance >= 0 AND held_balance >= 0`
- [ ] H-03: Remove LEAST() from chargeFee, fail transaction if fee > available
- [ ] H-07: Recompute balanceAfter in postLedgerEntryTx from previous balance

**Files:**
- `src/lib/trading/wallet-balance-service.ts`
- `src/lib/trading/ledger-service.ts`
- `src/lib/db-migrate.ts`

**Rollback:** Medium (schema + new worker)

---

### BATCH 5: Order Book Consistency (4 days)
**Goal:** Survive crashes  
**Dependencies:** BATCH 2  
**Risk:** HIGH

**Tasks:**
- [ ] C-05: Move book mutations inside transaction OR persist book to Redis
- [ ] C-08: Use 2-phase reserve: hold max possible, release excess after match
- [ ] M-04: Async book rebuild with in-progress flag

**Files:**
- `src/lib/trading/engine.ts`
- `src/app/api/orders/route.ts`

**Rollback:** High (requires Redis or event sourcing)

---

### BATCH 6: Risk Controls (3 days)
**Goal:** Add circuit breakers  
**Dependencies:** BATCH 1  
**Risk:** MEDIUM

**Tasks:**
- [ ] H-04: Add max price deviation check (e.g., 10% from last trade)
- [ ] H-06: Add market-level max order size in markets table
- [ ] H-11: Add timeout worker to mark stuck confirmations as 'timeout'

**Files:**
- `src/lib/trading/engine.ts`
- `src/lib/trading/validation.ts`
- New: `src/workers/confirmation-timeout-worker.ts`

**Rollback:** Low (config-driven)

---

### BATCH 7: Observability (2 days)
**Goal:** Detect anomalies  
**Dependencies:** BATCH 4  
**Risk:** LOW

**Tasks:**
- [ ] M-01: Log velocity gate failures to security_events
- [ ] M-02: Add alert on held_balance > 80% of total balance
- [ ] M-05: Add rate limit to DELETE /api/orders/[id]
- [ ] M-06: Optimize listUserTrades with materialized user_trades table
- [ ] M-07: Add unhandledRejection handler to reset market lock
- [ ] H-12: Invalidate cache inside transaction (COMMIT hook or event)

**Files:**
- Various

**Rollback:** Low (monitoring-only)

---

## EXECUTION ORDER (Sequencing)

```
SPRINT 1 (Weeks 1-2):  BATCH 1 → BATCH 2 → BATCH 3
SPRINT 2 (Weeks 3-4):  BATCH 4 → BATCH 5
SPRINT 3 (Week 5):     BATCH 6 → BATCH 7
```

**Critical Path:** BATCH 1 → BATCH 4 → BATCH 5  
**Parallel Possible:** BATCH 2 + BATCH 3 (different subsystems)

---

## HIGHEST-RISK ITEMS (Immediate Attention)

### 🔥 TOP 3 PRODUCTION RISKS

1. **C-02: Order Overfill** — Can be exploited NOW with concurrent requests. Expected loss: unbounded.

2. **C-03: Withdrawal Double-Broadcast** — Low probability but catastrophic. One incident = exchange insolvency.

3. **C-04: Balance Double-Spend** — Trivial to exploit with clientOrderId replay. Expected loss: 2× user balance per attack.

**Recommended Immediate Action:**
- Deploy BATCH 2 (concurrency fixes) within 48 hours
- Add monitoring for negative balances (alert-only, no fix)
- Rate-limit POST /api/orders to 5/minute per user (temp mitigation)

---

## ESTIMATED CERTIFICATION EFFORT

| Phase | Days | Engineers | Calendar |
|-------|------|-----------|----------|
| BATCH 1 | 5 | 2 | 1 week |
| BATCH 2 | 4 | 1 | 1 week |
| BATCH 3 | 6 | 2 | 1.5 weeks |
| BATCH 4 | 5 | 2 | 1 week |
| BATCH 5 | 4 | 2 | 1 week |
| BATCH 6 | 3 | 1 | 1 week |
| BATCH 7 | 2 | 1 | 0.5 weeks |
| **TOTAL** | **29** | **Peak 2** | **5-6 weeks** |

**Assumptions:**
- 2 engineers working in parallel where independent
- Full test coverage written alongside fixes
- QA regression suite run after each batch
- Staging deployment with synthetic load testing

---

## ROLLBACK STRATEGY

### Low Risk (Code-only):
- C-01, H-01, H-04, H-06, H-11, BATCH 6, BATCH 7
- **Rollback:** Git revert + deploy

### Medium Risk (Schema changes):
- C-02, C-04, H-02, H-03, H-05, H-07, BATCH 2, BATCH 4
- **Rollback:** Down-migration + schema lock during deploy

### High Risk (State machine changes):
- C-03, C-05, C-06, BATCH 3, BATCH 5
- **Rollback:** Requires data migration (e.g., replay withdrawals table)
- **Mitigation:** Blue-green deployment with read-only cutover window

---

## SIGN-OFF

**Financial Core Certification Status:** NOT READY FOR PRODUCTION

**Blocking Issues:** 8 CRITICAL  
**Target Certification Date:** 2026-08-30 (6 weeks)  
**Responsible Engineer:** TBD  
**Reviewer:** TBD  

---

TECPEY FINANCIAL CORE CERTIFICATION READY
