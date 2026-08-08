# Controlled Launch Evidence Digest — 2026-08-08

**Status:** post-operations-governance digest  
**Exact main SHA:** `19fd27e141f33db0b27d89212113397d10e85f87`  
**Related:** #26, #50, #110, #229, PRs #331, #332, #333

This digest records what changed after the 2026-07-19 completion baseline and
the 2026-07-26 repository audit. It is a release-management aid, not a new
Go/No-Go decision and not a marketing readiness claim.

## Summary

The controlled-launch path is stronger than the dated baseline because recovery,
staging-readiness and CI determinism now have tighter repository governance.
This does not activate real-money Exchange, custody, deposits or withdrawals.
It also does not replace real protected-staging execution evidence.

## Newly accepted repository evidence

| Area | Evidence | Practical effect | Remaining boundary |
|---|---|---|---|
| Operational recovery | PR #331 added `docs/operations/RECOVERY_RECONCILIATION_CONTRACT.md` and guarded it through Scheduled Operational Recovery. | Backup/restore evidence now has a product-domain reconciliation matrix rather than only infrastructure liveness. | Real protected staging restore evidence and operator-recorded reconciliation still remain. |
| Staging readiness | PR #332 added `docs/operations/STAGING_READINESS_EVIDENCE_CONTRACT.md` and extended the staging evidence guard. | Staging evidence must cover exact SHA, image digest, health, systemd, DB migration, alert probe, spool drain, rollback readiness and residual risk. | The contract governs evidence; it does not prove an actual staging deployment has run. |
| CRM test determinism | PR #333 serialized focused CRM PostgreSQL evidence and guarded that command. | A transient CRM deadlock in CI no longer makes release evidence randomly red when shared durable CRM fixtures are tested. | CRM production behavior is unchanged; this is test-governance evidence only. |

## Current launch interpretation

The defensible controlled Soft Launch scope remains:

- public Persian/English experience;
- controlled Academy journeys;
- governed educational Mentor assistance;
- official virtual Trading Arena;
- real-money Exchange, custody, deposits, withdrawals, public financial rewards
  and enterprise/white-label claims disabled or explicitly gated.

## No-Go boundaries that remain

| Boundary | Why it remains closed |
|---|---|
| Real-money Exchange activation | Reconciliation, ambiguous-result recovery, provider evidence, compliance and broader financial certification remain open. |
| Production custody and withdrawals | HSM/MPC custody, chain-provider certification, testnet evidence and on-chain reconciliation remain independent gates. |
| Protected staging acceptance | The repository now defines the evidence contract, but actual host evidence must still be collected and reviewed. |
| Final release reconciliation | #50 still requires feature-by-feature status, accepted-risk register, failure testing and final evidence-backed Go/No-Go. |

## Management note

Do not increase the completion percentage from this digest alone. The recent
work reduces release ambiguity and CI randomness. A readiness percentage can move
only after real staging execution, recovery drills, product Golden Paths or
financial/custody/compliance gates produce accepted evidence.
