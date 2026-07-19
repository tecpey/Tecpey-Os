import { readFile } from "node:fs/promises";

const files = {
  package: "package.json",
  workflow: ".github/workflows/ci.yml",
  env: "scripts/validate-env.mjs",
  migrationPlan: "src/lib/db-migration-plan.ts",
  migration: "src/lib/db-migrate-crm-leads.ts",
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
requireText("env", "TECPEY_CRM_PII_KEY_B64", "production must require a dedicated encryption key");
requireText("env", "TECPEY_CRM_CONTACT_HASH_SECRET", "production must require a distinct lookup hash key");
requireText("env", "TECPEY_TRUSTED_PROXY_HEADER", "production must explicitly configure trusted proxy extraction");

requireText("migrationPlan", "runCrmLeadMigrations", "canonical migrations must include CRM lead authority");
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

requireText("pii", 'createCipheriv("aes-256-gcm"', "PII must use authenticated field-level encryption");
requireText("pii", "setAAD", "encrypted PII must be bound to tenant and lead identity");
requireText("pii", "createHmac", "lookup hashes must be keyed rather than plain SHA hashes");
requireText("pii", "normalizeLeadPhone", "phone deduplication needs canonical normalization");
rejectText("pii", "logger", "PII protection module must not log plaintext");

requireText("input", "privacy_consent_required", "public ingestion must require explicit consent evidence");
requireText("input", "idempotency_key_required", "public ingestion must require stable command identity");
requireText("input", "MAX", "input must be length bounded");
requireText("authority", "pg_advisory_xact_lock", "concurrent idempotency and contact submissions must serialize");
requireText("authority", "crm_lead_commands", "retries must replay durable command results");
requireText("authority", "idempotency_conflict", "changed command reuse must fail closed");
requireText("authority", "crm_lead_delivery_outbox", "downstream delivery must use a durable outbox");
requireText("authority", "FOR UPDATE SKIP LOCKED", "workers must use bounded concurrent claims");
requireText("authority", "decryptLeadPii", "only the delivery boundary may recover protected PII");
requireText("authority", "crm_storage_unavailable", "database outage must fail closed");
requireText("rights", "exportCrmLeadData", "audited data export capability is required");
requireText("rights", "deleteCrmLeadData", "audited data deletion capability is required");
requireText("retention", "deleteExpiredCrmLeadPii", "bounded retention deletion runner is required");

requireText("trustedIp", "TECPEY_TRUSTED_PROXY_HEADER", "forwarded headers must require explicit trust configuration");
requireText("trustedIp", "TECPEY_TRUSTED_PROXY_HOPS", "forwarded chains require a trusted hop contract");
for (const route of ["genericRoute", "specializedRoute"]) {
  requireText(route, "getTrustedClientIp", "route must not trust arbitrary forwarded headers");
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

if (failures.length) {
  console.error("CRM lead authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("CRM lead authority check passed: encrypted PostgreSQL PII, legacy migration/redaction, idempotent commands, contact dedupe, trusted proxy identity, consent evidence, durable delivery, audit, export/deletion and retention controls are enforced.");
