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

## Governed protected-staging collector

The manually dispatched `Protected Staging Recovery Reconciliation Evidence`
workflow is the only repository-owned collector authorized to produce this
evidence class. It runs on the protected `tecpey-staging` runner and requires the
exact active release SHA, a reviewer GitHub identity different from the workflow
actor, explicit independent-review confirmation, and approval for the `staging`
environment.

The collector never restores into the active staging database or Redis service.
It exports a PostgreSQL `REPEATABLE READ` snapshot, downloads a Redis RDB, creates
a random temporary PostgreSQL database, and starts an unprivileged Redis process
bound only to a temporary Unix socket. It then compares deterministic table
counts and row hashes between source and restore, verifies the current migration
plan hash, executes the exchange financial-conservation queries, and proves that
the 52-table tenant registry exactly matches runtime tenant-scoped tables. Both
temporary restore targets are removed before an accepted artifact is written.

The artifact contains only aggregate counts, SHA-256/MD5 digests, bounded UTC
windows, participant identities, and accepted dispositions. Database URLs,
Redis URLs, command output, source rows, dump files, RDB files, and host
identifiers never leave the runner. Any unavailable tool, permission failure,
schema drift, count/digest mismatch, tenant/principal orphan, financial delta,
Redis key-count drift, cleanup failure, or RTO breach fails closed and produces
no accepted JSON evidence.

## Required queries

The governed query membership is versioned in
`scripts/protected-recovery-reconciliation-collector-policy.mjs`. The exact SQL
may evolve with migrations, but each query set must cover the domain concepts
named in the matrix. Owners must version query changes with the same pull request
that changes the underlying schema. The artifact's deterministic `queryDigest`
binds the table membership, source counts, and row digests that were run.

The recovery authority check intentionally treats this file as launch-critical.
Deleting a domain row, weakening halt conditions, or removing the no-raw-data
evidence rule must fail CI before issue #110 can be represented as closed.
