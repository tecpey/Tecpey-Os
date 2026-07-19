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
import {
  getCurrentNotificationConsents,
  parseNotificationConsentInput,
  recordNotificationConsent,
  validConsentIdempotencyKey,
} from "@/lib/notifications/preferences";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/notifications/consent" }, async () => {
    const rate = await rateLimit(req, {
      namespace: "notification-consent-read",
      limit: 60,
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
        return getCurrentNotificationConsents(client, principal.id);
      });

      if (!result.enabled) return apiError("notification_consent_unavailable", 503);
      return apiOk({ consents: result.value });
    } catch (error) {
      const code = error instanceof Error ? error.message : "notification_consent_failed";
      if (code === "notification_principal_inactive") {
        return apiError("account_inactive", 403);
      }
      if (code.includes("notification_principal_")) {
        return apiError("notification_identity_conflict", 409);
      }
      return apiError("notification_consent_unavailable", 503);
    }
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/notifications/consent" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rate = await rateLimit(req, {
      namespace: "notification-consent-write",
      limit: 20,
      windowMs: 60_000,
    });
    if (!rate.ok) return apiError("rate_limited", 429);
    if (!checkBodySize(req.headers.get("content-length"), 2_048)) {
      return apiError("payload_too_large", 413);
    }

    const identity = await getNotificationIdentityFromRequest(req);
    if (!identity) return apiError("authentication_required", 401);

    const idempotencyKey = req.headers.get("idempotency-key")?.trim() ?? null;
    if (!validConsentIdempotencyKey(idempotencyKey)) {
      return apiError("invalid_or_missing_idempotency_key", 400);
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError("invalid_json", 400);
    }

    const consent = parseNotificationConsentInput(raw);
    if (!consent) return apiError("invalid_notification_consent", 400);

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

      if (!result.enabled) return apiError("notification_consent_unavailable", 503);
      return apiOk(result.value, 201);
    } catch (error) {
      const code = error instanceof Error ? error.message : "notification_consent_failed";
      if (code === "notification_consent_idempotency_conflict") {
        return apiError(code, 409);
      }
      if (code === "notification_principal_inactive") {
        return apiError("account_inactive", 403);
      }
      if (code.includes("notification_principal_")) {
        return apiError("notification_identity_conflict", 409);
      }
      return apiError("notification_consent_unavailable", 503);
    }
  });
}
