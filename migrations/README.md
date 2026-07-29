# TecPey database migration authority

## Production boundary

Production requests, pages, actions, workers, health probes, and module imports
never create or alter schema. They may verify that required schema exists and
must fail closed when it does not.

The only canonical production migration action is:

```bash
npm run db:migrate
```

The accountable role is the **TecPey Database Migration Operator**. That role
runs the command as an approved maintenance identity before application
startup, verifies the reported plan hash and `schema: current`, and retains the
release and database evidence for the deployment record.

## Canonical registry and checksums

`src/lib/db-migration-registry.ts` is the sole ordered execution authority. Each
step has a contiguous sequence, stable identity, dependency, owner, domain, and
full SHA-256 checksum derived from normalized SQL content. New canonical
expected checksums are always 64 lowercase hexadecimal characters.

The historical `_migrations` ledger and its applied checksums are immutable.
Legacy rows using the former 16-character SHA-256 format remain accepted only
when the exact historical checksum derived by the former whitespace-normalized
algorithm is explicitly listed for that migration. Historical 64-character
rows are likewise accepted only when their exact value is explicitly governed.
They are not inferred from the current checksum. The runner never rewrites
historical ledger checksums to normalize their width; all newly applied rows use
the current full SHA-256 content checksum.

`migrations/0001_initial_schema.sql` is retained as a historical/reference
artifact. Executable canonical content is identified by the registry and the
registered TypeScript migration runners; operators must not infer execution
order from filesystem or filename sorting.

## Change and recovery policy

- Never edit an applied migration or its ledger evidence.
- Append a new governed migration and intentionally update the pinned plan
  fingerprint.
- Never use fake down migrations or delete ledger history.
- Reversible operational failures use the same release and idempotent rerun.
- Irreversible schema changes require a forward-fix migration or a verified
  database restore from an approved backup.
- A failed, interrupted, stale, mismatched, or incomplete plan remains out of
  readiness until explicit recovery returns the schema to `current`.

Backup/restore drills, RPO/RTO proof, and cross-release recovery exercises are
owned by GitHub Issue #110. Container, Compose, service-manager, and deployment
orchestration hardening is owned by GitHub Issue #163. Those issues do not
authorize bypassing this migration/readiness contract.
