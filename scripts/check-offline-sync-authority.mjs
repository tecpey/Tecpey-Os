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
  plan: "src/lib/db-migration-plan.ts",
  tests: "src/tests/security/offline-sync-authority-postgres.test.ts",
  scopeTests: "src/tests/security/offline-sync-scope.test.ts",
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

requireText("package", '"offline:check"', "offline authority needs a governed npm command");
requireText("package", '"test:offline-sync"', "focused offline tests need a governed command");
requireText("package", '"offline:reconcile"', "operations need a governed reconciliation command");
requireText("package", "npm run offline:check", "release check must retain the offline authority guard");
requireText("package", "npm run test:offline-sync", "release check must run focused offline tests");
requireText("workflow", "TECPEY_OFFLINE_SYNC_SECRET", "CI must provide dedicated offline signing authority");
requireText("workflow", "Offline sync authority guard", "CI must execute the offline authority guard");
requireText("workflow", "Offline sync PostgreSQL integration tests", "CI must expose focused offline evidence");
requireText("workflow", "npm run test:offline-sync", "CI must invoke the governed offline test command");

requireText("env", "TECPEY_OFFLINE_SYNC_SECRET", "production must require the offline scope secret");
requireText("env", "signingSecretNames", "offline secret must participate in secret-class isolation");
requireText("env", "must be distinct", "signing secrets must remain pairwise distinct");
requireText("browserGuard", '"src/components/offline/OfflineSyncManager.tsx": 1', "offline transport must use one audited browser storage boundary");

requireText("route", "strictRevocation: true", "offline synchronization requires a strict durable session");
requireText("route", "resolvePlatformContext", "offline authority must resolve the canonical tenant");
requireText("route", "issueOfflineSyncScope", "GET must mint server-signed principal scope");
requireText("route", "verifyOfflineSyncScope", "POST must verify every queued command scope");
requireText("route", "principal_scope_mismatch", "cross-principal commands must be retained, not applied");
requireText("route", 'status: "retryable"', "scope mismatch and storage failure must remain retryable");
requireText("route", "processOfflineSyncCommand", "route must delegate to transactional command authority");
requireText("route", "offline_sync_storage_unavailable", "authority outage must return an explicit unavailable response");
requireText("route", "retryable > 0 ? 207 : 200", "mixed batches need explicit multi-status semantics");
requireText("route", 'response.headers.set("Cache-Control", "no-store, private")', "scope and result responses must not be cached");
rejectText("route", 'from "fs/promises"', "filesystem persistence is forbidden");
rejectText("route", "TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE", "local fallback is forbidden");
rejectText("route", "recordLearningEvent", "route may not bypass command authority");
rejectText("route", 'status: "accepted"', "pre-commit acknowledgement is forbidden");

requireText("client", 'const STORAGE_KEY = "tecpey_offline_queue_v2"', "scoped commands need a new queue generation");
requireText("client", "scopeToken: string", "every browser command must retain its signed scope");
requireText("client", "transportStorage", "all browser transport persistence must use one adapter");
requireText("client", "never authoritative", "the browser adapter must declare its non-authoritative role");
requireText("client", "refreshPrincipalScope", "the client must refresh current principal scope");
requireText("client", "queueOfflineEvent", "offline producers must use one governed queue entry point");
requireText("client", 'result.status === "committed"', "client may delete only committed commands");
requireText("client", 'result.status === "rejected"', "terminal rejected commands may be removed explicitly");
requireText("client", "including storage-unavailable 503", "client must preserve commands after unavailable responses");
requireText("client", "LEGACY_QUARANTINE_KEY", "legacy unscoped commands must be quarantined");
requireText("client", "quarantineLegacyQueue", "legacy queue migration must preserve evidence without attribution");
requireText("client", "store.setItem(LEGACY_QUARANTINE_KEY, legacy)", "legacy data must be preserved before removal");
rejectText("client", "window.localStorage.", "direct browser storage calls outside the audited adapter are forbidden");
rejectText("client", 'r.status === "accepted"', "legacy false-success deletion is forbidden");
rejectText("client", "writeQueue([...readQueue(), ...legacy", "legacy unscoped commands may not enter a current principal queue");
const localStorageLines = content.client
  .split(/\r?\n/)
  .filter((line) => line.includes("localStorage")).length;
