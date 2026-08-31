import { NextRequest } from "next/server";
import { parseSupportMessageCommand } from "@/lib/crm/support-message-input";
import { ingestSupportMessage } from "@/lib/crm/support-message-authority";
import { hashLeadValue } from "@/lib/crm/lead-pii";
import { rateLimit } from "@/lib/rate-limit";
import { getTrustedClientIp } from "@/lib/security/trusted-client-ip";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { apiOk, apiError, apiRateLimited } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { PLATFORM } from "@/lib/platform-config";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

// SB-013 — where the contact form's message actually goes.
//
// Shaped after /api/academy-lead because it accepts the same class of thing:
// unauthenticated personal data from the public web. Same CSRF origin check,
// same trusted-client-ip derivation, same bounded body, same rate limit keyed on
// a hashed network fingerprint rather than a raw address.
//
// The body budget is larger than the lead route's 3 KB because a support
// message is prose, not a set of fields. It is written as a literal at each use
// rather than hoisted into a constant, matching the sibling intake routes: the
// bounded-body authority gate reads the budget out of the call site, and a
// budget it cannot read is a budget nobody is checking.

export async function POST(request: NextRequest) {
  return withObservability(request, { route: "/api/support-message" }, async () => {
    if (!(await verifyCsrfOrigin(request))) return apiError("forbidden", 403);

    const trustedIp = getTrustedClientIp(request);
    if (process.env.NODE_ENV === "production" && !trustedIp) {
      return apiError("client_network_unresolved", 400);
    }
    const networkFingerprint = trustedIp ? hashLeadValue(`ip:${trustedIp}`) : null;

    // Tighter than the lead route's 10/minute. A person contacting support
    // sends one message and waits; a burst is either a mistake or an attempt to
    // fill the queue.
    const limit = await rateLimit(request, {
      namespace: "support-message",
      limit: 5,
      windowMs: 60_000,
      identity: networkFingerprint ?? "development-unresolved-client",
    });
    if (!limit.ok) return apiRateLimited(limit.retryAfterSeconds);

    try {
      const boundedBodyRequest = await readBoundedJsonRequest(request, {
        maxBytes: 12_000,
        allowEmptyObject: true,
      });
      if (!boundedBodyRequest.ok) {
        return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
      }
      request = boundedBodyRequest.request;
      const raw = await request.text();
      if (Buffer.byteLength(raw, "utf8") > 12_000) {
        return apiError("payload_too_large", 413);
      }

      const parsed = parseSupportMessageCommand({
        body: JSON.parse(raw || "{}") as unknown,
        tenantId: PLATFORM.DEFAULT_TENANT_ID,
        defaultSource: "contact-us",
        idempotencyHeader: request.headers.get("idempotency-key"),
        networkFingerprint,
      });
      if (!parsed.ok) return apiError(parsed.error, 400);

      const result = await ingestSupportMessage(parsed.command);
      // Storage being unavailable must never read to the sender as "sent" —
      // that is the SB-013 failure in a different place.
      if (result.status === "unavailable") return apiError("support_storage_unavailable", 503);
      // A retention-deleted message no longer exists in the support queue.
      // A delayed replay must not be acknowledged as if support received it.
      if (result.status === "expired") return apiError("support_message_expired", 410);
      // The same idempotency key carrying a different message. Answering 200
      // would report the edited message as sent while storing the older one.
      if (result.status === "conflict") return apiError("idempotency_conflict", 409);

      const response = apiOk({ id: result.result.id, created: result.result.created });
      response.headers.set("Cache-Control", "no-store, private");
      return response;
    } catch (error) {
      if (error instanceof SyntaxError) return apiError("invalid_json", 400);
      return apiError("server_error", 500);
    }
  });
}
