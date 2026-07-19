import { readFile } from "node:fs/promises";

const files = {
  migrationPlan: "src/lib/db-migration-plan.ts",
  migration: "src/lib/db-migrate-notifications.ts",
  principal: "src/lib/notifications/principal.ts",
  repository: "src/lib/notifications/repository.ts",
  preferences: "src/lib/notifications/preferences.ts",
  http: "src/lib/notifications/http.ts",
  notificationCenter: "src/components/learning-os/NotificationCenter.tsx",
  persianNotificationPage: "src/app/academy/notifications/page.tsx",
  englishNotificationPage: "src/app/en/academy/notifications/page.tsx",
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

requireText("http", '"Cache-Control": "private, no-store, max-age=0, must-revalidate"', "notification responses must not be cached by browsers or intermediaries");
requireText("http", 'Vary: "Cookie"', "session-varying notification responses must declare Cookie variance");
requireText("http", "notificationApiOk", "private success response helper is required");
requireText("http", "notificationApiError", "private error response helper is required");

rejectText("inboxRoute", "fallbackNotifications", "inbox must never fabricate notifications on auth/database failure");
requireText("inboxRoute", 'notificationApiError("authentication_required", 401)', "unauthenticated inbox access must be denied");
requireText("inboxRoute", "resolveNotificationPrincipal", "inbox ownership must use canonical principal resolution");
requireText("inboxRoute", 'notificationApiError("notification_inbox_unavailable", 503)', "database failure must be explicit rather than fabricated success");
requireText("inboxRoute", 'dynamic = "force-dynamic"', "inbox route must remain dynamically evaluated");

requireText("mutationRoute", "resolveNotificationPrincipal", "notification mutations must resolve the canonical authenticated principal");
requireText("mutationRoute", "mutateInboxNotification", "notification mutations must delegate to the principal-scoped repository boundary");
requireText("mutationRoute", "verifyCsrfOrigin", "notification lifecycle mutations must enforce same-origin CSRF protection");
requireText("preferenceRoute", "verifyCsrfOrigin", "notification preference mutations must enforce same-origin CSRF protection");
requireText("consentRoute", "verifyCsrfOrigin", "notification consent mutations must enforce same-origin CSRF protection");
for (const target of ["inboxRoute", "mutationRoute", "preferenceRoute", "consentRoute"]) {
  requireText(target, "notificationApiError", "all notification API errors must be private and non-cacheable");
  requireText(target, "notificationApiOk", "all notification API success responses must be private and non-cacheable");
}

requireText("repository", "LEGACY_NOTIFICATION_MIGRATION_BATCH_SIZE = 200", "legacy migration must have a bounded batch size");
requireText("repository", "AND NOT EXISTS (", "legacy migration must anti-join already migrated notifications");
requireText("repository", "migrated.tenant_id = $2", "legacy migration anti-join must remain tenant scoped");
requireText("repository", "migrated.principal_id = $3::uuid", "legacy migration anti-join must remain principal scoped");
requireText("repository", "'legacy:notification_center:' || legacy.id::text", "legacy migration anti-join must use the canonical correlation key");
requireText("repository", "LIMIT $4", "legacy migration work must remain bounded per inbox request");
requireText("repository", "AND tenant_id = $2", "mutation SQL must enforce tenant ownership");
requireText("repository", "AND principal_id = $3", "mutation SQL must enforce principal ownership");
requireText("repository", "[notificationId, principal.tenantId, principal.id]", "mutation parameters must bind the resolved tenant and principal identities");
requireText("repository", "ON CONFLICT (tenant_id, principal_id, correlation_key) DO NOTHING", "legacy migration must be idempotent");
requireText("repository", "dismissed_at IS NULL", "dismissed notifications must be excluded from inbox projection");
rejectText("repository", "export async function upsertNotificationPreference", "preference writes must have one authoritative implementation");
rejectText("repository", "validNotificationPreferenceInput", "preference parsing must not be duplicated in the inbox repository");

requireText("notificationCenter", "notificationClass", "Notification Center must consume the durable notification class contract");
requireText("notificationCenter", "actionUrl", "Notification Center must consume the durable action URL contract");
requireText("notificationCenter", "readAt", "Notification Center must consume the durable lifecycle contract");
requireText("notificationCenter", "loadState === \"error\"", "Notification Center must expose inbox failures rather than fabricate an empty state");
requireText("notificationCenter", "loadState === \"ready\" && topItems.length === 0", "Notification Center may show an empty state only after a successful inbox read");
requireText("notificationCenter", "setLoadState(\"error\")", "Notification Center must preserve explicit failure state on inbox errors");
requireText("notificationCenter", "`/api/notifications/${encodeURIComponent(id)}`", "Notification Center must mutate the authoritative platform notification endpoint");
requireText("notificationCenter", 'JSON.stringify({ action: "read" })', "Notification Center must use the typed read lifecycle mutation");
requireText("notificationCenter", "aria-expanded={open}", "Notification Center trigger must expose open state");
requireText("notificationCenter", 'event.key !== "Escape"', "Notification Center must support Escape dismissal");
requireText("notificationCenter", 'credentials: "same-origin"', "Notification Center requests must remain session-bound");
rejectText("notificationCenter", "/api/notification-brain", "AI output may enter the UI only through the governed notification policy and durable inbox");
rejectText("notificationCenter", "churnRisk", "raw churn scoring must not be exposed in the user notification surface");
rejectText("notificationCenter", ".catch(() => undefined)", "Notification Center must not silently swallow authoritative inbox failures");
rejectText("notificationCenter", "/api/notifications/read", "Notification Center must not write to the retired legacy notification table");
rejectText("notificationCenter", "action_url", "Notification Center must not depend on the legacy action URL field");
rejectText("notificationCenter", "read_at", "Notification Center must not depend on the legacy read timestamp field");
requireText("persianNotificationPage", '<NotificationCenter locale="fa" compact />', "Persian Notification Center route must render the durable Persian inbox");
requireText("persianNotificationPage", "کانال‌های خارجی تا پیش از تأیید ارائه‌دهنده", "Persian Notification Center must disclose that external channels are not yet certified");
rejectText("persianNotificationPage", "اندروید، iOS، ایمیل و تلگرام طراحی شده", "Persian Notification Center must not imply inactive external channels are available");
requireText("englishNotificationPage", '<NotificationCenter locale="en" compact />', "English Notification Center route must render the durable English inbox");
requireText("englishNotificationPage", "External delivery channels are not presented as active", "English Notification Center must disclose that external channels are not yet certified");

requireText("preferences", "mandatory_notification_class_cannot_be_disabled", "mandatory notification classes must not be silently disabled");
requireText("preferences", "mandatory_notification_class_requires_instant_delivery", "mandatory notification classes must not be downgraded to digest");
requireText("preferences", "validConsentIdempotencyKey", "consent idempotency keys must be validated");
requireText("preferences", "notification-consent:${principalId}", "concurrent consent retries must be transactionally serialized");
requireText("preferences", "ON CONFLICT (principal_id, purpose, idempotency_key) DO NOTHING", "consent retries must replay existing evidence rather than append duplicates");
requireText("preferences", "notification_consent_idempotency_conflict", "changed consent payloads may not reuse an idempotency key");
requireText("preferences", "ORDER BY purpose, event_sequence DESC", "current consent projection must use deterministic append order");
requireText("preferences", 'MARKETING_CONSENT_POLICY_VERSION = "marketing-v1"', "consent policy version must be server-owned");
requireText("preferences", 'NOTIFICATION_CONSENT_SOURCE = "notification-preference-center"', "consent source must be server-owned");
requireText("preferences", "MARKETING_CONSENT_POLICY_VERSION,", "consent repository must write the server-owned policy version");
requireText("preferences", "NOTIFICATION_CONSENT_SOURCE,", "consent repository must write the server-owned source");
requireText("preferenceRoute", "exactly_one_preferences_operation_required", "preference mutations must be unambiguous");
requireText("preferenceRoute", "mandatory_notification_class_requires_instant_delivery", "preference API must expose mandatory cadence conflicts explicitly");
requireText("consentRoute", "recordNotificationConsent", "consent changes must append evidence rather than overwrite state");
requireText("consentRoute", 'req.headers.get("idempotency-key")', "consent writes must require a request idempotency key");
requireText("consentRoute", "validConsentIdempotencyKey", "consent route must validate idempotency evidence");
rejectText("consentRoute", "MARKETING_CONSENT_POLICY_VERSION", "consent route must not own or accept policy-version provenance");
rejectText("consentRoute", "NOTIFICATION_CONSENT_SOURCE", "consent route must not own or accept source provenance");
rejectText("consentRoute", "raw.policyVersion", "client-controlled consent policy versions are forbidden");
rejectText("consentRoute", "raw.source", "client-controlled consent sources are forbidden");
requireText("consentRoute", 'notificationApiError("authentication_required", 401)', "consent endpoints must require authentication");

if (failures.length) {
  console.error("Notification persistence authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Notification persistence authority check passed: durable principal, bounded legacy migration, policy-only AI entry, truthful bilingual accessible inbox, tenant ownership, mandatory cadence, serialized idempotent consent, private no-store responses and CSRF are enforced.");
