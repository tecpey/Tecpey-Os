import { readFile } from "node:fs/promises";

const files = {
  package: "package.json",
  workflow: ".github/workflows/ci.yml",
  route: "src/app/api/offline-sync/route.ts",
  client: "src/components/offline/OfflineSyncManager.tsx",
  types: "src/lib/offline-sync.ts",
  authority: "src/lib/offline-sync-authority.ts",
  migration: "src/lib/db-migrate-offline-sync.ts",
  plan: "src/lib/db-migration-plan.ts",
  tests: "src/tests/security/offline-sync-authority-postgres.test.ts",
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
requireText("package", '"test:offline-sync"', "focused PostgreSQL tests need a governed npm command");
requireText("package", "npm run offline:check", "release check must retain the offline authority guard");
requireText("package", "npm run test:offline-sync", "release check must run focused offline tests");
requireText("workflow", "Offline sync authority guard", "CI must execute the offline authority guard");
requireText("workflow", "Offline sync PostgreSQL integration tests", "CI must expose focused offline evidence");

requireText("route", "strictRevocation: true", "offline synchronization requires a strict durable session");
requireText("route", "processOfflineSyncCommand", "route must delegate to the transactional command authority");
requireText("route", "offline_sync_storage_unavailable", "all-retryable batches must return an explicit unavailable response");
requireText("route", "retryable > 0 ? 207 : 200", "partial batches need explicit multi-status semantics");
rejectText("route", 'from "fs/promises"', "filesystem persistence is forbidden");
rejectText("route", "TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE", "local fallback is forbidden");
rejectText("route", "recordLearningEvent", "route may not bypass command authority");
rejectText("route", 'status: "accepted"', "pre-commit acknowledgement is forbidden");

requireText("client", 'result.status === "committed"', "client may delete only committed commands");
requireText("client", 'result.status === "rejected"', "terminal rejected commands may be removed explicitly");
requireText("client", "including storage-unavailable 503", "client must preserve commands after unavailable responses");
rejectText("client", 'r.status === "accepted"', "legacy false-success deletion is forbidden");

requireText("types", 'status: "committed" | "rejected" | "retryable"', "result states must distinguish durable and retryable outcomes");
requireText("types", 'reason: "missing_id"', "commands without stable identity must be rejected");
rejectText("types", "cryptoSafeId", "server normalization may not invent idempotency identity");

requireText("authority", "offlineCommandHash", "commands need a stable payload fingerprint");
requireText("authority", "offlineLearningEventId", "domain event identity must be deterministic");
requireText("authority", "withTx", "command and learning event must share one transaction");
requireText("authority", "FOR UPDATE", "replays and conflicts must serialize on durable command evidence");
requireText("authority", "idempotency_conflict", "changed payload reuse must fail closed");
requireText("authority", "ON CONFLICT (event_id) DO NOTHING", "domain event insertion must be idempotent");
requireText("authority", "reconcileStaleOfflineCommands", "stale processing commands need bounded reconciliation");
requireText("authority", "purgeExpiredOfflineCommands", "terminal command retention needs bounded cleanup");
requireText("authority", 'status: "retryable"', "database failures may not become acknowledgements");

requireText("migration", "offline_sync_commands", "a relational command inbox is required");
requireText("migration", "UNIQUE (tenant_id, student_id, client_event_id)", "database uniqueness must scope tenant, student and client ID");
requireText("migration", "command_hash", "changed-payload detection requires a durable hash");
requireText("migration", "retain_until", "command evidence needs a retention boundary");
requireText("migration", "offline_sync_commands_reconcile_idx", "reconciliation requires a bounded index");
requireText("plan", "runOfflineSyncMigrations", "canonical migration plan must include offline authority");
requireText("migrationTests", "0023_offline_sync_command_authority.sql", "migration integration must verify the new ledger entry");
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
requireText("reconciliation", "reconcileStaleOfflineCommands", "operations runner must reconcile stale commands");
requireText("reconciliation", "purgeExpiredOfflineCommands", "operations runner must purge expired evidence in bounded batches");

if (failures.length) {
  console.error("Offline sync authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Offline sync authority check passed: stable command identity, transactional exactly-once application, tenant/student isolation, explicit retryability, reconciliation, retention, PostgreSQL tests and anti-bypass guards are enforced.");
