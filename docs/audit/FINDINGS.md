# TecPey — Repository Asset Audit: FINDINGS

Auditor role: software asset auditor (evidence-based verification only).
Repository: `tecpey` (crypto exchange / trading + academy platform, Next.js 16, TypeScript).
Method: targeted inspection of high-value financial assets (matching, ledger, wallet, withdrawal). Each finding is backed by file/line evidence.

---

## F-001 — `updateOrderFill` (non-Tx) lacks the overfill guard present in `updateOrderFillTx`

- **ID:** F-001
- **Severity:** High
- **Confidence:** High
- **File:** `src/lib/trading/order-service.ts`
- **Line numbers:** 267–293 (vulnerable `updateOrderFill`); compare 203–231 (`updateOrderFillTx`)

### Evidence
`updateOrderFillTx` (transaction-aware variant) guards the fill UPDATE with a
`WHERE ... AND remaining_quantity >= $1` clause (line 222):

```
WHERE id = $4::uuid AND remaining_quantity >= $1
```

The standalone `updateOrderFill` variant performs the identical arithmetic
(`filled_quantity = filled_quantity + $1`, `remaining_quantity = remaining_quantity - $1`)
but its WHERE clause omits the `remaining_quantity >= $1` guard (line 285):

```
WHERE id = $4::uuid
```

### Root cause
The overfill safety predicate was added to the `*Tx` variant but not mirrored
onto the convenience variant. The two functions are otherwise line-for-line
equivalent, so the omission is an inconsistency rather than an intentional
design difference.

### Production impact
Any caller path that uses `updateOrderFill` (rather than `updateOrderFillTx`)
can apply a fill larger than the order's `remaining_quantity`, driving
`remaining_quantity` negative and `filled_quantity` above the original order
`quantity`. Because these columns feed order status, VWAP `avg_fill_price`, and
downstream balance settlement, this corrupts order accounting and can release/
debit more asset than the order authorized. On an exchange this is a
direct financial-integrity defect.

### Recommended fix
Add `AND remaining_quantity >= $1` to the `updateOrderFill` WHERE clause so it
matches `updateOrderFillTx`, and treat a 0-row result as a rejected/late fill.
Prefer deleting the non-Tx variant entirely and routing all fills through the
transaction-aware path so fill + balance + ledger mutate atomically.

---

## F-002 — `RedisOrderBookStore.findAndRemove` can leave orphaned orders in Redis on write failure

- **ID:** F-002
- **Severity:** High
- **Confidence:** High
- **File:** `src/lib/trading/order-book-store.ts`
- **Line numbers:** 215–229

### Evidence
`RedisOrderBookStore.findAndRemove` (line 215) calls `super.findAndRemove(market, entry)`
which synchronously removes the order from the in-memory book. It then fires
an async Redis pipeline to clean up the same order with no retry and no
synchronization:

```
void this.redis.pipeline()
  .zrem(key, member)
  .del(`tecpey:order:${orderId}`)
  .exec()
  .catch((err) => logger.warn("[order-book-store] Redis findAndRemove failed", { err }));
```

If the Redis call fails (connection error, timeout, etc.), the order is
permanently removed from the in-memory book but remains in Redis. On the next
process restart, `warmFromRedis` (line 287) reads from Redis and re-inserts
the order into the in-memory book via `super.insert` (line 299), resurrecting
a cancelled order as a live resting order.

### Root cause
The Redis write-through is fire-and-forget with no durability guarantee.
The in-memory mutation commits before Redis confirms, and a Redis failure
is logged but not retried or propagated.

### Production impact
Cancelled orders can re-appear as live resting orders after restart.
On a crypto exchange, a maker order that was cancelled (funds released) could
re-enter the book, get matched, and cause the system to attempt a second fill
for an order the user already cancelled. This results in incorrect trade
execution, incorrect balance debits, and a user having funds held for an order
they believe was cancelled.

### Recommended fix
Make Redis cleanup synchronous (await the pipeline) before removing from
in-memory, or use a two-phase approach: mark as "pending cancel" in Redis,
remove from memory, then confirm Redis cleanup. Alternatively, add a
reconciliation sweep that detects orders in Redis not present in the
in-memory index on startup and cleans them up.

---
