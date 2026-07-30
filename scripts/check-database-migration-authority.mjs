import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const db = read("src/lib/db.ts");
const plan = read("src/lib/db-migration-plan.ts");
const registry = read("src/lib/db-migration-registry.ts");
const content = read("src/lib/db-migration-content.ts");
const governance = read("src/lib/db-migration-governance.ts");
const readiness = read("src/lib/db-migration-readiness.ts");
const cli = read("scripts/run-database-migrations.ts");
const server = read("server.ts");
const health = read("src/app/api/health/route.ts");
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

rejectText(db, "applyDatabaseMigrations", "application database access must never execute migrations");
requireText(db, "checkMigrationReadiness(client)", "application database access must verify schema readiness");
requireText(server, "assertDatabaseReadyForRuntime()", "production startup must verify schema before listening");
requireText(server, "if (!dev)", "production schema verification must be a startup gate");
for (const directImport of [
  'from "./db-migrate"',
  'from "./db-migrate-compat"',
  'from "./db-migrate-user-state"',
  'from "./db-migrate-admin-control-plane"',
  'from "./db-migrate-admin-control-plane-hardening"',
  'from "./db-migrate-notifications"',
  'from "./db-migrate-notification-runtime"',
  'from "./db-migrate-notification-delivery-visibility"',
  'from "./db-migrate-offline-sync"',
  'from "./db-migrate-notification-domain-outbox"',
  'from "./db-migrate-crm-leads"',
  'from "./db-migrate-crm-leads-hardening"',
  'from "./db-migrate-academy-progress-hardening"',
  'from "./db-migrate-exchange-order-admission"',
  'from "./db-migrate-withdrawal-admission"',
  'from "./db-migrate-withdrawal-settlement"',
  'from "./db-migrate-api-command-idempotency"',
  'from "./db-migrate-sensitive-mutation-audit"',
]) {
  rejectText(db, directImport, `db.ts must not own migration ordering: ${directImport}`);
}

requireText(registry, "DATABASE_MIGRATION_REGISTRY", "one canonical migration registry is required");
requireText(registry, "validateMigrationRegistry", "registry duplicate and dependency validation is required");
requireText(registry, "DATABASE_MIGRATION_PLAN_HASH", "registry must expose a deterministic plan hash");
const migrationSources = fs.readdirSync("src/lib")
  .filter((filename) => /^db-migrate(?:-.+)?\.ts$/.test(filename))
  .map((filename) => read(`src/lib/${filename}`))
  .join("\n");
rejectText(
  migrationSources,
  ".slice(0, 16)",
  "new migration applications must persist full SHA-256 checksums",
);
const sourceFilenames = new Set(migrationSources.match(/\b\d{4}_[a-z0-9_]+\.sql\b/g) ?? []);
const registryFilenames = new Set(content.match(/\b\d{4}_[a-z0-9_]+\.sql\b/g) ?? []);
for (const filename of sourceFilenames) {
  if (!registryFilenames.has(filename)) failures.push(`migration source is not registered: ${filename}`);
}
for (const filename of registryFilenames) {
  if (!sourceFilenames.has(filename)) failures.push(`registry references no migration source: ${filename}`);
}
requireText(plan, "pg_try_advisory_lock($1, $2)", "migration runners must use bounded advisory lock acquisition");
requireText(plan, "migration_lock_timeout", "migration lock timeout must be explicit and observable");
requireText(plan, "_migration_runtime_state", "migration execution state must be durable");
requireText(readiness, '"migration_running"', "readiness must distinguish a running migration");
requireText(readiness, '"migration_failed"', "readiness must distinguish a failed migration");
requireText(readiness, '"outdated"', "readiness must distinguish an outdated schema");
requireText(health, "db.schema?.status", "health must expose schema readiness separately from connectivity");
requireText(registry, "migrationEntryChecksum", "registry entries must bind canonical content checksums");
requireText(registry, "owner", "registry entries must identify an accountable owner");
requireText(registry, "domain", "registry entries must identify a domain");
requireText(governance, "PINNED_DATABASE_MIGRATION_PLAN_HASH", "CI must pin the governed migration plan hash");

