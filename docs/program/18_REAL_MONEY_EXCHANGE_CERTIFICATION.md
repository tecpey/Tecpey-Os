# Real-Money Exchange Certification — spot execution, conservation and ambiguity recovery

**Base:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** #698 identity/auth, #713 financial compliance. Full public activation also requires #715 custody/deposit/withdrawal readiness where customer funds depend on it.

## Objective
Certify the existing gated spot engine for real-money use without weakening the current launch-disabled boundary before all evidence is accepted.

## Core invariants
- decimal/fixed-point conservation only; no floating-point financial arithmetic;
- every accepted command has a stable idempotency/command identity;
- order, hold, fill, fee, balance and ledger mutations are one auditable financial authority;
- no double spend/double release under retries/concurrency;
- maker/taker fee version and market config are bound to the execution event;
- cancellation releases only remaining valid holds;
- FOK/IOC/GTC semantics are deterministic; unsupported order types fail closed;
- external/provider ambiguity never becomes “success by guess”.

## Certification work
- command admission matrix for market state, user/compliance state, balance/risk, feature activation;
- SERIALIZABLE/locking proof for critical balance/hold transitions where applicable;
- deterministic replay/reconciliation from immutable order/trade/ledger events;
- ambiguity state + operator recovery for provider/network timeouts;
- exact conservation checks by asset and account;
- market suspension / kill-switch / circuit-breaker authority;
- stale price/oracle/data-feed handling;
- self-trade / duplicate command / race-condition abuse tests;
- audit and correlation IDs across request→order→fill→ledger;
- exportable certification evidence with counts/digests, never raw secrets.

## Product/UI
- Arena↔Real switch remains locked until server activation authority says certified;
- “Real” mode visually and semantically distinct from virtual funds;
- no client flag can activate order admission;
- confirmations show amount/asset/fee/order type and final authoritative status;
- ambiguous/processing states are explicit.

## Provider and failure drills
- DB restart during admission;
- Redis/event transport degradation;
- duplicate/reordered events;
- partial worker failure;
- market data stale/unavailable;
- reconciliation detects injected ledger drift;
- feature flag disabled while direct API is called.

## Acceptance
Same immutable command/event history produces the same financial state and reconciliation result. Every activation precondition is machine-verifiable. Real-money order admission remains NO-GO until exact-candidate certification + compliance + operational approvals are accepted.
