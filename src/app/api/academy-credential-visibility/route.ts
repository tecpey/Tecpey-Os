import { NextRequest } from "next/server";
import { setOwnedAcademyCredentialVisibility } from "@/lib/academy-credential-authority";
import { apiError, apiOk } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { hashSensitiveAuditRequest, resolveSensitiveAuditCorrelation, writeSensitiveMutationAuditTx } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { requireTenantProduct } from "@/lib/security/tenant-product-entitlement";

const ROUTE = "/api/academy-credential-visibility";
const FIELDS = new Set(["credentialId", "visibility"]);
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest) {
  return withObservability(req, { route: `${ROUTE} PATCH` }, async () => {
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    const limited = await rateLimit(req, { namespace: "academy-credential-visibility", limit: 30, windowMs: 60_000 });
    if (!limited.ok) return apiError("rate_limited", 429);
    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("academy_profile_required", 401);
    const correlationId = resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id"));
    const idempotencyKey = String(req.headers.get("idempotency-key") ?? "").trim();
    if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) return apiError("invalid_idempotency_key", 400);
    const tenantContext = await resolveTenantPrincipalContext({ session, request: req,
      requiredPrincipalType: "student", scopes: ["academy:learning-events:write"], requestId: correlationId });
    if (!tenantContext.available) return apiError("credential_visibility_unavailable", 503);
    const productGate = await requireTenantProduct(tenantContext.tenantId, "academy");
    if (productGate) return productGate;
    const bounded = await readBoundedJsonRequest(req, { maxBytes: 1_024 });
    if (!bounded.ok) return apiError(bounded.error, bounded.status);
    const value = await bounded.request.json().catch(() => null);
    if (!value || typeof value !== "object" || Array.isArray(value)) return apiError("invalid_request", 400);
    const body = value as Record<string, unknown>;
    if (Object.keys(body).length !== 2 || Object.keys(body).some((key) => !FIELDS.has(key)) ||
      typeof body.credentialId !== "string" || !UUID_PATTERN.test(body.credentialId) ||
      (body.visibility !== "private" && body.visibility !== "profile" && body.visibility !== "public")) {
      return apiError("invalid_request", 400);
    }
    const requestHash = hashSensitiveAuditRequest({ credentialId: body.credentialId, visibility: body.visibility });
    try {
      const result = await withTx(async (client) => {
        const changed = await setOwnedAcademyCredentialVisibility(client, {
          tenantId: tenantContext.tenantId, workspaceId: tenantContext.workspaceId,
          studentId: tenantContext.principalId,
          credentialId: body.credentialId as string,
          visibility: body.visibility as "private" | "profile" | "public", idempotencyKey,
        });
        if (!changed) return null;
        await writeSensitiveMutationAuditTx(client, {
          tenantId: tenantContext.tenantId, actorType: "student",
          actorId: tenantContext.principalId,
          action: "academy.credential.visibility.update", resourceType: "academy_credential",
          resourceId: body.credentialId as string, outcome: "success", correlationId, requestHash,
          metadata: { visibility: body.visibility,
            policyVersion: "academy-credential-visibility-v1" },
        });
        return changed;
      });
      if (!result.enabled) return apiError("credential_visibility_unavailable", 503);
      if (!result.value) return apiError("credential_not_found", 404);
      return apiOk({ credentialId: body.credentialId, ...result.value });
    } catch (error) {
      if (error instanceof Error && error.message === "academy_credential_visibility_identity_conflict") {
        return apiError("idempotency_conflict", 409);
      }
      return apiError("credential_visibility_unavailable", 503);
    }
  });
}
