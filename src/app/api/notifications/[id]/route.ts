import { NextRequest } from "next/server";
import { apiError, apiOk, checkBodySize, Validate } from "@/lib/api-validation";
import { withTx } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { withObservability } from "@/lib/observe";
import {
  getNotificationIdentityFromRequest,
  resolveNotificationPrincipal,
} from "@/lib/notifications/principal";
import {
  mutateInboxNotification,
  type InboxMutation,
} from "@/lib/notifications/repository";

const MUTATIONS = ["read", "unread", "dismiss", "actioned"] as const;

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withObservability(req, { route: "/api/notifications/[id]" }, async () => {
    const rate = await rateLimit(req, {
      namespace: "notifications-mutate",
      limit: 90,
      windowMs: 60_000,
    });
    if (!rate.ok) return apiError("rate_limited", 429);
    if (!checkBodySize(req.headers.get("content-length"), 4_096)) {
      return apiError("payload_too_large", 413);
    }

    const identity = await getNotificationIdentityFromRequest(req);
    if (!identity) return apiError("authentication_required", 401);

    const { id } = await context.params;
    const notificationId = Validate.uuid(id);
    if (!notificationId) return apiError("invalid_notification_id", 400);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("invalid_json", 400);
    }

    const mutation = Validate.oneOf(
      (body as { action?: unknown } | null)?.action,
      MUTATIONS,
    ) as InboxMutation | null;
    if (!mutation) return apiError("invalid_notification_action", 400);

    try {
      const result = await withTx(async (client) => {
        const principal = await resolveNotificationPrincipal(client, identity);
        if (principal.status !== "active") {
          throw new Error("notification_principal_inactive");
        }
        return mutateInboxNotification(
          client,
          principal,
          notificationId,
          mutation,
        );
      });

      if (!result.enabled) return apiError("notification_inbox_unavailable", 503);
      if (!result.value) return apiError("notification_not_found", 404);
      return apiOk({ notification: result.value });
    } catch (error) {
      const code = error instanceof Error ? error.message : "notification_mutation_failed";
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