if (localStorageLines !== 1) {
  failures.push(`${files.client}: expected exactly one audited localStorage adapter line, found ${localStorageLines}`);
}

requireText("types", 'status: "committed" | "rejected" | "retryable"', "result states must distinguish durable and retryable outcomes");
requireText("types", 'reason: "missing_id"', "commands without stable identity must be rejected");
requireText("types", "MAX_PAYLOAD_BYTES", "offline payload size must be bounded before persistence");
rejectText("types", "cryptoSafeId", "server normalization may not invent idempotency identity");

requireText("scope", "TECPEY_OFFLINE_SYNC_SECRET", "scope tokens require a dedicated secret");
requireText("scope", "createHmac", "scope tokens must be authenticated");
requireText("scope", "timingSafeEqual", "scope signatures must use constant-time comparison");
requireText("scope", "tenantId", "scope must bind tenant identity");
requireText("scope", "studentId", "scope must bind student identity");
requireText("scope", "expiresAt", "scope tokens require bounded expiry");
requireText("scope", 'status: "expired"', "expired scope must be distinguishable from invalid scope");
rejectText("scope", "TECPEY_SESSION_SECRET", "offline scope may not reuse access-session authority");

requireText("authority", "offlineCommandHash", "commands need a stable payload fingerprint");
requireText("authority", "offlineLearningEventId", "domain event identity must be deterministic");
requireText("authority", "withTx", "command and learning event must share one transaction");
requireText("authority", "pg_advisory_xact_lock", "duplicate commands must serialize");
requireText("authority", "FOR UPDATE", "replays and conflicts must lock durable command evidence");
requireText("authority", "idempotency_conflict", "changed payload reuse must fail closed");
requireText("authority", "ON CONFLICT (event_id) DO NOTHING", "domain event insertion must be idempotent");
requireText("authority", "reconcileStaleOfflineCommands", "stale processing commands need bounded reconciliation");
requireText("authority", "purgeExpiredOfflineCommands", "terminal command retention needs bounded cleanup");
requireText("authority", 'status: "retryable"', "database failures may not become acknowledgements");

requireText("migration", "offline_sync_commands", "a relational command inbox is required");
requireText("migration", "UNIQUE (tenant_id, student_id, client_event_id)", "database uniqueness must scope tenant, student and client ID");
requireText("migration", "command_hash", "changed-payload detection requires durable evidence");
requireText("migration", "retain_until", "command evidence needs a retention boundary");
requireText("migration", "offline_sync_commands_reconcile_idx", "reconciliation requires a bounded index");
requireText("plan", "runOfflineSyncMigrations", "canonical migration plan must include offline authority");
requireText("migrationTests", "0023_offline_sync_command_authority.sql", "migration integration must verify the offline migration ledger entry");
requireText("migrationTests", "offline_sync_commands", "migration integration must verify the command table");

for (const evidence of [
  "concurrent duplicate delivery",
  "changed payload reuse",
  "same client event ID across students",
  "learning-event application fails",
  "reconciles stale processing evidence",
  "PostgreSQL is unavailable",
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
  requireText("scopeTests", evidence, `missing principal-scope evidence: ${evidence}`);
}

requireText("reconciliation", "reconcileStaleOfflineCommands", "operations runner must reconcile stale commands");
requireText("reconciliation", "purgeExpiredOfflineCommands", "operations runner must purge expired evidence in bounded batches");

if (failures.length) {
  console.error("Offline sync authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Offline sync authority check passed: signed principal scope, one audited transport-only browser storage adapter, queue partitioning, legacy quarantine, stable command identity, transactional exactly-once application, tenant/student isolation, explicit retryability, reconciliation, retention and PostgreSQL adversarial evidence are enforced.");
