# Wallet Engine — Phase 30

> Atomic balance operations, hold/release model, and dual-layer accounting.

---

## Overview

TecPey's wallet engine uses two complementary data stores:

| Layer | Table | Role |
|-------|-------|------|
| Balance table | `wallet_balances` | O(1) read/write snapshot of current available and held balances |
| Ledger | `wallet_ledger` | Immutable, append-only audit trail of every balance change |

Every balance mutation in Phase 30 writes to **both** layers inside the same Postgres transaction, so the two always agree after commit.

---

## Schema — wallet_balances

```sql
CREATE TABLE wallet_balances (
  user_id           TEXT           NOT NULL,
  asset             TEXT           NOT NULL,
  available_balance NUMERIC(30,10) NOT NULL DEFAULT 0,
  held_balance      NUMERIC(30,10) NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_wallet_balances          PRIMARY KEY (user_id, asset),
  CONSTRAINT chk_wb_available_nonneg CHECK (available_balance >= 0),
  CONSTRAINT chk_wb_held_nonneg      CHECK (held_balance      >= 0)
);
```

- **Primary key**: `(user_id, asset)` — one row per user per asset.
- **CHECK constraints**: the database engine enforces non-negative balances. An `UPDATE` that would produce a negative value is rejected with a constraint violation, causing the enclosing transaction to roll back.
- No separate `id` column; the composite PK is sufficient.

---

## Hold / Release Model

```
Order placed
  → hold(qty × limitPrice in USDT)
      available_balance -= holdAmount
      held_balance      += holdAmount

On each fill
  → release(holdAmount portion for this fill)
      available_balance += releaseAmount
      held_balance      -= releaseAmount
  → trade_debit(actual cost = qty × tradePrice)
      available_balance -= tradeAmount
  → trade_credit(received asset)
      available_balance += receivedAmount  (in base asset)
  → fee(quote asset)
      available_balance -= feeAmount

On cancel
  → release(remaining × limitPrice)
      available_balance += remainingHold
      held_balance      -= remainingHold
```

### Price improvement (limit BUY orders)

When a BUY limit order fills below the limit price, the release is computed at `limitPrice × fillQty` but the debit is only `tradePrice × fillQty`. Since `tradePrice ≤ limitPrice`, the net effect on `available_balance` is positive — the buyer receives back the difference. This is correct: the over-held amount is returned to the buyer.

### Market orders

Market orders have no `limitPrice`. The route computes a hold estimate at `bestAsk × qty`. Inside the matching engine, each fill uses `tradePrice` as the release basis:

```
buyerHoldRelease = fillQty × tradePrice  (not limitPrice, which is 0)
```

On zero-fill expiry, the engine queries `wallet_ledger` to find the original hold amount and releases it in full.

---

## Atomicity Guarantees

### Hold (order placement)

```sql
UPDATE wallet_balances
SET
  available_balance = available_balance - $holdAmount,
  held_balance      = held_balance      + $holdAmount,
  updated_at        = NOW()
WHERE user_id = $1 AND asset = $2 AND available_balance >= $holdAmount
RETURNING available_balance
```

If `available_balance < holdAmount`, the WHERE clause matches 0 rows → the application returns `false` → the outer transaction rolls back → the order record is also discarded.

There is no separate `SELECT` then `UPDATE` — the check and debit happen in a single SQL statement, eliminating the TOCTOU (time-of-check / time-of-use) race present in Phase 29.

### Full matching transaction

The entire match sequence for one order runs inside a single `BEGIN` / `COMMIT` block:

1. Trade row creation (`INSERT INTO trades`)
2. Buyer: release → trade_debit → trade_credit → fee
3. Seller: release → trade_debit → trade_credit → fee
4. Maker order status update (`UPDATE orders`)
5. Audit events (`INSERT INTO order_events`)
6. Incoming order final status

Any failure rolls back all writes — no partial trade states are committed.

### Constraint enforcement

The `CHECK (available_balance >= 0)` constraint on `wallet_balances` is the last line of defence. Even if a bug bypasses the application-layer checks, Postgres will reject the write.

---

## Service Layer

`src/lib/trading/wallet-balance-service.ts` exports:

| Function | Description |
|----------|-------------|
| `holdFundsTx(client, userId, asset, amount, orderId)` | Atomic hold — tx-aware |
| `holdFunds(userId, asset, amount, orderId)` | Standalone hold |
| `releaseFundsTx(client, userId, asset, amount, refId)` | Release held funds — tx-aware |
| `releaseFunds(...)` | Standalone release |
| `creditFundsTx(client, userId, asset, amount, tradeId)` | Add received asset — tx-aware |
| `debitFundsTx(client, userId, asset, amount, tradeId)` | Deduct spent asset — tx-aware |
| `chargeFeeTx(client, userId, asset, amount, tradeId)` | Deduct fee — tx-aware |
| `depositFundsTx(client, userId, asset, amount, refId)` | Admin deposit — tx-aware |
| `depositFunds(...)` | Standalone admin deposit |
| `getBalance(userId, asset)` | O(1) balance read |

The `*Tx` variants accept a `PoolClient` and participate in the caller's transaction. Standalone variants acquire their own connection via `withDb`.

`src/lib/trading/wallet-service.ts` provides the public surface (`getAvailableBalance`, `postHold`, `postRelease`) used by the API route layer — it delegates to `wallet-balance-service` internally.

---

## Reading Balance

```typescript
import { getAvailableBalance } from "@/lib/trading/wallet-service";
const available = await getAvailableBalance(userId, "USDT"); // O(1)
```

The Phase 29 aggregate query over `wallet_ledger` is replaced by a direct lookup on `wallet_balances`. The ledger remains available for audit queries via `queryLedger`.

---

## Known Gaps (Phase 31+)

| Gap | Status |
|-----|--------|
| Real-money deposit / withdrawal rails | Out of scope — no KYC or payment provider |
| Negative adjustment support | Not implemented |
| Fee rebates (negative fee) | Not implemented |
| Cross-asset settlement | Not implemented |
| Balance reconciliation tool (ledger vs balance table drift) | Not implemented |
