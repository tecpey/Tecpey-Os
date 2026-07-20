import { readJsonBody } from "@/lib/security/request-body";
import { NextRequest } from "next/server";

import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { withObservability } from "@/lib/observe";
import {
  notificationApiError,
  notificationApiOk,
} from "@/lib/notifications/http";
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

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/notifications/preferences" }, async () => {
    const rate = await rateLimit(req, {
      namespace: "notification-preferences-read",
      limit: 90,
      windowMs: 60_000,
    });
    if (!rate.ok) return notificationApiError("rate_limited", 429);

    const identity = await getNotificationIdentityFromRequest(req);
    if (!identity) return notificationApiError("authentication_required", 401);

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

      if (!result.enabled) {
        return notificationApiError("notification_preferences_unavailable", 503);
      }
      return notificationApiOk(result.value);
    } catch (error) {
      const code = error instanceof Error ? error.message : "notification_preferences_failed";
      if (code === "notification_principal_inactive") {
        return notificationApiError("account_inactive", 403);
      }
      if (code.includes("notification_principal_")) {
        return notificationApiError("notification_identity_conflict", 409);
      }
      return notificationApiError("notification_preferences_unavailable", 503);
    }
  });
}

export async function PATCH(req: NextRequest) {
  return withObservability(req, { route: "/api/notifications/preferences" }, async () => {
    if (!verifyCsrfOrigin(req)) return notificationApiError("forbidden", 403);

    const rate = await rateLimit(req, {
      namespace: "notification-preferences-write",
      limit: 30,
      windowMs: 60_000,
    });
    if (!rate.ok) return notificationApiError("rate_limited", 429);

    const identity = await getNotificationIdentityFromRequest(req, {
    strictRevocation: true,
  });
    if (!identity) return notificationApiError("authentication_required", 401);

    const bodyResult = await readJsonBody(req, {
      maxBytes: 8_192,
      allowEmptyObject: true,
    });
    if (!bodyResult.ok) return notificationApiError(bodyResult.error, bodyResult.status);
    const body = bodyResult.value;

    const record = body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
    if (!record) {
      return notificationApiError("invalid_preferences_payload", 400);
    }

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
      return notificationApiError("invalid_preferences_payload", 400);
    }
    if ((preference ? 1 : 0) + (settings ? 1 : 0) !== 1) {
      return notificationApiError(
        "exactly_one_preferences_operation_required",
        400,
      );
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

      if (!result.enabled) {
        return notificationApiError("notification_preferences_unavailable", 503);
      }
      return notificationApiOk(result.value);
    } catch (error) {
      const code = error instanceof Error ? error.message : "notification_preferences_failed";
      if (
        code === "mandatory_notification_class_cannot_be_disabled" ||
        code === "mandatory_notification_class_requires_instant_delivery"
      ) {
        return notificationApiError(code, 409);
      }
      if (code === "notification_principal_inactive") {
        return notificationApiError("account_inactive", 403);
      }
      if (code.includes("notification_principal_")) {
        return notificationApiError("notification_identity_conflict", 409);
      }
      return notificationApiError("notification_preferences_unavailable", 503);
    }
  });
}
