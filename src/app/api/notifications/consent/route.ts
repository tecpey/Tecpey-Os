import { NextRequest } from "next/server";
import { checkBodySize } from "@/lib/api-validation";
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
  getCurrentNotificationConsents,
  parseNotificationConsentInput,
  recordNotificationConsent,
  validConsentIdempotencyKey,
} from "@/lib/notifications/preferences";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/notifications/consent" }, async () => {
    const rate = await rateLimit(req, {
      namespace: "notification-consent-read",
      limit: 60,
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
        return getCurrentNotificationConsents(client, principal.id);
      });

      if (!result.enabled) {
        return notificationApiError("notification_consent_unavailable", 503);
      }
      return notificationApiOk({ consents: result.value });
    } catch (error) {
      const code = error instanceof Error ? error.message : "notification_consent_failed";
      if (code === "notification_principal_inactive") {
        return notificationApiError("account_inactive", 403);
      }
      if (code.includes("notification_principal_")) {
        return notificationApiError("notification_identity_conflict", 409);
      }
      return notificationApiError("notification_consent_unavailable", 503);
    }
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/notifications/consent" }, async () => {
    if (!verifyCsrfOrigin(req)) return notificationApiError("forbidden", 403);

    const rate = await rateLimit(req, {
      namespace: "notification-consent-write",
      limit: 20,
      windowMs: 60_000,
    });
    if (!rate.ok) return notificationApiError("rate_limited", 429);
    if (!checkBodySize(req.headers.get("content-length"), 2_048)) {
      return notificationApiError("payload_too_large", 413);
    }

    const identity = await getNotificationIdentityFromRequest(req, {
    strictRevocation: true,
  });
    if (!identity) return notificationApiError("authentication_required", 401);

    const idempotencyKey = req.headers.get("idempotency-key")?.trim() ?? null;
    if (!validConsentIdempotencyKey(idempotencyKey)) {
      return notificationApiError("invalid_or_missing_idempotency_key", 400);
    }

    let raw: unknown;
    try {
      const boundedBodyRequest = await readBoundedJsonRequest(req, {
        maxBytes: 2_048,
      });
      if (!boundedBodyRequest.ok) {
        return notificationApiError(boundedBodyRequest.error, boundedBodyRequest.status);
      }
      req = boundedBodyRequest.request;
      raw = await req.json();
    } catch {
      return notificationApiError("invalid_json", 400);
    }

    const consent = parseNotificationConsentInput(raw);
    if (!consent) {
      return notificationApiError("invalid_notification_consent", 400);
    }

    try {
      const result = await withTx(async (client) => {
        const principal = await resolveNotificationPrincipal(client, identity);
        if (principal.status !== "active") {
          throw new Error("notification_principal_inactive");
        }
        const recorded = await recordNotificationConsent(client, principal.id, {
          ...consent,
          idempotencyKey,
        });
        return {
          recorded,
          consents: await getCurrentNotificationConsents(client, principal.id),
        };
      });

      if (!result.enabled) {
        return notificationApiError("notification_consent_unavailable", 503);
      }
      return notificationApiOk(result.value, 201);
    } catch (error) {
      const code = error instanceof Error ? error.message : "notification_consent_failed";
      if (code === "notification_consent_idempotency_conflict") {
        return notificationApiError(code, 409);
      }
      if (code === "notification_principal_inactive") {
        return notificationApiError("account_inactive", 403);
      }
      if (code.includes("notification_principal_")) {
        return notificationApiError("notification_identity_conflict", 409);
      }
      return notificationApiError("notification_consent_unavailable", 503);
    }
  });
}
