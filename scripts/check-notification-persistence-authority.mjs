import { readFile } from "node:fs/promises";

const files = {
  migrationPlan: "src/lib/db-migration-plan.ts",
  migration: "src/lib/db-migrate-notifications.ts",
  principal: "src/lib/notifications/principal.ts",
  repository: "src/lib/notifications/repository.ts",
  preferences: "src/lib/notifications/preferences.ts",
  inboxRoute: "src/app/api/notifications/route.ts",
  mutationRoute: "src/app/api/notifications/[id]/route.ts",
  preferenceRoute: "src/app/api/notifications/preferences/route.ts",
  consentRoute: "src/app/api/notifications/consent/route.ts",
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

requireText("migrationPlan", 'import { runNotificationMigrations }', "canonical plan must import notification migrations");
requireText("migrationPlan", "await runNotificationMigrations(client);", "canonical plan must execute notification migrations");
requireText("migration", "CREATE TABLE IF NOT EXISTS platform_principals", "tenant-scoped principal registry is required");
requireText("migration", "platform_principals_account_unique_idx", "account identity must be unique per tenant");
requireText("migration", "platform_principals_student_unique_idx", "student identity must be unique per tenant");
requireText("migration", "CREATE TABLE IF NOT EXISTS platform_notifications", "durable inbox table is required");
requireText("migration", "UNIQUE (tenant_id, principal_id, correlation_key)", "visible notification dedupe must be database-enforced");
requireText("migration", "CREATE TABLE IF NOT EXISTS notification_outbox", "transactional delivery outbox boundary is required");
requireText("migration", "notification_consents_no_update", "consent history must be append-only");
requireText("migration", "notification_consents_no_delete", "consent history deletion must be blocked");

requireText("principal", "getUnifiedSessionFromRequest", "principal identity must come from verified unified sessions");
requireText("principal", "pg_advisory_xact_lock", "concurrent principal linking must be serialized");
requireText("principal", "notification_principal_identity_conflict", "conflicting identities must fail closed");

rejectText("inboxRoute", "fallbackNotifications", "inbox must never fabricate notifications on auth/database failure");
requireText("inboxRoute", 'apiError("authentication_required", 401)', "unauthenticated inbox access must be denied");
requireText("inboxRoute", "resolveNotificationPrincipal", "inbox ownership must use canonical principal resolution");
requireText("inboxRoute", 'apiError("notification_inbox_unavailable", 503)', "database failure must be explicit rather than fabricated success");

requireText("mutationRoute", "resolveNotificationPrincipal", "notification mutations must resolve the canonical authenticated principal");
requireText("mutationRoute", "mutateInboxNotification", "notification mutations must delegate to the principal-scoped repository boundary");
requireText("repository", "AND tenant_id = $2", "mutation SQL must enforce tenant ownership");
requireText("repository", "AND principal_id = $3", "mutation SQL must enforce principal ownership");
requireText("repository", "[notificationId, principal.tenantId, principal.id]", "mutation parameters must bind the resolved tenant and principal identities");
requireText("repository", "ON CONFLICT (tenant_id, principal_id, correlation_key) DO NOTHING", "legacy migration must be idempotent");
requireText("repository", "dismissed_at IS NULL", "dismissed notifications must be excluded from inbox projection");

requireText("preferences", "mandatory_notification_class_cannot_be_disabled", "mandatory notification classes must not be silently disabled");
requireText("preferenceRoute", "exactly_one_preferences_operation_required", "preference mutations must be unambiguous");
requireText("consentRoute", "recordNotificationConsent", "consent changes must append evidence rather than overwrite state");
requireText("consentRoute", 'apiError("authentication_required", 401)', "consent endpoints must require authentication");

if (failures.length) {
  console.error("Notification persistence authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Notification persistence authority check passed: durable principal, inbox, consent and ownership boundaries are enforced.");
