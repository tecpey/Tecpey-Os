import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const db = read("src/lib/db.ts");
const plan = read("src/lib/db-migration-plan.ts");
const cli = read("scripts/run-database-migrations.ts");
const pkg = read("package.json");
const workflow = read(".github/workflows/ci.yml");
const integration = read("src/tests/database/migration-integration.test.ts");

const failures = [];
const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const rejectText = (source, text, message) => {
  if (source.includes(text)) failures.push(message);
};

requireText(db, 'from "./db-migration-plan"', "application database access must use the canonical migration plan");
requireText(db, "applyDatabaseMigrationsWithLock(client)", "startup migration compatibility must use the advisory-locked plan");
for (const directImport of [
  'from "./db-migrate"',
  'from "./db-migrate-compat"',
  'from "./db-migrate-user-state"',
  'from "./db-migrate-admin-control-plane"',
  'from "./db-migrate-admin-control-plane-hardening"',
]) rejectText(db, directImport, `db.ts must not own migration ordering: ${directImport}`);

const orderedCalls = [
  "await runMigrations(client)",
  "await runCompatibilityMigrations(client)",
  "await runUserStateMigrations(client)",
  "await runAdminControlPlaneMigrations(client)",
  "await runAdminControlPlaneHardeningMigrations(client)",
];
let previousIndex = -1;
for (const call of orderedCalls) {
  const index = plan.indexOf(call);
  if (index < 0 || index <= previousIndex) {
    failures.push(`canonical migration order is missing or invalid: ${call}`);
  }
  previousIndex = index;
}
requireText(plan, "pg_advisory_lock(hashtext($1))", "migration runners must acquire a PostgreSQL advisory lock");
requireText(plan, "pg_advisory_unlock(hashtext($1))", "migration runners must release the PostgreSQL advisory lock");

requireText(cli, "applyDatabaseMigrationsWithLock", "db:migrate must execute the canonical migration plan");
requireText(cli, "DATABASE_URL", "db:migrate must require an explicit database URL");
requireText(pkg, '"db:migrate": "tsx scripts/run-database-migrations.ts"', "package.json must expose db:migrate");

requireText(workflow, "image: postgres:16-alpine", "CI must start a real PostgreSQL service");
requireText(workflow, "POSTGRES_DB: ci_placeholder", "CI PostgreSQL must create the configured clean database");
const migrationRuns = workflow.match(/npm run db:migrate/g)?.length ?? 0;
if (migrationRuns < 2) failures.push("CI must run db:migrate twice to prove idempotent reruns");

requireText(integration, "applyDatabaseMigrationsWithLock", "migration integration test must execute the canonical plan");
requireText(integration, "admin_audit_events_validate_chain", "migration integration test must verify critical database triggers");
requireText(integration, "uq_wallet_ledger_withdrawal_phase", "migration integration test must verify wallet ledger idempotency schema");

if (failures.length) {
  console.error("Database migration authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Database migration authority check passed.");
