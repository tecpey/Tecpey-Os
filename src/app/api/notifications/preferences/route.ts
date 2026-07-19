import { NextRequest } from "next/server";
import { apiError, apiOk, checkBodySize } from "@/lib/api-validation";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { withObservability } from "@/lib/observe";
import {
  getNotificationIdentityFromRequest,
  resolveNotificationPrincipal,
} from "@/lib/notifications/principal";
import { getNotificationPreferences } from "@/lib/notifications/repository";
import {
  getCurrentNotificationConsents,
  parseNotificationPreferencePatch,
  parseNotificationSettingsPatch,
  updateNotificationSettings,
  upsertNotificationPreference,
} from "@/lib/notifications/preferences";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/notifications/preferences" }, async () => {
    const rate = await rateLimit(req, {
      namespace: "notification-preferences-read",
      limit: 90,
      windowMs: 60_000,
    });
    if (!rate.ok) return apiError("rate_limited", 429);

    const identity = await getNotificationIdentityFromRequest(req);
    if (!identity) return apiError("authentication_required", 401);

    try {
      const result = await withTx(async (client) => {
        const principal = await resolveNotificationPrincipal(client, identity);
        if (principal.status !== "active") {
          throw new Error("notification_principal_inactive");
        }
        const [preferences, consents] = await Promise.all([
          getNotificationPreferences(client, principal.id),
          getCurrentNotificationConsents(client, principal.id),
        ]);
        return { ...preferences, consents };
      });

      if (!result.enabled) return apiError("notification_preferences_unavailable", 503);
      return apiOk(result.value);
    } catch (error) {
      const code = error instanceof Error ? error.message : "notification_preferences_failed";
      if (code === "notification_principal_inactive") {
        return apiError("account_inactive", 403);
      }
      if (code.includes("notification_principal_")) {
        return apiError("notification_identity_conflict", 409);
      }
      return apiError("notification_preferences_unavailable", 503);
    }
  });
}

export async function PATCH(req: NextRequest) {
  return withObservability(req, { route: "/api/notifications/preferences" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rate = await rateLimit(req, {
      namespace: "notification-preferences-write",
      limit: 30,
      windowMs: 60_000,
    });
    if (!rate.ok) return apiError("rate_limited", 429);
    if (!checkBodySize(req.headers.get("content-length"), 8_192)) {
      return apiError("payload_too_large", 413);
    }

    const identity = await getNotificationIdentityFromRequest(req);
    if (!identity) return apiError("authentication_required", 401);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("invalid_json", 400);
    }

    const record = body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
    if (!record) return apiError("invalid_preferences_payload", 400);

    const preference = record.preference === undefined
      ? null
      : parseNotificationPreferencePatch(record.preference);
    const settings = record.settings === undefined
      ? null
      : parseNotificationSettingsPatch(record.settings);

    if (
      (record.preference !== undefined && !preference) ||
      (record.settings !== undefined && !settings)
    ) {
      return apiError("invalid_preferences_payload", 400);
    }
    if ((preference ? 1 : 0) + (settings ? 1 : 0) !== 1) {
      return apiError("exactly_one_preferences_operation_required", 400);
    }

    try {
      const result = await withTx(async (client) => {
        const principal = await resolveNotificationPrincipal(client, identity);
        if (principal.status !== "active") {
          throw new Error("notification_principal_inactive");
        }

        if (preference) {
          await upsertNotificationPreference(client, principal.id, preference);
        } else if (settings) {
          await updateNotificationSettings(client, principal.id, settings);
        }

        const [preferences, consents] = await Promise.all([
          getNotificationPreferences(client, principal.id),
          getCurrentNotificationConsents(client, principal.id),
        ]);
        return { ...preferences, consents };
      });

      if (!result.enabled) return apiError("notification_preferences_unavailable", 503);
      return apiOk(result.value);
    } catch (error) {
      const code = error instanceof Error ? error.message : "notification_preferences_failed";
      if (
        code === "mandatory_notification_class_cannot_be_disabled" ||
        code === "mandatory_notification_class_requires_instant_delivery"
      ) {
        return apiError(code, 409);
      }
      if (code === "notification_principal_inactive") {
        return apiError("account_inactive", 403);
      }
      if (code.includes("notification_principal_")) {
        return apiError("notification_identity_conflict", 409);
      }
      return apiError("notification_preferences_unavailable", 503);
    }
  });
}
