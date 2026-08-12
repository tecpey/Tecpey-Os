# Recovery reconciliation contract

This contract defines the minimum domain reconciliation evidence required before
protected staging backup/restore evidence can be accepted for issue #110.
Repository-owned CI restore evidence is necessary, but it is not sufficient to
prove that product state can be trusted after a staging restore.

## Acceptance boundary

After every protected staging restore, the release operator records the exact
source SHA, restored image digest, backup digests, UTC restore window, RPO
boundary, measured RTO, and the reconciliation digests below. Raw customer data,
credentials, connection URLs, provider secrets, prompt transcripts, personal
records, and private keys are forbidden in evidence artifacts.

If any query fails, times out, returns an ambiguous result, or cannot be matched
to the expected source SHA and migration plan hash, the release is halted. The
operator opens an incident and resumes only after the owning domain records a
deterministic disposition.

## Domain reconciliation matrix

| Domain | Minimum evidence | Required invariant | Halt condition |
|---|---|---|---|
| Academy | Count and digest of users, lesson progress, assessments, certificate records, and learning events that were acknowledged before the backup boundary | All acknowledged server-side Academy state is present after restore; no browser-owned progress is accepted as authoritative | Missing assessment/progress row, certificate digest drift, or any recovery path that depends on `localStorage` or `sessionStorage` |
| Trading Arena | Count and digest of virtual orders, fills, positions, journals, challenge runs, and PnL snapshots committed before backup | Virtual capital, three-attempt challenge state, PnL, journal evidence, and Mentor-facing behavioral events reconcile to the same committed boundary | Position/PnL conservation mismatch, duplicated fill, missing journal evidence, or uncertain challenge attempt state |
| Mentor AI | Count and digest of authorized mentor events, memory records, provider decisions, and preference records | Mentor memory after restore contains only authorized persisted events and preserves opt-in/privacy boundaries | Lost authorized memory, newly exposed unauthorized memory, provider decision drift without explanation, or missing consent evidence |
| Exchange Ledger | Count and digest of exchange commands, order events, balance holds, ledger entries, reconciliation runs, and audit events | Financial conservation holds across restored orders, balances, ledger entries, and audit records; real-money activation remains disabled unless separately certified | Ledger imbalance, duplicate external-effect reference, missing audit event, ambiguous command outcome, or any withdrawal/custody activation claim |
| Notifications and operational jobs | Count and digest of durable outbox entries, operational job runs, delivered alerts, pending alerts, and quarantine files | Delivered alerts are not redelivered, pending alerts remain pending for bounded retry, and quarantined alerts remain quarantined | Duplicate alert delivery, missing critical alert, unexplained pending/quarantine drift, or failed alert probe |
| Tenant and principal isolation | Count and digest of tenant-scoped tables covered by the current isolation registry plus sampled principal ownership evidence | Restored data remains scoped to the same tenant and principal boundary as before backup | Cross-tenant row visibility, missing tenant context, unregistered tenant-scoped table, or principal ownership mismatch |

## Evidence format

Each domain produces a deterministic JSON summary with:

- `domain`
- `sourceSha`
- `migrationPlanHash`
- `backupBoundary`
- `queryDigest`
- `rowCounts`
- `startedAt`
- `completedAt`
- `operator`
- `reviewer`
- `disposition`

The `queryDigest` is computed from sorted, redacted, deterministic query output.
Evidence must contain counts and hashes only. Do not store raw rows.

Protected staging recovery reconciliation evidence must pass
`scripts/verify-protected-recovery-reconciliation-evidence.mjs` for the selected
release candidate SHA before NOG-05 can be represented as accepted. The verifier
requires the six launch domains in the matrix above, independent operator and
reviewer identities, a bounded restore window, a shared migration plan hash,
domain-level row counts, domain-level query digests, and the privacy boundary
`counts-and-hashes-only`, `no-raw-rows`, and `no-secrets-or-connection-urls`.
The repository-owned ephemeral CI restore verifier remains necessary but is not
accepted as protected staging domain reconciliation evidence.

## Required queries

The exact SQL may evolve with migrations, but each query set must cover the
domain concepts named in the matrix. Owners must version query changes with the
same pull request that changes the underlying schema, and protected staging
evidence must cite the query version that was run.

The recovery authority check intentionally treats this file as launch-critical.
Deleting a domain row, weakening halt conditions, or removing the no-raw-data
evidence rule must fail CI before issue #110 can be represented as closed.
