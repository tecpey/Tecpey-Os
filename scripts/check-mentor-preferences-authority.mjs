import { readFile } from "node:fs/promises";

const files = {
  route: "src/app/api/mentor-preferences/route.ts",
  store: "src/lib/ai/mentor-trust-store.ts",
  audit: "src/lib/security/sensitive-mutation-audit.ts",
  tests: "src/tests/security/ai-mentor-trust-store-postgres.test.ts",
  inventory: "docs/security/MENTOR_PREFERENCES_EVIDENCE_INVENTORY.md",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

const failures = [];
const requireText = (target, text, reason) => {
  if (!source[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};
const rejectText = (target, text, reason) => {
  if (source[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};

for (const invariant of [
  "getCanonicalSession(req, { strictRevocation: true })",
  "verifyCsrfOrigin(req)",
  "readBoundedJsonRequest(req, { maxBytes: 2_048 })",
  "setMentorAiPreferences({",
  "fingerprintMentorPreferenceStudent",
  "resolveSensitiveAuditCorrelation",
  "hashSensitiveAuditRequest",
  // multi-tenant #20: mentor_ai_preferences is student_global, so the boundary
  // must resolve the acting tenant (confirming the binding and refusing a
  // foreign branded host), gate the Mentor product, act on the bound principal,
  // and stamp the consent audit with the resolved tenant — never the platform
  // default, which recorded every white-label student's consent under 'tecpey'.
  "resolveTenantPrincipalContext({",
  'requireTenantProduct(tenantContext.tenantId, "mentor")',
  "studentId: tenantContext.principalId",
  "tenantId: tenantContext.tenantId",
  // Consent revocation must stay reachable when the tenant is not entitled to
  // Mentor: the Mentor execution path reads this saved consent, so the write's
  // product gate applies only to a request that ENABLES external-provider use or
  // behavioral personalization. A pure opt-out is always admitted (#438 review).
  "if (body.externalProviderEnabled || body.behavioralPersonalizationEnabled) {",
]) {
  requireText("route", invariant, `route boundary missing ${invariant}`);
}
for (const forbidden of [
  "writeAudit(",
  "getClientIp",
  "user-agent",
  "INSERT INTO mentor_ai_preferences",
  "UPDATE mentor_ai_preferences",
  "body.studentId",
  "body.actorId",
  "body.tenantId",
  "body.realExchangeSignalsEnabled",
  // The consent audit tenant must be the resolved acting tenant, not the
  // hard-coded platform default that pinned every tenant's consent to 'tecpey'.
  "PLATFORM.DEFAULT_TENANT_ID",
]) {
  rejectText("route", forbidden, `route reintroduced forbidden authority: ${forbidden}`);
}

for (const invariant of [
  'import { withDb, withTx } from "@/lib/db"',
  "pg_advisory_xact_lock",
  "FOR UPDATE",
  "existing.external_provider_enabled === input.externalProviderEnabled",
  "existing.behavioral_personalization_enabled ===",
  "existing.real_exchange_signals_enabled === false",
  "return {\n          changed: false",
  "writeSensitiveMutationAuditTx(client",
  'action: "mentor.preferences.update"',
  'resourceType: "mentor_ai_preferences"',
  "tecpey-mentor-preference-student-v1\\0",
  "realExchangeSignalsEnabled: false",
  "| { available: false; preferences: null }",
  "preferenceLoad?.available === true",
  "preferenceLoad.preferences.externalProviderEnabled",
  ": { available: false, preferences: null }",
  "return { available: false, preferences: null }",
]) {
  requireText("store", invariant, `transaction authority missing ${invariant}`);
}
rejectText("store", "writeAudit(", "legacy audit cannot satisfy Mentor consent evidence");
requireText(
  "store",
  'if (audit.actorType !== "student")',
  "consent audit actor must be the server-resolved student",
);

requireText("audit", "mentor.preferences.update", "typed Mentor preference action is missing");
requireText("audit", "mentor_ai_preferences", "typed Mentor preference resource is missing");

for (const proof of [
  "keeps behavioral personalization default-off and commits changed consent with secret-free evidence",
  "keeps identical preference requests as no-ops without timestamp or evidence churn",
  "rolls back preference state when mandatory evidence conflicts",
  "serializes concurrent identical preference updates into one mutation",
]) {
  requireText("tests", proof, `missing PostgreSQL proof: ${proof}`);
}

for (const contract of [
  "preference state is upserted through standalone `withDb`",
  "identical requests churn consent timestamps",
  "real-exchange signals remain false",
]) {
  requireText("inventory", contract, `inventory contract missing: ${contract}`);
}

if (failures.length) {
  console.error("Mentor preference authority guard failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Mentor preference authority guard passed: consent state, no-op semantics and mandatory evidence are transactionally owned by the Mentor trust store.",
);
