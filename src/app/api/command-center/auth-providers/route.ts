import { NextRequest } from "next/server";
import { apiError, apiOk, Validate } from "@/lib/api-validation";
import { authorizeAdminRequest } from "@/lib/admin-control-plane";
import {
  evaluateAuthProviderUpdate,
  isAuthProviderEvidenceGateId,
  isAuthProviderId,
  resolveAuthProviderControlSnapshot,
} from "@/lib/admin-auth-provider-control-plane";
import {
  applyAuthProviderEvidenceMutation,
  loadAuthProviderEvidenceByProvider,
  loadAuthProviderReviewRequestsByProvider,
  submitAuthProviderReviewRequest,
} from "@/lib/admin-auth-provider-evidence-store";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/auth-providers" }, async () => {
    const limit = await rateLimit(req, {
      namespace: "command-center-auth-providers-read",
      limit: 60,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const authorization = await authorizeAdminRequest(req, "admin.roles.read");
    if (!authorization.ok) return apiError(authorization.error, authorization.status);
    const evidenceByProvider = await loadAuthProviderEvidenceByProvider({
      tenantId: authorization.principal.tenantId,
      workspaceId: authorization.principal.workspaceId,
    });
    if (evidenceByProvider === "unavailable") {
      return apiError("auth_provider_evidence_unavailable", 503);
    }
    const reviewRequestsByProvider = await loadAuthProviderReviewRequestsByProvider({
      tenantId: authorization.principal.tenantId,
      workspaceId: authorization.principal.workspaceId,
    });
    if (reviewRequestsByProvider === "unavailable") {
      return apiError("auth_provider_review_requests_unavailable", 503);
    }

    return apiOk(
      {
        configured: true,
        tenantId: authorization.principal.tenantId,
        workspaceId: authorization.principal.workspaceId,
        snapshot: resolveAuthProviderControlSnapshot({ evidenceByProvider }),
        reviewRequestsByProvider,
      },
      200,
      { "Cache-Control": "no-store, max-age=0" },
    );
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/auth-providers" }, async () => {
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "command-center-auth-providers-write",
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
    const body = boundedBodyRequest.value as { providerId?: unknown; requestedState?: unknown };
    const rawProviderId = body?.providerId;
    const providerId = isAuthProviderId(rawProviderId) ? rawProviderId : null;
    const requestedState = Validate.oneOf(body?.requestedState, ["enabled", "disabled"] as const);

    if (!providerId || !requestedState) {
      return apiError("invalid_auth_provider_control_request", 400);
    }

    const evidenceByProvider = await loadAuthProviderEvidenceByProvider({
      tenantId: authorization.principal.tenantId,
      workspaceId: authorization.principal.workspaceId,
    });
    if (evidenceByProvider === "unavailable") {
      return apiError("auth_provider_evidence_unavailable", 503);
    }

    const decision = evaluateAuthProviderUpdate({
      providerId,
      requestedState,
      evidence: evidenceByProvider[providerId],
    });
    if (!decision.ok) {
      return apiError(decision.error, decision.httpStatus, {
        providerId: decision.providerId,
        requestedState: decision.requestedState,
        missingGateIds: decision.missingGateIds,
      });
    }

    try {
      const reviewRequest = await submitAuthProviderReviewRequest({
        tenantId: authorization.principal.tenantId,
        workspaceId: authorization.principal.workspaceId,
        actorAdminId: authorization.principal.adminId,
        sessionId: authorization.principal.sessionId,
        effectiveRoles: authorization.principal.roles,
        providerId,
        requestedState,
        requestId: req.headers.get("x-tecpey-request-id") ?? null,
        sourceIp: getClientIp(req),
        userAgent: (req.headers.get("user-agent") ?? "").slice(0, 500),
      });
      if (!reviewRequest.ok) {
        return apiError(reviewRequest.error, reviewRequest.httpStatus);
      }

      return apiOk(
        {
          decision,
          reviewRequest,
        },
        202,
        { "Cache-Control": "no-store, max-age=0" },
      );
    } catch {
      return apiError("auth_provider_review_request_unavailable", 503);
    }
  });
}

export async function PATCH(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/auth-providers" }, async () => {
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "command-center-auth-providers-evidence-write",
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const authorization = await authorizeAdminRequest(req, "admin.roles.manage", {
      stepUpWithinSeconds: 300,
    });
    if (!authorization.ok) return apiError(authorization.error, authorization.status);

    const boundedBodyRequest = await readBoundedJsonRequest(req, { maxBytes: 12_288 });
    if (!boundedBodyRequest.ok) {
      return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
    }
    req = boundedBodyRequest.request;
    const body = boundedBodyRequest.value as {
      providerId?: unknown;
      gateId?: unknown;
      action?: unknown;
      evidenceRef?: unknown;
      evidenceSha256?: unknown;
      expiresAt?: unknown;
      decisionNote?: unknown;
    };
    const providerId = isAuthProviderId(body?.providerId) ? body.providerId : null;
    const gateId = isAuthProviderEvidenceGateId(body?.gateId) ? body.gateId : null;
    const action = Validate.oneOf(body?.action, ["mark_missing", "mark_ready", "reject", "expire"] as const);

    if (!providerId || !gateId || !action) {
      return apiError("invalid_auth_provider_evidence_request", 400);
    }

    try {
      const decision = await applyAuthProviderEvidenceMutation({
        tenantId: authorization.principal.tenantId,
        workspaceId: authorization.principal.workspaceId,
        actorAdminId: authorization.principal.adminId,
        providerId,
        gateId,
        action,
        evidenceRef: typeof body?.evidenceRef === "string" ? body.evidenceRef : null,
        evidenceSha256: typeof body?.evidenceSha256 === "string" ? body.evidenceSha256 : null,
        expiresAt: typeof body?.expiresAt === "string" ? body.expiresAt : null,
        decisionNote: typeof body?.decisionNote === "string" ? body.decisionNote : null,
      });
      if (!decision.ok) {
        return apiError(decision.error, decision.httpStatus);
      }

      return apiOk(
        {
          decision,
          snapshot: resolveAuthProviderControlSnapshot({
            evidenceByProvider: decision.evidenceByProvider,
          }),
        },
        202,
        { "Cache-Control": "no-store, max-age=0" },
      );
    } catch {
      return apiError("auth_provider_evidence_write_failed", 500);
    }
  });
}
