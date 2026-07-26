# Database migration and runtime readiness contract

## Authority boundary

`npm run db:migrate` is the only production schema-execution entry point. Web
requests, transactions, health checks, and production server startup are
verify-only and never execute DDL.

The ordered registry in `src/lib/db-migration-registry.ts` assigns every legacy
migration identity to one unique, contiguous execution step with an owner,
domain, dependency, and full SHA-256 checksum derived from normalized SQL
content. CI pins the complete plan fingerprint and rejects missing, duplicate,
reordered, changed, or unregistered identities. Runtime readiness compares the
release expectations with immutable ledger and execution-sequence evidence.

## Lock and execution state

The explicit runner uses a fixed two-key PostgreSQL advisory lock and bounded
`pg_try_advisory_lock` polling. The default wait is 30 seconds; operators may set
`TECPEY_MIGRATION_LOCK_TIMEOUT_MS` from 100 through 300000 milliseconds.
Timeout is a failure, never permission to continue without the lock.

`_migration_runtime_state` contains one durable row with:

- `running`: a lock-owning runner has started the current plan;
- `current`: the plan hash and complete ledger digest were verified;
- `failed`: the runner failed and recorded bounded diagnostic evidence.

The state includes the runner UUID and timestamps. It contains no credentials or
raw environment data.

## Deployment sequence

1. Deploy the exact release artifact without routing traffic to it.
2. Run `npm run db:migrate` once as the approved maintenance identity.
3. Require the command to report `schema: current` and exit zero.
4. Start the production server. Startup independently verifies the current plan
   and ledger before Next.js prepares or the HTTP server listens.
5. Require `/api/health` to return HTTP 200 with database `ok` and schema
   `current` before adding the instance to service.

Multiple migration commands may start concurrently, but they serialize on the
bounded lock. Multiple web processes perform only the same read-only readiness
verification.

## Deterministic recovery

After a failed or interrupted migration:

1. Keep the release out of service; readiness remains non-200.
2. Inspect the bounded `error_code`, runner ID, timestamps, and migration logs.
3. Correct infrastructure or ship a forward-fix migration. Never edit an applied
   migration or its ledger checksum. There are no fake down migrations.
4. Re-run the same exact release's `npm run db:migrate`. Transactional migration
   steps roll back on failure; already-applied steps verify checksums and skip.
5. Require the state to transition to `current` with the release plan hash and a
   complete ledger digest.
6. Restart the application and verify readiness before routing traffic.

An unexplained ledger entry, missing migration, checksum drift, plan mismatch,
lock timeout, or state-write/lock-release failure is an incident and remains
fail-closed. Recovery never deletes ledger history or bypasses readiness.

The accountable operator is the **TecPey Database Migration Operator**.
Irreversible changes require a forward-fix or verified database restore.
Backup/restore drills, RPO/RTO, and cross-release recovery evidence belong to
Issue #110. Container and deployment-orchestration hardening belongs to Issue
#163.
