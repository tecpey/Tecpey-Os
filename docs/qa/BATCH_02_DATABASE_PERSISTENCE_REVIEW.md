# Batch 02 — Database Schema, Migrations and Persistence Infrastructure Review

**Program:** #156  
**Coordination PR:** #158  
**Reviewed source snapshot:** `e8c9ddb177860ea5fb2dd0d4a9c40edcd94c1bcf`  
**Status:** REVIEW COMPLETE FOR ASSIGNED SNAPSHOT — remediations remain open; this is not a production-readiness claim.

## 1. Denominator

Batch 02 contains **12 tracked files and 3,065 textual lines**:

| Path | Lines |
|---|---:|
| `migrations/0001_initial_schema.sql` | 335 |
| `migrations/README.md` | 58 |
| `src/lib/db-migrate-api-command-idempotency.ts` | 123 |
| `src/lib/db-migrate-compat.ts` | 98 |
| `src/lib/db-migrate-offline-sync.ts` | 103 |
| `src/lib/db-migrate-sensitive-mutation-audit.ts` | 170 |
| `src/lib/db-migrate-user-state.ts` | 438 |
| `src/lib/db-migrate.ts` | 1,014 |
| `src/lib/db-migration-plan.ts` | 62 |
| `src/lib/db.ts` | 138 |
| `src/lib/redis-pubsub.ts` | 277 |
| `src/tests/database/migration-integration.test.ts` | 249 |

All assigned lines were reviewed against migration ordering, transaction boundaries, locking, schema constraints, ownership, source of truth, runtime bootstrap, Redis coordination, failure semantics, idempotency, health/readiness and test evidence.

## 2. Existing positive controls

The review confirmed substantial progress compared with the earlier repository state:

- one exported `applyDatabaseMigrations()` plan is shared by CI, deployment tooling and application bootstrap;
- migration bodies execute inside explicit PostgreSQL transactions;
- applied migrations are recorded with source-derived checksums;
- modifying an applied migration causes a checksum mismatch and hard failure;
- the canonical plan is protected by a session-scoped PostgreSQL advisory lock;
- CI provisions clean PostgreSQL, runs migrations, reruns them and verifies ledger stability;
- the integration test checks critical tables, columns, indexes, triggers and selected privacy constraints;
- database-backed APIs commonly receive an explicit `{ enabled: false }` result when persistence cannot be established rather than silently switching to browser authority;
- idempotency, Offline Sync, sensitive mutation audit and Arena execution schemas contain meaningful check constraints, uniqueness and append-only protections;
- later Arena reflection schemas correctly demonstrate composite parent/principal ownership through `(attempt_id, student_id)` foreign keys.

These controls are valuable, but they do not close the findings below.

## 3. Confirmed findings

### B02-F01 — P0 — Redis bootstrap can falsely authorize production single-node matching

**Issue:** #165

The custom production server relies on Redis node discovery to keep process-local matching restricted to one web/matching node. The current pub/sub manager suppresses initialization failures and returns a count of `1` when the publisher is unavailable or discovery fails. The server therefore cannot distinguish “one verified node” from “Redis authority unavailable.”

The same boundary uses blocking `KEYS`, does not retain every interval for shutdown, and starts background workers before the complete production readiness decision. A Redis outage, authentication failure or registration failure can therefore become an apparently safe startup result.

**Release impact:** production Exchange matching remains **NO-GO** until Redis initialization, discovery and readiness fail closed with adversarial integration evidence.

### B02-F02 — P1 — Migration identity, ordering, locking and runtime execution are not deterministic enough

**Issue:** #166

The migration ledger uses free-form filename identity while execution order is distributed across a large base array, multiple domain runners and a manually ordered plan. Numeric prefixes are duplicated (`0002`, `0020`, `0021`, `0022`, `0027`), and the base array itself contains non-monotonic execution such as `0008` after `0011` and a second `0002` near the end.

Production database access still lazily runs the complete migration plan on the first `withDb()`/`withTx()` call. This contradicts the stated goal of replacing schema-on-connect with an explicit runner. The advisory lock uses unbounded `pg_advisory_lock(hashtext(...))`; lock contention and cleanup failure are not bounded or adversarially tested.

The initial SQL snapshot still describes the migration runner as future work and is operationally stale.

**Release impact:** controlled deployment is conditionally blocked until production migrations are explicit, ordered, bounded, observable and runtime verification is separated from DDL execution.

### B02-F03 — P0 program evidence — child rows are not consistently bound to their owner principal/tenant

**Program:** #109 / #155

Confirmed examples were posted to #155:

- `academy_trading_arena_commands` independently references `attempt_id` and `student_id`, but does not enforce that the attempt belongs to that student;
- `academy_trading_arena_execution_events` has the same ownership gap;
- later reflection tables correctly use a composite `(attempt_id, student_id)` foreign key, demonstrating the intended invariant;
- `offline_sync_commands` independently references a tenant and an Academy student without a database-enforced membership relationship;
- tenant/principal identity across `platform_memberships`, Academy UUID students, API receipts and audit rows is not yet unified through one enforceable canonical principal model.

Application queries can behave correctly while the database still permits structurally cross-principal evidence. The reusable tenant A/B and principal A/B harness must prove child-parent ownership rejection at the database layer.

