import { NextRequest } from "next/server";
import { apiError, apiOk, Validate } from "@/lib/api-validation";
import { authorizeAdminRequest } from "@/lib/admin-control-plane";
import {
  decideAuthProviderReviewRequest,
  type AuthProviderReviewDecisionAction,
} from "@/lib/admin-auth-provider-evidence-store";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/auth-providers/review-requests" }, async () => {
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "command-center-auth-provider-review-decision-write",
      limit: 20,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const authorization = await authorizeAdminRequest(req, "admin.roles.manage", {
      stepUpWithinSeconds: 300,
    });
    if (!authorization.ok) return apiError(authorization.error, authorization.status);

    const boundedBodyRequest = await readBoundedJsonRequest(req, { maxBytes: 8_192 });
    if (!boundedBodyRequest.ok) {
      return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
    }
    req = boundedBodyRequest.request;
    const body = boundedBodyRequest.value as {
      approvalRequestId?: unknown;
      decision?: unknown;
      decisionNote?: unknown;
    };
    const decision = Validate.oneOf(body?.decision, ["approve", "reject"] as const);
    if (typeof body?.approvalRequestId !== "string" || !decision) {
      return apiError("invalid_auth_provider_review_decision_request", 400);
    }

    try {
      const reviewDecision = await decideAuthProviderReviewRequest({
        tenantId: authorization.principal.tenantId,
        workspaceId: authorization.principal.workspaceId,
        actorAdminId: authorization.principal.adminId,
        sessionId: authorization.principal.sessionId,
        effectiveRoles: authorization.principal.roles,
        approvalRequestId: body.approvalRequestId,
        decision: decision as AuthProviderReviewDecisionAction,
        decisionNote: typeof body?.decisionNote === "string" ? body.decisionNote : null,
        requestId: req.headers.get("x-tecpey-request-id") ?? null,
        sourceIp: getClientIp(req),
        userAgent: (req.headers.get("user-agent") ?? "").slice(0, 500),
      });
      if (!reviewDecision.ok) {
        return apiError(reviewDecision.error, reviewDecision.httpStatus);
      }

      return apiOk(
        {
          reviewDecision,
          reviewRequestsByProvider: reviewDecision.reviewRequestsByProvider,
        },
        202,
        { "Cache-Control": "no-store, max-age=0" },
      );
    } catch {
      return apiError("auth_provider_review_decision_unavailable", 503);
    }
  });
}
