import { NextRequest } from "next/server";
import { parseAcademyLeadCommand } from "@/lib/crm/academy-lead-input";
import { ingestAcademyLead } from "@/lib/crm/lead-authority";
import { hashLeadValue } from "@/lib/crm/lead-pii";
import { rateLimit } from "@/lib/rate-limit";
import { getTrustedClientIp } from "@/lib/security/trusted-client-ip";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { apiOk, apiError, apiRateLimited } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { PLATFORM } from "@/lib/platform-config";

export async function POST(request: NextRequest) {
  return withObservability(request, { route: "/api/academy-lead" }, async () => {
    if (!verifyCsrfOrigin(request)) return apiError("forbidden", 403);

    const trustedIp = getTrustedClientIp(request);
    if (process.env.NODE_ENV === "production" && !trustedIp) {
      return apiError("client_network_unresolved", 400);
    }
    const networkFingerprint = trustedIp ? hashLeadValue(`ip:${trustedIp}`) : null;
    const limit = await rateLimit(request, {
      namespace: "academy-lead",
      limit: 10,
      windowMs: 60_000,
      identity: networkFingerprint ?? "development-unresolved-client",
    });
    if (!limit.ok) return apiRateLimited(limit.retryAfterSeconds);

    try {
      const raw = await request.text();
      if (Buffer.byteLength(raw, "utf8") > 3_000) {
        return apiError("payload_too_large", 413);
      }
      const body = JSON.parse(raw || "{}") as unknown;
      const parsed = parseAcademyLeadCommand({
        body,
        tenantId: PLATFORM.DEFAULT_TENANT_ID,
        leadKind: "academy_interest",
        defaultSource: "academy-term-onboarding",
        idempotencyHeader: request.headers.get("idempotency-key"),
        networkFingerprint,
      });
      if (!parsed.ok) return apiError(parsed.error, 400);

      const result = await ingestAcademyLead(parsed.command);
      if (result.status === "conflict") return apiError("idempotency_conflict", 409);
      if (result.status === "unavailable") return apiError("crm_storage_unavailable", 503);

      const response = apiOk({
        id: result.result.id,
        revision: result.result.revision,
      });
      response.cookies.set("tecpey_academy_lead_saved", "1", {
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      });
      response.headers.set("Cache-Control", "no-store, private");
      return response;
    } catch (error) {
      if (error instanceof SyntaxError) return apiError("invalid_json", 400);
      return apiError("server_error", 500);
    }
  });
}
