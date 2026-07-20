import { readJsonBody } from "@/lib/security/request-body";
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

const MAX_PAYLOAD_BYTES = 5_000;

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-specialized-lead" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const trustedIp = getTrustedClientIp(req);
    if (process.env.NODE_ENV === "production" && !trustedIp) {
      return apiError("client_network_unresolved", 400);
    }
    const networkFingerprint = trustedIp ? hashLeadValue(`ip:${trustedIp}`) : null;
    const rate = await rateLimit(req, {
      namespace: "academy-specialized-lead",
      limit: 8,
      windowMs: 60_000,
      identity: networkFingerprint ?? "development-unresolved-client",
    });
    if (!rate.ok) return apiRateLimited(rate.retryAfterSeconds);

    try {
      const bodyResult = await readJsonBody(req, {
        maxBytes: MAX_PAYLOAD_BYTES,
        allowEmptyObject: true,
      });
      if (!bodyResult.ok) return apiError(bodyResult.error, bodyResult.status);
      const body = bodyResult.value;
      const parsed = parseAcademyLeadCommand({
        body,
        tenantId: PLATFORM.DEFAULT_TENANT_ID,
        leadKind: "academy_specialized",
        defaultSource: "academy-specialized-program",
        idempotencyHeader: req.headers.get("idempotency-key"),
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
      response.headers.set("Cache-Control", "no-store, private");
      return response;
    } catch (error) {
      if (error instanceof SyntaxError) return apiError("invalid_json", 400);
      return apiError("server_error", 500);
    }
  });
}
