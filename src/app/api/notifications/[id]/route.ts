import { readJsonBody } from "@/lib/security/request-body";
import { NextRequest } from "next/server";
import { Validate } from "@/lib/api-validation";
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
import {
  mutateInboxNotification,
  type InboxMutation,
} from "@/lib/notifications/repository";

const MUTATIONS = ["read", "unread", "dismiss", "actioned"] as const;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withObservability(req, { route: "/api/notifications/[id]" }, async () => {
    if (!verifyCsrfOrigin(req)) return notificationApiError("forbidden", 403);

    const rate = await rateLimit(req, {
      namespace: "notifications-mutate",
      limit: 90,
      windowMs: 60_000,
    });
    if (!rate.ok) return notificationApiError("rate_limited", 429);

    const identity = await getNotificationIdentityFromRequest(req);
    if (!identity) return notificationApiError("authentication_required", 401);

    const { id } = await context.params;
    const notificationId = Validate.uuid(id);
    if (!notificationId) {
      return notificationApiError("invalid_notification_id", 400);
    }

    const bodyResult = await readJsonBody(req, {
      maxBytes: 4_096,
      allowEmptyObject: true,
    });
    if (!bodyResult.ok) return notificationApiError(bodyResult.error, bodyResult.status);
    const body = bodyResult.value;

    const mutation = Validate.oneOf(
      (body as { action?: unknown } | null)?.action,
      MUTATIONS,
    ) as InboxMutation | null;
    if (!mutation) {
      return notificationApiError("invalid_notification_action", 400);
    }

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

      if (!result.enabled) {
        return notificationApiError("notification_inbox_unavailable", 503);
      }
      if (!result.value) return notificationApiError("notification_not_found", 404);
      return notificationApiOk({ notification: result.value });
    } catch (error) {
      const code = error instanceof Error ? error.message : "notification_mutation_failed";
      if (code === "notification_principal_inactive") {
        return notificationApiError("account_inactive", 403);
      }
      if (code.includes("notification_principal_")) {
        return notificationApiError("notification_identity_conflict", 409);
      }
      return notificationApiError("notification_inbox_unavailable", 503);
    }
  });
}