const runtimeDdlPattern = /\b(?:CREATE\s+(?:TABLE|INDEX|SCHEMA|TYPE)|ALTER\s+TABLE|DROP\s+(?:TABLE|COLUMN|SCHEMA)|RENAME\s+(?:TABLE|COLUMN))\b/i;
const runtimeSourceFiles = [];
const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== "tests") visit(path);
    } else if (
      /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) &&
      !/^db-migrate(?:-.+)?\.ts$/.test(entry.name) &&
      entry.name !== "db-migration-plan.ts"
    ) {
      runtimeSourceFiles.push(path);
    }
  }
};
visit("src");
for (const path of runtimeSourceFiles) {
  const source = read(path);
  if (runtimeDdlPattern.test(source)) failures.push(`runtime source contains schema DDL: ${path}`);
  if (/\bapplyDatabaseMigrations(?:WithLock)?\s*\(/.test(source)) {
    failures.push(`runtime source invokes the migration executor: ${path}`);
  }
}

requireText(cli, "applyDatabaseMigrationsWithLock", "db:migrate must execute the canonical migration plan");
requireText(cli, "DATABASE_URL", "db:migrate must require an explicit database URL");
requireText(pkg, '"db:migrate": "tsx scripts/run-database-migrations.ts"', "package.json must expose db:migrate");
rejectText(pkg, '"start:next"', "package scripts must not expose a direct production next start bypass");

requireText(workflow, "image: postgres:16-alpine", "CI must start a real PostgreSQL service");
requireText(workflow, "POSTGRES_DB: ci_contract", "CI PostgreSQL must create the configured clean database");
const migrationRuns = workflow.match(/npm run db:migrate/g)?.length ?? 0;
if (migrationRuns < 2) failures.push("CI must run db:migrate twice to prove idempotent reruns");

requireText(integration, "applyDatabaseMigrationsWithLock", "migration integration test must execute the canonical plan");
requireText(
  integration,
  'const isolated = governedDatabaseName("contract", suffix)',
  "migration contract checksum tests must create an isolated database",
);
requireText(
  integration,
  "connectionString: databaseConnectionUrl(isolated)",
  "migration contract checksum tests must execute only against their isolated database",
);
requireText(
  integration,
  "await dropIsolatedDatabase(admin, isolated)",
  "migration contract cleanup must prove every isolated session was released",
);
requireText(
  integration,
  "SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname = $1",
  "migration integration cleanup must observe isolated database sessions",
);
rejectText(
  integration,
  "connectionString: databaseUrl,",
  "migration integration tests must not mutate the shared service database",
);
rejectText(
  integration,
  "DROP DATABASE IF EXISTS ${isolated} WITH (FORCE)",
  "migration integration cleanup must not kill live clients",
);
for (const migration of [
  "0023_offline_sync_command_authority.sql",
  "0024_notification_domain_outbox.sql",
  "0025_crm_lead_authority.sql",
  "0026_crm_lead_hardening.sql",
  "0027_academy_progress_authority_v2.sql",
  "0027_exchange_order_admission_authority.sql",
  "0030_withdrawal_admission_authority.sql",
  "0031_withdrawal_settlement_authority.sql",
  "0032_api_command_idempotency.sql",
  "0033_sensitive_mutation_audit.sql",
]) {
  requireText(integration, migration, `migration integration must verify ${migration}`);
}
for (const table of [
  "offline_sync_commands",
  "notification_domain_outbox",
  "notification_domain_dead_letters",
  "crm_leads",
  "crm_lead_commands",
  "crm_lead_delivery_outbox",
  "crm_lead_audit_events",
  "academy_progress_legacy_reward_quarantine",
  "exchange_order_commands",
  "exchange_order_command_attempts",
  "api_command_receipts",
  "sensitive_mutation_audit_events",
]) {
  requireText(integration, table, `migration integration must verify ${table}`);
}
for (const trigger of [
  "admin_audit_events_validate_chain",
  "withdrawals_verify_price_evidence",
  "notification_domain_outbox_identity_no_update",
  "academy_leads_legacy_read_only",
  "crm_leads_no_delete",
  "crm_lead_commands_no_update",
  "crm_lead_audit_no_update",
  "academy_lesson_progress_read_only",
  "academy_term_learning_progress_read_only",
  "academy_reward_ledger_reject_client_section",
  "academy_progress_legacy_reward_quarantine_no_update",
  "exchange_order_commands_identity_no_update",
  "exchange_order_commands_no_delete",
  "exchange_order_command_attempts_no_update",
  "api_command_receipts_guard",
  "sensitive_mutation_audit_validate",
  "sensitive_mutation_audit_no_update",
  "sensitive_mutation_audit_no_delete",
]) {
  requireText(integration, trigger, `migration integration must verify ${trigger}`);
}
requireText(integration, "crm_leads_legal_basis_consent_check", "migration integration must verify CRM consent/legal-basis integrity");
requireText(integration, "exchange_order_commands_claim_idx", "migration integration must verify recoverable order command claims");
requireText(integration, "uq_wallet_ledger_withdrawal_phase", "migration integration must verify wallet ledger idempotency schema");
requireText(integration, "api_command_receipts_retention_idx", "migration integration must verify command receipt retention");
requireText(integration, "sensitive_mutation_audit_actor_idx", "migration integration must verify sensitive audit actor queries");

if (failures.length) {
  console.error("Database migration authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Database migration authority check passed.");
