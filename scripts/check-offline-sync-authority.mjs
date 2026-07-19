import { readFile } from "node:fs/promises";

const files = {
  plan: "src/lib/db-migration-plan.ts",
  migration: "src/lib/db-migrate-offline-sync.ts",
  contract: "src/lib/offline-sync.ts",
  service: "src/lib/offline-sync-server.ts",
  route: "src/app/api/offline-sync/route.ts",
  manager: "src/components/offline/OfflineSyncManager.tsx",
  tests: "src/tests/offline-sync-authority-postgres.test.ts",
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

requireText("plan", "runOfflineSyncMigrations", "canonical migration plan must include offline command authority");
requireText("plan", "await runOfflineSyncMigrations(client)", "offline migration must execute in canonical order");
requireText("migration", "CREATE TABLE IF NOT EXISTS offline_sync_commands", "durable command ledger is required");
requireText("migration", "UNIQUE (student_id, client_event_id)", "client commands must be unique per student");
requireText("migration", "UNIQUE (learning_event_id)", "one command may create only one learning event");
requireText("migration", "REFERENCES learning_events(event_id) ON DELETE RESTRICT", "command evidence must retain its committed learning event");
requireText("migration", "offline_sync_commands_no_update", "offline command evidence must be immutable");
requireText("migration", "CHECK (payload_hash ~ '^[a-f0-9]{64}$')", "command payload hashes must be database validated");

requireText("contract", "CLIENT_EVENT_ID_RE", "offline events require a bounded stable identity");
requireText("contract", "invalid_event_id", "missing or malformed event identity must fail closed");
requireText("contract", "invalid_client_timestamp", "client timestamps must be bounded and validated");
requireText("contract", "new TextEncoder().encode", "payload size validation must remain browser compatible");
requireText("contract", "server_event_only", "server-owned achievements may not be queued by clients");
rejectText("contract", "cryptoSafeId", "server normalization may not fabricate event identity");
rejectText("contract", "Math.random", "offline command identity may not use weak randomness");
rejectText("contract", ".slice(0, 1200)", "payload JSON may not be truncated into invalid or changed evidence");

requireText("service", "offlineSyncPayloadHash", "commands require canonical payload hashing");
requireText("service", "pg_advisory_xact_lock", "concurrent retries must serialize by student and event ID");
requireText("service", "idempotency_conflict", "changed payload reuse must fail closed");
requireText("service", "INSERT INTO learning_events", "accepted commands must create durable learning evidence");
requireText("service", "INSERT INTO offline_sync_commands", "accepted commands must record immutable command evidence");
requireText("service", "refreshLearningBrain", "newly committed events must refresh the server projection");
requireText("service", "replayed: true", "identical retries must return explicit replay evidence");

requireText("route", "strictRevocation: true", "offline sync requires a strict active Academy session");
requireText("route", "withTx", "command and learning event writes must share one transaction");
requireText("route", "offline_sync_storage_unavailable", "durable storage outage must return explicit retryable failure");
requireText("route", "retryable: true", "clients must know an unavailable batch remains retryable");
requireText("route", "private, no-store", "user synchronization responses must never be publicly cached");
rejectText("route", "appendFile", "production sync may not write local JSONL fallback");
rejectText("route", "writeLocal", "production sync may not acknowledge process-local fallback");
rejectText("route", "accepted: normalized", "uncommitted normalized items may not be reported accepted");

requireText("manager", "crypto.randomUUID", "client command IDs must use secure browser randomness");
requireText("manager", "crypto.getRandomValues", "secure UUID fallback is required");
requireText("manager", "normalizeOfflineSyncItem", "client queue and server must share one contract");
requireText("manager", "if (!response.ok)", "non-2xx storage failure must keep the retry queue");
rejectText("manager", "Math.random", "client command identity may not use weak randomness");

requireText("tests", "concurrent identical offline commands", "PostgreSQL evidence must cover concurrent replay");
requireText("tests", "idempotency_conflict", "tests must cover changed payload reuse");
requireText("tests", "offline command evidence is immutable", "tests must prove append-only command evidence");
requireText("tests", "invalid_event_id", "tests must reject unstable client identity");

if (failures.length) {
  console.error("Offline synchronization authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Offline synchronization authority check passed: stable client identity, bounded payloads, strict sessions, transactional exactly-once learning evidence, immutable command replay and retryable outage semantics are enforced.");
