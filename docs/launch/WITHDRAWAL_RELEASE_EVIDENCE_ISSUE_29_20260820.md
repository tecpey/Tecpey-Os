# Withdrawal release evidence boundary for issue #29

Authority: `tecpey-withdrawal-release-evidence-v1`

Issue: #29

Decision: `CORE_AUTHORITY_REMEDIATED_REAL_MONEY_REMAINS_BLOCKED`

Date: 2026-08-20

## Scope

This record advances issue #29 by making the remaining withdrawal release
evidence boundary explicit and machine-checked. It does not close #29.

The current repository proves PostgreSQL-owned withdrawal authority, durable
persist-before-broadcast behavior, ambiguous RPC recovery fixtures, confirmation
projection authority, and atomic settlement evidence. It does not prove
production custody, protected staging end-to-end withdrawal execution, or
chain-provider certification.

## Repository-controlled evidence now required

The release gate must keep the following controls wired:

1. `withdrawals:check`.
2. `test:withdrawal-admission`.
3. `custody:check`.
4. `test:custody-gate`.
5. `wallet:precision:check`.
6. `test:wallet-precision`.
7. `withdrawal:issue29:evidence:check`.
8. PostgreSQL-authoritative execution claim and one active broadcast attempt.
9. Persist-before-effect signed transaction bytes and expected transaction hash.
10. Ambiguous RPC outcomes classified as reconciliation debt before any retry.
11. Confirmation monitor authority before provider observation and settlement.
12. Atomic withdrawal, wallet ledger, and held-balance settlement.

## Remaining external evidence before #29 closure

| Evidence family | Current repository proof | Required external proof |
|---|---|---|
| Concurrent duplicate broadcast | PostgreSQL + Redis integration test keeps one RPC submission | Protected staging or testnet execution artifact with operator/reviewer evidence |
| Database loss after broadcast | Expired calling lease becomes ambiguous reconciliation debt | Protected recovery drill proving no blind rebroadcast after DB/process loss |
| Ambiguous RPC and already-known handling | Provider fixtures fail closed or require positive presence evidence | Per-enabled-provider signed fixture set and testnet replay |
| Chain certification | Provider abstractions and deterministic fixture behavior | Independent certification for every enabled chain/provider |
| Testnet runtime evidence | No real chain execution claim | Testnet withdrawal Golden Path for every enabled chain |
| HSM/MPC custody | Production custody gate blocks real withdrawals | Implemented signer, key rotation, recovery, and fallback-impossible evidence |
| Reconciliation | Atomic local settlement and exchange ledger authority | Withdrawal, wallet ledger, and on-chain reconciliation report |
| DLQ/manual review | Queue boundaries and incident contracts | Exercised DLQ/manual-review runbook drill |
| Hot-wallet limits and dual control | Custody launch policy gate | Approved policy, limits, signer approvals, and dual-control evidence |
| Staging Golden Path | Repository CI and focused integration tests | Protected staging end-to-end withdrawal Golden Path |

## Non-closure boundary

Issue #29 remains open until the external evidence above is collected and
reviewed. Repository gates may advance internal authority, but they must not be
interpreted as production custody approval.

## Explicit non-claims

This readiness record does not approve real-money withdrawals, deposits,
custody, production signer activation, HSM/MPC readiness, chain-provider
certification, protected staging activation, public launch, enterprise
activation, white-label activation, accepted-risk signoff, or the final Go
matrix.
