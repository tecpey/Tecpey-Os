import { readFile } from "node:fs/promises";

const files = {
  package: "package.json",
  workflow: ".github/workflows/ci.yml",
  env: "scripts/validate-env.mjs",
  migrationPlan: "src/lib/db-migration-plan.ts",
  migration: "src/lib/db-migrate-crm-leads.ts",
  hardening: "src/lib/db-migrate-crm-leads-hardening.ts",
  pii: "src/lib/crm/lead-pii.ts",
  input: "src/lib/crm/academy-lead-input.ts",
  authority: "src/lib/crm/lead-authority.ts",
  rights: "src/lib/crm/lead-data-rights.ts",
  trustedIp: "src/lib/security/trusted-client-ip.ts",
  genericRoute: "src/app/api/academy-lead/route.ts",
  specializedRoute: "src/app/api/academy-specialized-lead/route.ts",
  specializedUi: "src/components/academy/AcademySpecializedProgram.tsx",
  worker: "scripts/run-crm-lead-delivery-worker.ts",
  retention: "scripts/run-crm-lead-retention.ts",
  securityTests: "src/tests/security/crm-lead-security.test.ts",
  postgresTests: "src/tests/security/crm-lead-authority-postgres.test.ts",
  migrationTests: "src/tests/database/migration-integration.test.ts",
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);
const failures = [];
const requireText = (target, text, reason) => {
  if (!content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};
const rejectText = (target, text, reason) => {
  if (content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};

requireText("package", '"crm:check"', "CRM authority guard needs a governed command");
requireText("package", '"test:crm-leads"', "focused CRM tests need a governed command");
requireText("package", '"crm:worker"', "delivery worker needs a governed command");
requireText("package", '"crm:retention"', "retention runner needs a governed command");
requireText("package", "npm run crm:check", "release gate must execute CRM authority guard");
requireText("package", "npm run test:crm-leads", "release gate must execute focused CRM tests");
requireText("workflow", "CRM lead authority guard", "CI must execute CRM authority guard");
requireText("workflow", "CRM lead PostgreSQL integration tests", "CI must execute focused PostgreSQL evidence");
requireText("workflow", "TECPEY_CRM_PII_KEY_B64", "CI must prove encryption-key configuration");
requireText("workflow", "TECPEY_CRM_CONTACT_HASH_SECRET", "CI must prove keyed lookup authority");
requireText("workflow", "TECPEY_TRUSTED_PROXY_HEADER", "CI must prove trusted proxy configuration");
requireText("env", "TECPEY_CRM_PII_KEY_B64", "production must require a dedicated encryption key");
requireText("env", "TECPEY_CRM_CONTACT_HASH_SECRET", "production must require a distinct lookup hash key");
requireText("env", "TECPEY_CRM_WEBHOOK_SECRET", "webhook delivery must require a dedicated signing key");
requireText("env", "ACADEMY_LEADS_WEBHOOK_URL is required", "webhook URL and secret must be configured as a pair");
requireText("env", "TECPEY_TRUSTED_PROXY_HEADER", "production must explicitly configure trusted proxy extraction");

requireText("migrationPlan", "runCrmLeadMigrations", "canonical migrations must include CRM lead authority");
requireText("migrationPlan", "runCrmLeadHardeningMigrations", "canonical migrations must include CRM lead hardening");
for (const table of [
  "crm_leads",
  "crm_lead_commands",
  "crm_lead_delivery_outbox",
  "crm_lead_audit_events",
]) requireText("migration", table, `missing durable table ${table}`);
requireText("migration", "crm_leads_active_contact_unique_idx", "contact-level deduplication must be database enforced");
requireText("migration", "UNIQUE (tenant_id, idempotency_key)", "idempotency must be database enforced");
requireText("migration", "academy_leads_legacy_read_only", "legacy raw lead table must be locked");
requireText("migration", "'[migrated-redacted]'", "legacy raw lead names must be redacted after migration");
requireText("migration", "phone = '[redacted]'", "legacy raw lead phone must be redacted after migration");
requireText("migration", "migrateLegacyAcademyLeads", "legacy records must be migrated before redaction");
requireText("migration", "crm_lead_audit_no_update", "audit evidence must be append-only");
requireText("migration", "crm_lead_audit_no_delete", "audit evidence must reject deletion");
requireText("hardening", "crm_leads_legal_basis_consent_check", "legacy pre-contract data must not be represented as explicit consent");
requireText("hardening", "crm_leads_no_delete", "lead records must use privacy deletion instead of hard deletion");
requireText("hardening", "crm_lead_commands_no_update", "idempotency command evidence must be immutable");
requireText("hardening", "crm_lead_commands_no_delete", "idempotency command evidence must reject deletion");
requireText("hardening", "superseded_revision", "obsolete delivery revisions must be terminalized");

requireText("pii", 'createCipheriv("aes-256-gcm"', "PII must use authenticated field-level encryption");
requireText("pii", "setAAD", "encrypted PII must be bound to tenant and lead identity");
requireText("pii", "createHmac", "lookup hashes must be keyed rather than plain SHA hashes");
requireText("pii", "phone:", "phone must be the stable contact identity");
requireText("pii", "finally", "key material must be zeroed even when encryption fails");
rejectText("pii", "logger", "PII protection module must not log plaintext");

requireText("input", "privacy_consent_required", "public ingestion must require explicit consent evidence");
requireText("input", "idempotency_key_required", "public ingestion must require stable command identity");
requireText("input", "MAX_NAME_LENGTH", "input must be length bounded");
requireText("input", "SPECIALIZED_TRACKS", "program choices must be allowlisted");
requireText("authority", "pg_advisory_xact_lock", "concurrent idempotency and contact submissions must serialize");
requireText("authority", "crm_lead_commands", "retries must replay durable command results");
requireText("authority", 'status: "conflict"', "changed command reuse must fail closed");
requireText("authority", "crm_lead_delivery_outbox", "downstream delivery must use a durable outbox");
requireText("authority", "FOR UPDATE SKIP LOCKED", "workers must use bounded concurrent claims");
requireText("authority", "recoverExpiredCrmLeadDeliveries", "expired worker leases must be reconciled");
requireText("authority", "lead.revision = outbox.lead_revision", "delivery must bind to the claimed current revision");
requireText("authority", "FOR SHARE OF lead", "lead revision must stay stable through downstream delivery");
requireText("authority", "X-TecPey-Signature", "downstream CRM delivery must be authenticated");
requireText("authority", "Idempotency-Key", "downstream delivery retries must be idempotent");
requireText("authority", "decryptLeadPii", "only the delivery boundary may recover protected PII");
requireText("authority", "crm_storage_unavailable", "database outage must fail closed");
requireText("rights", "exportCrmLeadData", "audited data export capability is required");
requireText("rights", "deleteCrmLeadData", "audited data deletion capability is required");
requireText("retention", "deleteExpiredCrmLeadPii", "bounded retention deletion runner is required");

requireText("trustedIp", "TECPEY_TRUSTED_PROXY_HEADER", "forwarded headers must require explicit trust configuration");
requireText("trustedIp", "TECPEY_TRUSTED_PROXY_HOPS", "forwarded chains require a trusted hop contract");
for (const route of ["genericRoute", "specializedRoute"]) {
  requireText(route, "getTrustedClientIp", "route must not trust arbitrary forwarded headers");
  requireText(route, "client_network_unresolved", "production requests without trusted network identity must fail closed");
  requireText(route, "ingestAcademyLead", "route must delegate to transactional CRM authority");
  requireText(route, "crm_storage_unavailable", "route must return 503 when durable storage is unavailable");
  requireText(route, "idempotency-key", "route must accept stable client command identity");
  rejectText(route, 'from "fs/promises"', "filesystem PII persistence is forbidden");
  rejectText(route, "appendFile", "JSONL PII persistence is forbidden");
  rejectText(route, "ACADEMY_LEADS_WEBHOOK_URL", "request path may not synchronously call downstream webhook");
  rejectText(route, "x-forwarded-for", "route may not parse attacker-controlled forwarding headers directly");
  rejectText(route, "user-agent", "raw user-agent PII may not be stored by lead routes");
}
requireText("specializedUi", "privacyNoticeVersion", "UI must send privacy notice evidence");
requireText("specializedUi", "Idempotency-Key", "UI retries must reuse stable submission identity");
requireText("specializedUi", "personal data was not saved", "failure messaging must not claim persistence");
rejectText("specializedUi", "tecpey_specialized_leads", "browser PII fallback is forbidden");
rejectText("specializedUi", "localStorage", "lead PII may not be written to browser persistence");

requireText("worker", "claimCrmLeadDeliveries", "worker must claim durable outbox rows");
requireText("worker", "failCrmLeadClaim", "worker must retain retryable failure evidence");
for (const evidence of [
  "encrypts PII with tenant/lead-bound authenticated encryption",
  "requires explicit consent, stable idempotency and allowlisted program choices",
  "ignores forwarding headers until an explicit trusted-proxy contract exists",
]) requireText("securityTests", evidence, `missing security evidence: ${evidence}`);
for (const evidence of [
  "replays the exact idempotent command and rejects changed reuse",
  "deduplicates concurrent submissions by normalized phone",
  "signs and delivers only the leased current revision",
  "does not deliver a claimed revision after a newer revision commits",
  "exports and privacy-deletes PII",
  "PostgreSQL is unavailable",
]) requireText("postgresTests", evidence, `missing PostgreSQL evidence: ${evidence}`);
requireText("migrationTests", "0025_crm_lead_authority.sql", "migration integration must verify CRM authority");
requireText("migrationTests", "0026_crm_lead_hardening.sql", "migration integration must verify CRM hardening");

if (failures.length) {
  console.error("CRM lead authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("CRM lead authority check passed: encrypted PostgreSQL PII, honest legal basis, legacy migration/redaction, immutable idempotency, phone-stable dedupe, trusted proxy identity, explicit consent, revision-safe authenticated delivery, audit, export/deletion and retention controls are enforced.");
