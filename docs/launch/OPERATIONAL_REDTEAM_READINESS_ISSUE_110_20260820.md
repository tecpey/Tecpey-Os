# Operational Red Team readiness for issue #110

Authority: `tecpey-operational-redteam-readiness-v1`

Issue: #110

Decision: `REPOSITORY_READINESS_ADVANCED_PROTECTED_DRILLS_STILL_OPEN`

Date: 2026-08-20

## Scope

This record advances issue #110 by making the operational Red Team drill
boundary explicit and machine-checked. It does not close #110.

The current repository can prove bounded, synthetic recovery mechanics on
GitHub-hosted infrastructure. It cannot prove protected staging, provider,
operator, or production-like failure recovery without external execution
evidence.

## Repository-controlled evidence now required

The following controls must remain present before any release claim can rely on
operational recovery readiness:

1. Exact-head `Scheduled Operational Recovery` workflow.
2. PostgreSQL and Redis isolated restore with measured RPO/RTO.
3. Migration plan hash equality before and after restore.
4. Late-write exclusion proof for PostgreSQL and Redis.
5. Bounded JSON evidence with no secrets, raw rows, host material, tokens, or
   customer data.
6. Protected recovery reconciliation verifier for Academy, Trading Arena,
   Mentor AI, Exchange Ledger, Notifications and operational jobs, and Tenant
   and principal isolation.
7. Incident readiness verifier remains separate from restore evidence.
8. The release check includes the operational Red Team readiness guard.

## Drill matrix coverage

| Drill family | Repository gate | Required external evidence before #110 closure |
|---|---|---|
| PostgreSQL and Redis backup/restore | `test-container-volume-recovery.sh` plus `verify-operational-recovery-evidence.mjs` | Protected restore artifact with named operator, reviewer, RPO/RTO, and domain reconciliation |
| Migration interruption and retry | Migration authority tests and recovery workflow trigger paths | Protected staging interruption drill with checksum/lock evidence |
| Database outage, pool exhaustion, lag, deletion | Recovery contract and protected verifier | Staging fault injection, alert evidence, and accepted reconciliation |
| Redis outage, worker crash, stale lease, DLQ | Operational runbook and domain recovery contracts | Queue/worker crash drill with durable command/effect evidence |
| Provider timeout, malformed response, webhook disorder | Domain-specific fail-closed tests and incident contract | Provider or sandbox drill with signed replay/reconciliation evidence |
| Deploy, rollback, stale client, secret rotation, kill switch | Container rollback and volume restore workflows | Protected canary/rollback execution by a non-author operator |

## Non-closure boundary

Issue #110 remains open until all of the following are externally evidenced and
reviewed:

- protected-staging restore and domain reconciliation evidence;
- operator and reviewer independence;
- incident/runbook execution by someone other than the change author;
- provider, queue, worker, deployment, and rollback drills;
- alert/dashboard links and final disposition;
- no ambiguous financial or user-critical state after recovery.

## Explicit non-claims

This readiness record does not approve public launch, real-money operations,
custody, deposits, withdrawals, enterprise activation, white-label activation,
protected staging activation, accepted-risk signoff, or the final Go matrix.

