# Exchange Decimal Matching and Settlement Inventory

Status: **P0 implementation inventory**  
Issue: **#76**  
Parent: **#30**  
Program gates: **#50, #26**  
Base: **`9c94fc289f893fd2dd3e1d5d8344d03f0b906e64`**

## 1. Bounded conservation boundary

This slice closes one complete production path:

`persisted admitted order → PostgreSQL-authoritative book rebuild → exact crossing and fill plan → trade row → order fill/VWAP → wallet hold release/debit/credit/fees → terminal hold closure → cache projection`.

The existing PostgreSQL market execution lock, row locks, transaction boundary, order admission authority and single-node safety contract remain intact.

## 2. Confirmed precision loss

### Matching engine

`src/lib/trading/engine.ts` currently converts authoritative strings and market fee rates through `Number(...)`, stores fill quantities/prices/fees/releases as numbers, compares with `1e-10`/`1e-12`, multiplies quantities and prices as JavaScript numbers and derives VWAP from a floating-point numerator.

### Matching book

`src/lib/trading/order-book-store.ts` stores maker price, original quantity and remaining quantity as numbers. It sorts canonical price keys through `parseFloat`, sums FOK liquidity as numbers and removes terminal quantities through epsilon checks. Redis mirrors the same number-shaped member.

### Recovery

`src/lib/trading/order-book-recovery.ts` converts PostgreSQL numeric text to numbers before rebuilding the matching cache.

### Trade/order persistence

`src/lib/trading/trade-service.ts` accepts numbers and calls `.toFixed(10)` after precision has already been lost. `updateOrderFillTx()` in `order-service.ts` accepts numeric fill inputs even though PostgreSQL performs exact NUMERIC arithmetic.

### Wallet mutation signatures

Wallet mutation SQL and ledger writes are already string/NUMERIC based, but settlement helpers still accept `number | string`, allowing the matching engine to pass precision-lost values.

## 3. Required exact representation

- persisted and cache financial values are canonical decimal strings;
- Decimal instances exist only within bounded calculation functions and are never serialized as authority;
- all crossing, min, remaining and zero decisions use Decimal comparisons;
- fill records carry exact quantity, price, quote gross, buyer/seller fee, hold-release amounts and post-fill remaining strings;
- fees and settlement values use explicit NUMERIC(30,10)-compatible scale and deterministic rounding policy;
- VWAP is exact cumulative quote divided by exact cumulative quantity;
- PostgreSQL receives strings for every trade, order and wallet mutation.

## 4. Settlement and conservation

For each fill:

- buyer quote debit = quote gross + buyer fee;
- buyer base credit = fill quantity;
- seller base debit = fill quantity;
- seller quote credit = quote gross - seller fee;
- platform quote credit = buyer fee + seller fee;
- maker/taker fee assignment follows maker side and market rates;
- order holds release only the fee-covered matched basis, with residual closure at terminal state;
- trade, orders, wallet balances, ledger and events commit in the existing single PostgreSQL transaction.

## 5. Cache/projection contract

PostgreSQL remains authority. Matching cache entries use exact strings and deterministic FIFO ordering. Redis remains a write-through projection; numeric sorted-set score must never be read as financial authority. Book rebuild always starts from PostgreSQL numeric text.

## 6. Non-goals

- no multi-node matching redesign;
- no public Exchange UI redesign;
- no weakening of order admission or current market execution lock;
- market-buy depth reservation remains fail closed unless an exact bounded envelope exists;
- general market statistics/display conversions are separate from settlement authority.

## 7. Adversarial evidence

- binary-unsafe decimal crossing and exact fill planning;
- exact full fill and multiple partial fills;
- exact maker/taker fee assignment and VWAP;
- FOK exact liquidity comparison without epsilon;
- IOC/FOK/cancel terminal holds leave zero residual dust;
- concurrent/replayed settlement creates one trade/ledger effect;
- base, quote and platform fee conservation across balances and immutable ledger;
- source guard rejects `Number`, `parseFloat`, epsilon, `.toNumber()` and number multiplication in authoritative matching/settlement files.
