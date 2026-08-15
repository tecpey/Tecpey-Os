import { NextRequest } from "next/server";
import {
  ACADEMY_CREDENTIAL_LIFECYCLE_POLICY_VERSION,
  appendAcademyCredentialLifecycleEvent,
} from "@/lib/academy-credential-authority";
import { apiError, apiOk } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
  writeSensitiveMutationAuditTx,
} from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { requireTenantProduct } from "@/lib/security/tenant-product-entitlement";

const ROUTE = "/api/academy-credential-appeals";
const FIELDS = new Set(["credentialId", "reasonCode"]);
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON_CODE_PATTERN = /^[a-z][a-z0-9_.:-]{2,119}$/;

export async function POST(req: NextRequest) {
  return withObservability(req, { route: `${ROUTE} POST` }, async () => {
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    const limited = await rateLimit(req, { namespace: "academy-credential-appeal-open", limit: 20, windowMs: 60_000 });
    if (!limited.ok) return apiError("rate_limited", 429);
    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("academy_profile_required", 401);
    const correlationId = resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id"));
    const idempotencyKey = String(req.headers.get("idempotency-key") ?? "").trim();
    if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) return apiError("invalid_idempotency_key", 400);
    const tenantContext = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "student",
      scopes: ["academy:learning-events:write"],
      requestId: correlationId,
    });
    if (!tenantContext.available) return apiError("credential_appeal_unavailable", 503);
    const productGate = await requireTenantProduct(tenantContext.tenantId, "academy");
    if (productGate) return productGate;
    const bounded = await readBoundedJsonRequest(req, { maxBytes: 2_048 });
    if (!bounded.ok) return apiError(bounded.error, bounded.status);
    const body = bounded.value as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 2 || Object.keys(body).some((key) => !FIELDS.has(key)) ||
      typeof body.credentialId !== "string" || !UUID_PATTERN.test(body.credentialId) ||
      typeof body.reasonCode !== "string" || !REASON_CODE_PATTERN.test(body.reasonCode)) {
      return apiError("invalid_request", 400);
    }
    const credentialId = body.credentialId;
    const reasonCode = body.reasonCode;
    const requestHash = hashSensitiveAuditRequest({
      credentialId,
      lifecycleEvent: "appeal_opened",
      reasonCode,
    });
    try {
      const result = await withTx(async (client) => {
        const changed = await appendAcademyCredentialLifecycleEvent(client, {
          tenantId: tenantContext.tenantId,
          workspaceId: tenantContext.workspaceId,
          credentialId,
          actorType: "student",
          actorId: tenantContext.principalId,
          eventType: "appeal_opened",
          reasonCode,
          idempotencyKey,
          metadata: { source: "credential_cabinet" },
        });
        if (!changed) return null;
        await writeSensitiveMutationAuditTx(client, {
          tenantId: tenantContext.tenantId,
          actorType: "student",
          actorId: tenantContext.principalId,
          action: "academy.credential.lifecycle.update",
          resourceType: "academy_credential",
          resourceId: credentialId,
          outcome: "success",
          correlationId,
          requestHash,
          metadata: {
            lifecycleEvent: "appeal_opened",
            reasonCode,
            policyVersion: ACADEMY_CREDENTIAL_LIFECYCLE_POLICY_VERSION,
          },
        });
        return changed;
      });
      if (!result.enabled) return apiError("credential_appeal_unavailable", 503);
      if (!result.value) return apiError("credential_not_found", 404);
      return apiOk({ ...result.value }, 202);
    } catch (error) {
      if (error instanceof Error && error.message === "academy_credential_lifecycle_identity_conflict") {
        return apiError("idempotency_conflict", 409);
      }
      if (error instanceof Error && /academy_credential_.*transition/.test(error.message)) {
        return apiError("credential_lifecycle_transition_invalid", 409);
      }
      return apiError("credential_appeal_unavailable", 503);
    }
  });
}
