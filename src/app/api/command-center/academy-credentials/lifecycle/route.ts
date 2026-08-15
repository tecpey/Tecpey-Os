import { NextRequest } from "next/server";
import {
  ACADEMY_CREDENTIAL_LIFECYCLE_POLICY_VERSION,
  appendApprovedAcademyCredentialLifecycleEvent,
  type AcademyCredentialLifecycleEventType,
} from "@/lib/academy-credential-authority";
import { authorizeAdminRequest, writeAdminAuditEvent } from "@/lib/admin-control-plane";
import { apiError, apiOk, Validate } from "@/lib/api-validation";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/command-center/academy-credentials/lifecycle";
const FIELDS = new Set(["credentialId", "action", "reasonCode", "cLevelApprovalRequestId"]);
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON_CODE_PATTERN = /^[a-z][a-z0-9_.:-]{2,119}$/;
const ACTION_TO_EVENT: Record<string, AcademyCredentialLifecycleEventType> = {
  suspend: "suspended",
  reinstate: "reinstated",
  revoke: "revoked",
  resolve_appeal: "appeal_resolved",
};

export async function PATCH(req: NextRequest) {
  return withObservability(req, { route: `${ROUTE} PATCH` }, async () => {
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    const limited = await rateLimit(req, { namespace: "command-center-academy-credential-lifecycle", limit: 20, windowMs: 60_000 });
    if (!limited.ok) return apiError("rate_limited", 429);
    const authorization = await authorizeAdminRequest(req, "admin.roles.manage", {
      stepUpWithinSeconds: 300,
    });
    if (!authorization.ok) return apiError(authorization.error, authorization.status);
    const idempotencyKey = String(req.headers.get("idempotency-key") ?? "").trim();
    if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) return apiError("invalid_idempotency_key", 400);
    const bounded = await readBoundedJsonRequest(req, { maxBytes: 4_096 });
    if (!bounded.ok) return apiError(bounded.error, bounded.status);
    const body = bounded.value as Record<string, unknown>;
    const action = Validate.oneOf(body?.action, ["suspend", "reinstate", "revoke", "resolve_appeal"] as const);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 4 || Object.keys(body).some((key) => !FIELDS.has(key)) ||
      typeof body.credentialId !== "string" || !UUID_PATTERN.test(body.credentialId) ||
      typeof body.cLevelApprovalRequestId !== "string" || !UUID_PATTERN.test(body.cLevelApprovalRequestId) ||
      !action ||
      typeof body.reasonCode !== "string" || !REASON_CODE_PATTERN.test(body.reasonCode)) {
      return apiError("invalid_request", 400);
    }
    const credentialId = body.credentialId;
    const reasonCode = body.reasonCode;
    const cLevelApprovalRequestId = body.cLevelApprovalRequestId;
    const lifecycleEvent = ACTION_TO_EVENT[action];
    try {
      const result = await withTx(async (client) => {
        const changed = await appendApprovedAcademyCredentialLifecycleEvent(client, {
          tenantId: authorization.principal.tenantId,
          workspaceId: authorization.principal.workspaceId,
          credentialId,
          actorType: "admin",
          actorId: authorization.principal.adminId,
          eventType: lifecycleEvent,
          reasonCode,
          idempotencyKey,
          metadata: { source: "command_center" },
          cLevelApprovalRequestId,
        });
        if (!changed) return null;
        await writeAdminAuditEvent(client, {
          actorAdminId: authorization.principal.adminId,
          sessionId: authorization.principal.sessionId,
          effectiveRoles: authorization.principal.roles,
          action: `academy.credential.lifecycle.${lifecycleEvent}`,
          resourceType: "academy_credential",
          resourceId: credentialId,
          requestId: req.headers.get("x-tecpey-request-id") ?? null,
          sourceIp: getClientIp(req),
          userAgent: (req.headers.get("user-agent") ?? "").slice(0, 500),
          reason: reasonCode,
          afterState: {
            lifecycleEvent,
            policyVersion: ACADEMY_CREDENTIAL_LIFECYCLE_POLICY_VERSION,
            cLevelApprovalRequestId,
          },
          approvalRequestId: cLevelApprovalRequestId,
          outcome: "success",
        });
        return changed;
      });
      if (!result.enabled) return apiError("credential_lifecycle_unavailable", 503);
      if (!result.value) return apiError("credential_not_found", 404);
      return apiOk({ ...result.value }, 202, { "Cache-Control": "no-store, max-age=0" });
    } catch (error) {
      if (error instanceof Error && error.message === "academy_credential_lifecycle_identity_conflict") {
        return apiError("idempotency_conflict", 409);
      }
      if (error instanceof Error && /academy_credential_.*transition/.test(error.message)) {
        return apiError("credential_lifecycle_transition_invalid", 409);
      }
      return apiError("credential_lifecycle_unavailable", 503);
    }
  });
}
