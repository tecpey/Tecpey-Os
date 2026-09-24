import {
  DATABASE_MIGRATION_PLAN_HASH,
  validateMigrationRegistry,
} from "../src/lib/db-migration-registry";

validateMigrationRegistry();
process.stdout.write(`${DATABASE_MIGRATION_PLAN_HASH}\n`);
