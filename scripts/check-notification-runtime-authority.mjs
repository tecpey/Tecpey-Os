import { readFile } from "node:fs/promises";

const files = {
  plan: "src/lib/db-migration-plan.ts",
  runtimeMigration: "src/lib/db-migrate-notification-runtime.ts",
  visibilityMigration: "src/lib/db-migrate-notification-delivery-visibility.ts",
  creation: "src/lib/notifications/creation.ts",
  outbox: "src/lib/notifications/outbox.ts",
  repository: "src/lib/notifications/repository.ts",
  worker: "scripts/run-notification-in-app-worker.ts",
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

requireText("plan", "runNotificationRuntimeMigrations", "canonical migration plan must run notification runtime migration");
requireText("plan", "runNotificationDeliveryVisibilityMigrations", "canonical migration plan must run delivery visibility migration");

requireText("runtimeMigration", "CREATE TABLE IF NOT EXISTS notification_intents", "immutable intent ledger is required");
requireText("runtimeMigration", "notification_intents_no_update", "intent updates must be blocked");
requireText("runtimeMigration", "notification_intents_no_delete", "intent deletes must be blocked");
requireText("runtimeMigration", "ON DELETE RESTRICT", "audit foreign keys must preserve evidence");
requireText("runtimeMigration", "lease_expires_at", "outbox leases are required");
requireText("runtimeMigration", "notification_delivery_attempts", "delivery attempt evidence is required");
requireText("runtimeMigration", "notification_dead_letters", "terminal failures require a DLQ");
requireText("runtimeMigration", "delivered_at TIMESTAMPTZ", "inbox visibility must have explicit delivery evidence");

requireText("visibilityMigration", "NEW.status = 'provider_accepted'", "only accepted outbox transitions may publish in-app notifications");
requireText("visibilityMigration", "delivered_at = COALESCE", "accepted delivery must stamp notification visibility");
requireText("visibilityMigration", "notification_outbox_publish_in_app", "delivery visibility trigger is required");

requireText("creation", "PILOT_NOTIFICATION_CLASSES", "pilot classes must be explicitly allowlisted");
requireText("creation", 'channel: "in_app" as const', "Phase 2 creation must remain in-app only");
requireText("creation", 'audienceScope: "principal" as const', "Phase 2 creation must remain single-principal only");
requireText("creation", 'dispatchMode: "event" as const', "campaign and broadcast creation must remain disabled");
requireText("creation", "evaluateNotificationPolicy", "every creation must pass deterministic policy");
requireText("creation", "pg_advisory_xact_lock", "correlation replay must be serialized");
requireText("creation", "notification_correlation_payload_conflict", "changed payloads may not reuse correlation keys");
requireText("creation", "INSERT INTO platform_notifications", "allowed decisions must create the durable inbox record");
requireText("creation", "INSERT INTO notification_outbox", "allowed decisions must create the delivery outbox atomically");
requireText("creation", "INSERT INTO notification_intents", "every policy decision must be recorded immutably");
requireText("creation", "policy_snapshot", "policy facts must be auditable");
rejectText("creation", "web_push", "external channels must not be enabled in the Phase 2 creation service");
rejectText("creation", "mobile_push", "external channels must not be enabled in the Phase 2 creation service");
rejectText("creation", "marketing_campaign", "marketing campaign creation must remain outside the pilot service");

requireText("outbox", "FOR UPDATE OF o SKIP LOCKED", "outbox claims must support concurrent workers safely");
requireText("outbox", "lease_expires_at > NOW()", "completion must require a live lease");
requireText("outbox", "locked_by = $2", "completion must match the claiming worker");
requireText("outbox", "attempt_count = $3", "completion must match the claimed attempt");
requireText("outbox", "worker_lease_expired", "stale leases must be recoverable");
requireText("outbox", "failed_retryable", "retryable failures must be explicit");
requireText("outbox", "failed_terminal", "terminal failures must be explicit");
requireText("outbox", "insertDeadLetter", "terminal outcomes must create DLQ evidence");
requireText("outbox", "notification_outbox_lease_lost", "stale workers must fail closed");
requireText("outbox", "getNotificationOutboxReconciliation", "operations require reconciliation evidence");

requireText("repository", "delivered_at IS NOT NULL", "inbox and lifecycle mutations must require accepted delivery evidence");
requireText("repository", "deliveredAt", "API projection must expose delivery time");

requireText("worker", "processInAppNotificationBatch", "standalone worker must use the governed outbox runtime");
requireText("worker", "SIGTERM", "worker must support graceful shutdown");
requireText("worker", "getNotificationOutboxReconciliation", "worker must emit periodic reconciliation");

if (failures.length) {
  console.error("Notification runtime authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Notification runtime authority check passed: policy creation, immutable intent, leased in-app delivery, retry, DLQ and delivered-only inbox visibility are enforced.");
