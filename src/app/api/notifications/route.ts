import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { withTx } from "@/lib/db";
import { apiOk, apiError, Validate } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import {
  getNotificationIdentityFromRequest,
  resolveNotificationPrincipal,
} from "@/lib/notifications/principal";
import {
  decodeNotificationCursor,
  listInboxNotifications,
  migrateLegacyNotificationsForPrincipal,
} from "@/lib/notifications/repository";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/notifications" }, async () => {
    const rate = await rateLimit(req, {
      namespace: "notifications-read",
      limit: 120,
      windowMs: 60_000,
    });
    if (!rate.ok) return apiError("rate_limited", 429);

    const identity = await getNotificationIdentityFromRequest(req);
    if (!identity) return apiError("authentication_required", 401);

    const url = new URL(req.url);
    const limit = Validate.int(url.searchParams.get("limit") ?? "30", 1, 50);
    if (!limit) return apiError("invalid_limit", 400);

    const cursorValue = url.searchParams.get("cursor");
    const cursor = cursorValue ? decodeNotificationCursor(cursorValue) : null;
    if (cursorValue && !cursor) return apiError("invalid_cursor", 400);

    try {
      const result = await withTx(async (client) => {
        const principal = await resolveNotificationPrincipal(client, identity);
        if (principal.status !== "active") {
          throw new Error("notification_principal_inactive");
        }

        await migrateLegacyNotificationsForPrincipal(client, principal);
        return listInboxNotifications(client, principal, { limit, cursor });
      });

      if (!result.enabled) return apiError("notification_inbox_unavailable", 503);
      return apiOk(result.value);
    } catch (error) {
      const code = error instanceof Error ? error.message : "notification_inbox_failed";
      if (code === "notification_principal_inactive") {
        return apiError("account_inactive", 403);
      }
      if (code.includes("notification_principal_")) {
        return apiError("notification_identity_conflict", 409);
      }
      return apiError("notification_inbox_unavailable", 503);
    }
  });
}

export async function POST() {
  return apiError("notification_creation_protected", 405);
}