**Release impact:** Social/Arena evidence, Offline Sync tenant operation and full white-label claims remain **NO-GO** until the #155 isolation foundation and domain migrations are complete.

### B02-F04 — P1 — Migration tests prove existence more strongly than behavior and recovery

The current PostgreSQL integration test verifies selected migration filenames, table/column/index/trigger existence and rerun ledger equality. It does not yet prove:

- unique monotonic migration sequence or dependency graph;
- canonical-plan drift detection;
- concurrent migration runners and bounded lock contention;
- interrupted plan recovery and readiness behavior;
- upgrade from a representative previous production schema;
- restore-from-backup schema equivalence;
- cross-principal foreign-key rejection for the identified Arena/Offline Sync rows;
- actual append-only trigger behavior for every critical table rather than trigger-name presence;
- rollback/forward-fix behavior when a later migration fails;
- runtime verify-only behavior when a migration is missing or changed.

This finding is tracked primarily through #166 and #155 rather than a duplicate issue.

## 4. Transaction and failure-semantics review

### Per-migration atomicity

Each reviewed migration runner begins a transaction, applies its SQL, inserts the ledger row and commits. On SQL failure it rolls back and rethrows. This is a strong per-migration property.

The complete multi-runner plan is not one transaction, which is normally necessary for operationally large PostgreSQL migrations, but it means partial plan application is a valid state after failure. Readiness, resumption and forward-fix procedures must therefore be explicit.

### Application bootstrap

`db.ts` caches one schema initialization promise per process. On failure it clears the promise and allows a later request to retry. Callers see generic persistence unavailability. This avoids a permanent poisoned process, but it also makes request traffic a migration retry mechanism and hides the difference between database outage, migration checksum failure, lock wait and schema incompatibility.

### Pool configuration

The pool has connection and idle timeouts but no reviewed statement timeout, transaction timeout, lock timeout or query cancellation policy in this boundary. Critical workers and migrations require operation-specific budgets rather than an unbounded database statement model.

### Redis projection boundary

Redis pub/sub is suitable only as a lossy realtime projection when PostgreSQL/API reads can reconstruct authoritative state. Any domain event whose loss changes financial, audit, notification or recovery truth must use a durable outbox/queue rather than this best-effort publisher.

## 5. Schema ownership review

The schemas contain many useful local constraints, but platform ownership remains heterogeneous:

- some tables use UUID student ownership;
- some use text user IDs;
- some use tenant text plus an independently referenced user/student;
- some sensitive evidence tables store actor/resource identity as bounded strings without enforceable parent relationships;
- row-level security or an equivalent centralized repository policy is not yet proven platform-wide.

Until #155 produces the machine-readable isolation inventory, every tenant/principal-bearing table should be classified as enforced, explicitly global, migration debt or release-blocking unknown.

## 6. Documentation integrity

`migrations/0001_initial_schema.sql` is useful historical evidence, but its header says the migration runner is future work and schema-on-connect will later be replaced. That statement is now false: the runner exists and the application still performs lazy schema migration.

Reference-only snapshots must be clearly archived and must not look like current deployment instructions. `migrations/README.md`, root deployment documents and the README must point to the executable migration authority and current production policy consistently.

## 7. Current capability decisions

| Capability | Decision | Reason |
|---|---|---|
| Clean CI database creation and idempotent rerun | CONDITIONAL GO | Existing checks are strong, but ordering/dependency/concurrency evidence remains incomplete |
| Single-process local development migration bootstrap | CONDITIONAL GO | Useful for development; must not be confused with production deployment policy |
| Production request-triggered DDL | NO-GO | Migration execution and application readiness must be separated (#166) |
| Multi-node Exchange matching | NO-GO | Redis discovery can falsely return a safe count during failure (#165) |
| Tenant/principal-owned Arena and Offline Sync evidence | NO-GO for multi-tenant/reputation authority | Database ownership constraints are incomplete (#155) |
| Full production migration/recovery claim | NO-GO | Lock timeout, upgrade, interruption, restore and forward-fix evidence remain |

## 8. Required next actions

1. Remediate #165 before enabling production Exchange matching.
2. Implement #166 as a bounded migration-authority program rather than renaming files ad hoc.
3. Make the exact schema examples in #155 part of the first isolation inventory and adversarial PostgreSQL harness.
4. Add behavior-level tests for ownership constraints and append-only triggers.
5. Introduce production migration readiness distinct from database connectivity.
6. Record statement/lock/transaction timeout policy by workload.
7. Reconcile stale migration documentation and deployment instructions.
8. Re-run this batch against the final remediation heads and record the new schema fingerprint.

## 9. Residual risk and conclusion

Batch 02 semantic review is complete for the assigned snapshot, but the database/persistence program is **not production-complete**. The current platform has meaningful transaction, checksum, migration and schema controls; however, migration execution remains too coupled to runtime requests, ownership constraints are not consistently tenant/principal-composite, and Redis failure can defeat a financial safety guard.

The final repository audit must retain **NO-GO** for unrestricted real-money, multi-node matching and full multi-tenant claims until #165, #166 and the relevant scope of #155 are merged and independently verified on exact heads.
