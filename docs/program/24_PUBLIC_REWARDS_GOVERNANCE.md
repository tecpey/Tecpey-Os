# Public Rewards & Incentive Governance

**Base:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** #705 Arena/League scoring authority, #713 compliance, #698 identity/KYC. Monetary funding/payment execution must use an approved financial/commercial authority. Public rewards remain disabled until this track is certified.

## Objective
Convert “جایزه نقدی و غیرنقدی” from marketing intent into an auditable eligibility and fulfillment system that cannot be gamed or mistaken for guaranteed returns.

## Principles
- competition rank and reward eligibility are separate authorities;
- reward terms are versioned per season/campaign and immutable after start except governed cancellation/safety clauses;
- no reward is promised merely because a leaderboard currently shows a rank;
- “20% PnL” or any similar rule is never interpreted as investment return; if such a promotional formula is used, its cap/base/eligibility/legal terms must be explicit and separately approved.

## Eligibility
- season/campaign ID, scoring version and cutoff snapshot;
- identity/KYC/compliance requirements where applicable;
- account uniqueness/fraud/abuse review;
- geographic/jurisdiction eligibility configured from counsel-approved policy;
- disqualification/appeal state with reason/audit;
- winner state: provisional → verification → approved → fulfillment_pending → fulfilled / rejected / expired.

## Fraud/abuse
multi-accounting, collusion, bot/replay manipulation, impossible timing, self-dealing, synthetic market exploitation and score tampering produce review evidence and cannot silently rewrite leaderboard history.

## Accounting/fulfillment
- reward liability recorded separately from trading balances;
- cash/non-cash catalog, currency/value, funding source and fulfillment reference;
- idempotent fulfillment command;
- reconciliation between approved liability and fulfilled payout/item;
- refund/reversal/cancellation semantics where relevant;
- no private payment instrument data in TecPey logs.

## UX
- leaderboard shows provisional/verified status where material;
- terms, cutoff time/timezone and verification requirements visible;
- no dark-pattern urgency or guaranteed-income copy;
- privacy-safe public winner display and opt-out where policy allows.

## Acceptance
Given an immutable season snapshot, scoring version and policy version, the same provisional eligibility set is reproduced. Fulfillment is idempotent/reconciled and independently auditable. Public financial rewards stay NO-GO until legal/compliance/accounting/fraud approvals are attached.
