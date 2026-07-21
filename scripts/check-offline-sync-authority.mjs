import { readFile } from "node:fs/promises";

const files = {
  package: "package.json",
  workflow: ".github/workflows/ci.yml",
  env: "scripts/validate-env.mjs",
  browserGuard: "scripts/check-browser-persistence.mjs",
  route: "src/app/api/offline-sync/route.ts",
  client: "src/components/offline/OfflineSyncManager.tsx",
  types: "src/lib/offline-sync.ts",
  scope: "src/lib/offline-sync-scope.ts",
  authority: "src/lib/offline-sync-authority.ts",
  migration: "src/lib/db-migrate-offline-sync.ts",
  isolationMigration: "src/lib/db-migrate-tenant-principal-isolation.ts",
  plan: "src/lib/db-migration-plan.ts",
  tests: "src/tests/security/offline-sync-authority-postgres.test.ts",
  scopeTests: "src/tests/security/offline-sync-scope.test.ts",
  telemetryTests: "src/tests/security/offline-sync-telemetry-source-guard.test.ts",
  telemetryInventory: "docs/security/OFFLINE_SYNC_TELEMETRY_CLASSIFICATION.md",
  migrationTests: "src/tests/database/migration-integration.test.ts",
  reconciliation: "scripts/reconcile-offline-sync-commands.ts",
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

for (const invariant of [
  '"offline:check"',
  '"test:offline-sync"',
  '"offline:reconcile"',
  "npm run offline:check",
  "npm run test:offline-sync",
  "check-tenant-principal-isolation.mjs",
  "tenant-principal-context-postgres.test.ts",
]) {
  requireText("package", invariant, `package gate is missing ${invariant}`);
}
for (const invariant of [
  "TECPEY_OFFLINE_SYNC_SECRET",
  "Offline sync authority guard",
  "Offline sync PostgreSQL integration tests",
  "npm run test:offline-sync",
]) {
  requireText("workflow", invariant, `CI is missing ${invariant}`);
}

requireText("env", "TECPEY_OFFLINE_SYNC_SECRET", "production must require the offline scope secret");
requireText("env", "signingSecretNames", "offline secret must participate in secret isolation");
requireText("browserGuard", 'classification: "repairable-offline-projection"', "browser queue must remain a repairable projection");
requireText("browserGuard", "expected: 1", "exactly one browser storage boundary must remain audited");

for (const invariant of [
  "strictRevocation: true",
  "resolveTenantPrincipalContext({",
  'requiredPrincipalType: "student"',
  'scopes: ["offline-sync:write"]',
  "issueOfflineSyncScope",
  "verifyOfflineSyncScope",
  "scope.scope.tenantId !== context.tenantId",
  "scope.scope.studentId !== context.principalId",
  "principal_scope_mismatch",
  "processOfflineSyncCommand",
  "context,\n            item: normalized.item",
  "offline_sync_storage_unavailable",
  "retryable > 0 ? 207 : 200",
  'response.headers.set("Cache-Control", "no-store, private")',
  'logger.info("[offline-sync] batch processed"',
  "tecpey:offline-sync-${domain}:v1\\0",
]) {
  requireText("route", invariant, `route is missing ${invariant}`);
}
for (const forbidden of [
  "resolvePlatformContext",
  "tenantId: platform.tenantId",
  "studentId: session.studentId",
  'from "fs/promises"',
  "TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE",
  "recordLearningEvent",
  'status: "accepted"',
  "writeAudit(",
  "getClientIp",
  "user-agent",
]) {
  rejectText("route", forbidden, `route contains forbidden authority ${forbidden}`);
}

const telemetryStart = content.route.indexOf('logger.info("[offline-sync] batch processed"');
const telemetryEnd = telemetryStart < 0 ? -1 : content.route.indexOf("});", telemetryStart);
const telemetryBlock =
  telemetryStart >= 0 && telemetryEnd > telemetryStart
    ? content.route.slice(telemetryStart, telemetryEnd + 3)
    : "";
for (const forbidden of ["studentId:", "tenantId:", "scopeToken", "results", "payload", "input"]) {
  if (telemetryBlock.includes(forbidden)) {
    failures.push(`${files.route}: telemetry block contains forbidden raw field ${forbidden}`);
  }
}

for (const invariant of [
  'const STORAGE_KEY = "tecpey_offline_queue_v2"',
  "scopeToken: string",
  "transportStorage",
  "never authoritative",
  "refreshPrincipalScope",
  "scopeRefreshInFlight",
  "queueOfflineEvent",
  "enqueueScopedItem(baseItem, freshScope)",
  "setScopeRequired(true)",
  'result.status === "committed"',
  'result.status === "rejected"',
  "LEGACY_QUARANTINE_KEY",
  "quarantineLegacyQueue",
]) {
  requireText("client", invariant, `client transport is missing ${invariant}`);
}
rejectText("client", "window.localStorage.", "direct browser storage calls are forbidden");
rejectText("client", 'r.status === "accepted"', "false-success deletion is forbidden");

for (const invariant of [
  'status: "committed" | "rejected" | "retryable"',
  'reason: "missing_id"',
  "MAX_PAYLOAD_BYTES",
]) {
  requireText("types", invariant, `offline types are missing ${invariant}`);
}
rejectText("types", "cryptoSafeId", "server may not invent idempotency identity");

for (const invariant of [
  "TECPEY_OFFLINE_SYNC_SECRET",
  "createHmac",
  "timingSafeEqual",
  "tenantId",
  "studentId",
  "expiresAt",
  'status: "expired"',
]) {
  requireText("scope", invariant, `signed scope is missing ${invariant}`);
}
rejectText("scope", "TECPEY_SESSION_SECRET", "offline scope may not reuse session authority");

for (const invariant of [
  "export type OfflineSyncAuthorityContext",
  "context: AvailableTenantPrincipalContext",
  'context.principalType !== "student"',
  'context.scopes.includes("offline-sync:write")',
  "const tenantId = context.tenantId",
  "const studentId = context.principalId",
  "offlineCommandHash",
  "offlineLearningEventId",
  "withTx",
  "pg_advisory_xact_lock",
  "FOR UPDATE",
  "idempotency_conflict",
  "ON CONFLICT (event_id) DO NOTHING",
  "reconcileStaleOfflineCommands",
  "purgeExpiredOfflineCommands",
]) {
  requireText("authority", invariant, `authority is missing ${invariant}`);
}
rejectText(
  "authority",
  "tenantId: string;\n  studentId: string;\n  item: OfflineSyncItem",
  "mutation authority cannot accept independent tenant/student IDs",
);

for (const invariant of [
  "offline_sync_commands_principal_binding_fk",
  "learning_events_principal_binding_fk",
  "platform_principal_bindings",
  "workspace-primary must belong to tenant tecpey",
]) {
  requireText("isolationMigration", invariant, `isolation migration is missing ${invariant}`);
}
requireText("plan", "runOfflineSyncMigrations", "migration plan must retain Offline Sync migration");
requireText("plan", "runTenantPrincipalIsolationMigrations", "migration plan must execute binding migration");

for (const evidence of [
  "concurrent duplicate delivery",
  "changed payload reuse",
  "isolates the same client event identity across tenant and principal contexts",
  "rejects a cross-tenant command row at the composite foreign key",
  "learning-event application fails",
  "rejects invalid authority context before PostgreSQL mutation",
]) {
  requireText("tests", evidence, `missing adversarial evidence: ${evidence}`);
}
for (const evidence of [
  "verifies the exact signed tenant and student scope",
  "rejects tampering and cross-principal substitution",
  "rejects expired principal scope",
  "does not acknowledge mismatched principal commands",
  "quarantines legacy unscoped commands",
]) {
  requireText("scopeTests", evidence, `missing scope evidence: ${evidence}`);
}
requireText("telemetryTests", "passes the permanent Offline Sync authority", "focused suite must execute source guard");
requireText("telemetryInventory", "batch summary is operational telemetry only", "telemetry classification is missing");
requireText("reconciliation", "reconcileStaleOfflineCommands", "operations must reconcile stale commands");
requireText("reconciliation", "purgeExpiredOfflineCommands", "operations must purge expired evidence");

if (failures.length) {
  console.error("Offline sync authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Offline sync authority check passed: canonical tenant/principal binding, signed scope, one audited transport-only browser queue, transactional exactly-once application, privacy-safe telemetry, database-enforced isolation and repair operations are enforced.",
);
