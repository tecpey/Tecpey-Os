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
