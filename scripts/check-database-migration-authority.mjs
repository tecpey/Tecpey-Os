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

const orderedCalls = [
  "await runMigrations(client)",
  "await runCompatibilityMigrations(client)",
  "await runUserStateMigrations(client)",
  "await runAdminControlPlaneMigrations(client)",
  "await runAdminControlPlaneHardeningMigrations(client)",
  "await runNotificationMigrations(client)",
  "await runNotificationRuntimeMigrations(client)",
  "await runNotificationDeliveryVisibilityMigrations(client)",
  "await runOfflineSyncMigrations(client)",
  "await runNotificationDomainOutboxMigrations(client)",
  "await runCrmLeadMigrations(client)",
  "await runCrmLeadHardeningMigrations(client)",
  "await runAcademyProgressHardeningMigrations(client)",
  "await runExchangeOrderAdmissionMigrations(client)",
  "await runWithdrawalAdmissionMigrations(client)",
  "await runWithdrawalSettlementMigrations(client)",
  "await runApiCommandIdempotencyMigrations(client)",
  "await runSensitiveMutationAuditMigrations(client)",
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
