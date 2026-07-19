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
requireText("migration", "UNIQUE (tenant_id, id)", "principal identity must expose a tenant-bound composite key");
requireText("migration", "platform_principals_account_unique_idx", "account identity must be unique per tenant");
requireText("migration", "platform_principals_student_unique_idx", "student identity must be unique per tenant");
requireText("migration", "CREATE TABLE IF NOT EXISTS platform_notifications", "durable inbox table is required");
requireText("migration", "FOREIGN KEY (tenant_id, principal_id)", "notification ownership must be tenant-bound at the database layer");
requireText("migration", "REFERENCES platform_principals(tenant_id, id) ON DELETE CASCADE", "notification tenant and principal identities must reference the same principal row");
requireText("migration", "UNIQUE (tenant_id, principal_id, correlation_key)", "visible notification dedupe must be database-enforced");
requireText("migration", "CREATE TABLE IF NOT EXISTS notification_outbox", "transactional delivery outbox boundary is required");
requireText("migration", "event_sequence BIGSERIAL NOT NULL UNIQUE", "consent history requires deterministic append ordering");
requireText("migration", "UNIQUE (principal_id, purpose, idempotency_key)", "consent retries must be idempotent per principal and purpose");
requireText("migration", "idempotency_key TEXT NOT NULL", "consent evidence must carry an idempotency key");
requireText("migration", "notification_consents_no_update", "consent history must be append-only");
requireText("migration", "notification_consents_no_delete", "consent history deletion must be blocked");
requireText("migration", "OR (enabled = TRUE AND cadence = 'instant')", "mandatory notification classes must remain enabled and instant at the database layer");
requireText("migration", "CHECK (quiet_start IS NULL OR quiet_start <> quiet_end)", "ambiguous equal quiet-hour boundaries must be rejected");

requireText("principal", "getUnifiedSessionFromRequest", "principal identity must come from verified unified sessions");
requireText("principal", "pg_advisory_xact_lock", "concurrent principal linking must be serialized");
requireText("principal", "notification_principal_identity_conflict", "conflicting identities must fail closed");

rejectText("inboxRoute", "fallbackNotifications", "inbox must never fabricate notifications on auth/database failure");
requireText("inboxRoute", 'apiError("authentication_required", 401)', "unauthenticated inbox access must be denied");
requireText("inboxRoute", "resolveNotificationPrincipal", "inbox ownership must use canonical principal resolution");
requireText("inboxRoute", 'apiError("notification_inbox_unavailable", 503)', "database failure must be explicit rather than fabricated success");

requireText("mutationRoute", "resolveNotificationPrincipal", "notification mutations must resolve the canonical authenticated principal");
requireText("mutationRoute", "mutateInboxNotification", "notification mutations must delegate to the principal-scoped repository boundary");
requireText("mutationRoute", "verifyCsrfOrigin", "notification lifecycle mutations must enforce same-origin CSRF protection");
requireText("preferenceRoute", "verifyCsrfOrigin", "notification preference mutations must enforce same-origin CSRF protection");
requireText("consentRoute", "verifyCsrfOrigin", "notification consent mutations must enforce same-origin CSRF protection");
requireText("repository", "AND tenant_id = $2", "mutation SQL must enforce tenant ownership");
requireText("repository", "AND principal_id = $3", "mutation SQL must enforce principal ownership");
requireText("repository", "[notificationId, principal.tenantId, principal.id]", "mutation parameters must bind the resolved tenant and principal identities");
requireText("repository", "ON CONFLICT (tenant_id, principal_id, correlation_key) DO NOTHING", "legacy migration must be idempotent");
requireText("repository", "dismissed_at IS NULL", "dismissed notifications must be excluded from inbox projection");
rejectText("repository", "export async function upsertNotificationPreference", "preference writes must have one authoritative implementation");
rejectText("repository", "validNotificationPreferenceInput", "preference parsing must not be duplicated in the inbox repository");

requireText("preferences", "mandatory_notification_class_cannot_be_disabled", "mandatory notification classes must not be silently disabled");
requireText("preferences", "mandatory_notification_class_requires_instant_delivery", "mandatory notification classes must not be downgraded to digest");
requireText("preferences", "validConsentIdempotencyKey", "consent idempotency keys must be validated");
requireText("preferences", "ON CONFLICT (principal_id, purpose, idempotency_key) DO NOTHING", "consent retries must replay existing evidence rather than append duplicates");
requireText("preferences", "notification_consent_idempotency_conflict", "changed consent payloads may not reuse an idempotency key");
requireText("preferences", "ORDER BY purpose, event_sequence DESC", "current consent projection must use deterministic append order");
requireText("preferences", 'MARKETING_CONSENT_POLICY_VERSION = "marketing-v1"', "consent policy version must be server-owned");
requireText("preferences", 'NOTIFICATION_CONSENT_SOURCE = "notification-preference-center"', "consent source must be server-owned");
requireText("preferenceRoute", "exactly_one_preferences_operation_required", "preference mutations must be unambiguous");
requireText("preferenceRoute", "mandatory_notification_class_requires_instant_delivery", "preference API must expose mandatory cadence conflicts explicitly");
requireText("consentRoute", "recordNotificationConsent", "consent changes must append evidence rather than overwrite state");
requireText("consentRoute", 'req.headers.get("idempotency-key")', "consent writes must require a request idempotency key");
requireText("consentRoute", "validConsentIdempotencyKey", "consent route must validate idempotency evidence");
requireText("consentRoute", "MARKETING_CONSENT_POLICY_VERSION", "consent endpoint must apply the server-owned policy version");
requireText("consentRoute", "NOTIFICATION_CONSENT_SOURCE", "consent endpoint must apply the server-owned source");
rejectText("consentRoute", "raw.policyVersion", "client-controlled consent policy versions are forbidden");
rejectText("consentRoute", "raw.source", "client-controlled consent sources are forbidden");
requireText("consentRoute", 'apiError("authentication_required", 401)', "consent endpoints must require authentication");

if (failures.length) {
  console.error("Notification persistence authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Notification persistence authority check passed: durable principal, tenant-bound inbox, mandatory cadence, idempotent server-owned consent, CSRF and single preference authority are enforced.");
