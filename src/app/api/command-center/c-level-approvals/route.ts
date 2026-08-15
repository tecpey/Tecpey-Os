import { NextRequest } from "next/server";
import { authorizeAdminRequest, writeAdminAuditEvent } from "@/lib/admin-control-plane";
import { apiError, apiOk, Validate } from "@/lib/api-validation";
import {
  C_LEVEL_CONTROLLED_ACTIONS,
  requestCLevelApprovalTx,
  reviewCLevelApprovalTx,
  type CLevelApprovalReviewDecision,
  type CLevelControlledAction,
} from "@/lib/c-level-control-authority";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/command-center/c-level-approvals";
const RESOURCE_TYPE_PATTERN = /^[a-z][a-z0-9_:-]{2,79}$/;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,199}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function statusForCLevelError(error: unknown): { code: string; status: 400 | 403 | 404 | 409 | 422 | 503 } {
  const code = error instanceof Error ? error.message : "c_level_approval_unavailable";
  if (code === "c_level_reviewer_role_required" || code === "c_level_self_review_forbidden") {
    return { code, status: 403 };
  }
  if (code === "c_level_approval_request_not_found") return { code, status: 404 };
  if (
    code === "c_level_approval_request_not_pending" ||
    code === "c_level_approval_request_expired"
  ) {
    return { code, status: 409 };
  }
  if (
    code === "c_level_reason_too_short" ||
    code === "c_level_approval_resource_mismatch"
  ) {
    return { code, status: 422 };
  }
  if (code.startsWith("c_level_")) return { code, status: 400 };
  return { code: "c_level_approval_unavailable", status: 503 };
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: `${ROUTE} POST` }, async () => {
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    const limited = await rateLimit(req, {
      namespace: "command-center-c-level-approval-request",
      limit: 20,
      windowMs: 60_000,
    });
    if (!limited.ok) return apiError("rate_limited", 429);
    const authorization = await authorizeAdminRequest(req, "admin.roles.manage", {
      stepUpWithinSeconds: 300,
    });
    if (!authorization.ok) return apiError(authorization.error, authorization.status);

    const bounded = await readBoundedJsonRequest(req, { maxBytes: 8_192 });
    if (!bounded.ok) return apiError(bounded.error, bounded.status);
    req = bounded.request;
    const body = bounded.value as Record<string, unknown>;
    const action = Validate.oneOf(body?.action, C_LEVEL_CONTROLLED_ACTIONS) as CLevelControlledAction | null;
    const resourceType = Validate.text(body?.resourceType, 3, 80);
    const resourceId = Validate.text(body?.resourceId, 3, 200);
    const reason = Validate.text(body?.reason, 20, 1_000);
    const expiresInDays = body?.expiresInDays === undefined
      ? undefined
      : Validate.int(body.expiresInDays, 1, 30);
    if (
      !action ||
      !resourceType ||
      !RESOURCE_TYPE_PATTERN.test(resourceType) ||
      !resourceId ||
      !RESOURCE_ID_PATTERN.test(resourceId) ||
      !reason ||
      (body?.expiresInDays !== undefined && expiresInDays === null)
    ) {
      return apiError("invalid_c_level_approval_request", 400);
    }

    try {
      const tx = await withTx(async (client) => {
        const approval = await requestCLevelApprovalTx(client, {
          tenantId: authorization.principal.tenantId,
          workspaceId: authorization.principal.workspaceId,
          action,
          resourceType,
          resourceId,
          requestedByAdminId: authorization.principal.adminId,
          reason,
          payload: body?.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
            ? body.payload as Record<string, unknown>
            : undefined,
          expiresInDays: expiresInDays ?? undefined,
        });
        await writeAdminAuditEvent(client, {
          actorAdminId: authorization.principal.adminId,
          sessionId: authorization.principal.sessionId,
          effectiveRoles: authorization.principal.roles,
          action: `c_level.approval.request.${action}`,
          resourceType,
          resourceId,
          approvalRequestId: approval.approvalRequestId,
          requestId: req.headers.get("x-tecpey-request-id") ?? null,
          sourceIp: getClientIp(req),
          userAgent: (req.headers.get("user-agent") ?? "").slice(0, 500),
          reason,
        });
        return approval;
      });
      if (!tx.enabled) return apiError("c_level_approval_unavailable", 503);
      return apiOk({ approvalRequest: tx.value }, 202, { "Cache-Control": "no-store, max-age=0" });
    } catch (error) {
      const mapped = statusForCLevelError(error);
      return apiError(mapped.code, mapped.status);
    }
  });
}

export async function PATCH(req: NextRequest) {
  return withObservability(req, { route: `${ROUTE} PATCH` }, async () => {
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    const limited = await rateLimit(req, {
      namespace: "command-center-c-level-approval-review",
      limit: 20,
      windowMs: 60_000,
    });
    if (!limited.ok) return apiError("rate_limited", 429);
    const authorization = await authorizeAdminRequest(req, "admin.roles.manage", {
      stepUpWithinSeconds: 300,
    });
    if (!authorization.ok) return apiError(authorization.error, authorization.status);

    const bounded = await readBoundedJsonRequest(req, { maxBytes: 4_096 });
    if (!bounded.ok) return apiError(bounded.error, bounded.status);
    req = bounded.request;
    const body = bounded.value as Record<string, unknown>;
    const approvalRequestId = typeof body?.approvalRequestId === "string" && UUID_PATTERN.test(body.approvalRequestId)
      ? body.approvalRequestId
      : null;
    const decision = Validate.oneOf(body?.decision, ["approve", "reject"] as const) as CLevelApprovalReviewDecision | null;
    const decisionNote = body?.decisionNote === undefined ? null : Validate.text(body.decisionNote, 20, 1_000);
    if (!approvalRequestId || !decision || (body?.decisionNote !== undefined && !decisionNote)) {
      return apiError("invalid_c_level_approval_review", 400);
    }

    try {
      const tx = await withTx(async (client) => {
        const review = await reviewCLevelApprovalTx(client, {
          tenantId: authorization.principal.tenantId,
          workspaceId: authorization.principal.workspaceId,
          approvalRequestId,
          reviewerAdminId: authorization.principal.adminId,
          reviewerRoles: authorization.principal.roles,
          decision,
          decisionNote,
        });
        await writeAdminAuditEvent(client, {
          actorAdminId: authorization.principal.adminId,
          sessionId: authorization.principal.sessionId,
          effectiveRoles: authorization.principal.roles,
          action: `c_level.approval.${decision}.${review.action}`,
          resourceType: review.resourceType,
          resourceId: review.resourceId,
          approvalRequestId,
          requestId: req.headers.get("x-tecpey-request-id") ?? null,
          sourceIp: getClientIp(req),
          userAgent: (req.headers.get("user-agent") ?? "").slice(0, 500),
          reason: decisionNote,
        });
        return review;
      });
      if (!tx.enabled) return apiError("c_level_approval_unavailable", 503);
      return apiOk({ review: tx.value }, 202, { "Cache-Control": "no-store, max-age=0" });
    } catch (error) {
      const mapped = statusForCLevelError(error);
      return apiError(mapped.code, mapped.status);
    }
  });
}
