# TecPey — Database Migrations

## Current State (Phase 20)

Schema is managed via **schema-on-connect**: `db-schema.ts` runs
`CREATE TABLE IF NOT EXISTS` on every cold start. This is the existing
pattern, preserved here for safety.

`0001_initial_schema.sql` is a **reference snapshot only** — it is not
executed by a runner. It documents what the schema-on-connect code creates.

## Migration Numbering

```
0001_initial_schema.sql       ← current state (schema-on-connect equivalent)
0002_<description>.sql        ← next new change
0003_<description>.sql
...
```

File names: `NNNN_snake_case_description.sql` where `NNNN` is zero-padded to 4 digits.

## Rules

1. **Never modify a committed migration.** Once pushed to main, a migration
   file is immutable. If you need to fix a mistake, write a new migration.

2. **Every migration must be idempotent.** Use `CREATE TABLE IF NOT EXISTS`,
   `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.

3. **Every migration must have a rollback.** Document `-- ROLLBACK:` at the
   bottom of the file.

4. **Never DROP a column or table in production without a deprecation period.**
   First migration: rename column to `_deprecated_<name>`. Second migration
   (next release): drop it.

5. **All future schema changes go here**, not into `db-schema.ts`. The
   schema-on-connect pattern will be retired in Phase 22 when the migration
   runner is wired up.

## Phase 22 Migration Runner Plan

```
src/lib/db-migrate.ts         ← runner: reads migrations/, applies in order,
                                 tracks applied migrations in _migrations table
_migrations table             ← { id, filename, applied_at, checksum }
```

The runner will:
1. Create `_migrations` table if missing.
2. Read all `.sql` files from `migrations/` in order.
3. Skip any file whose `checksum` already exists in `_migrations`.
4. Execute new files in a transaction.
5. Record the checksum on success.

Rollback: re-run the previous known-good migration set. No auto-rollback
is applied; rollbacks are manual SQL executed by an operator.
