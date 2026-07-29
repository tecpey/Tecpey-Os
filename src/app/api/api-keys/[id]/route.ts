import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { PLATFORM } from "@/lib/platform-config";
import { setApiKeyActive, deleteApiKey, rotateApiKey } from "@/lib/security/api-keys";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
} from "@/lib/security/sensitive-mutation-audit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

function actorTypeForSession(session: Awaited<ReturnType<typeof getCanonicalSession>>) {
  return session.userId ? "user" as const : "student" as const;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withObservability(req, { route: "/api/api-keys/[id]" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "api-keys-update",
      limit: 20,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.studentId ?? session.userId;
    if (!userId) return apiError("unauthorized", 401);
    const actorType = actorTypeForSession(session);
    const { id: keyId } = await params;

    const boundedBodyRequest = await readBoundedJsonRequest(req, {
      maxBytes: 4_096,
    });
    if (!boundedBodyRequest.ok) {
      return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
    }
    req = boundedBodyRequest.request;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("invalid_input", 400);
    }

    const action = (body as Record<string, unknown>).action;
    if (action !== "disable" && action !== "enable" && action !== "rotate") {
      return apiError("invalid_action", 400);
    }

    const correlationId = resolveSensitiveAuditCorrelation(
      req.headers.get("x-tecpey-request-id"),
    );
    const requestHash = hashSensitiveAuditRequest({
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      actorType,
      actorId: userId,
      action: `api_key.${action}`,
      resourceType: "api_key",
      resourceId: keyId,
    });
    const audit = {
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      actorType,
      actorId: userId,
      correlationId,
      requestHash,
    };

    try {
      if (action === "disable" || action === "enable") {
        const updated = await setApiKeyActive(
          keyId,
          userId,
          action === "enable",
          audit,
        );
        if (!updated) return apiError("not_found", 404);
        return apiOk({ updated: true });
      }

      const rotated = await rotateApiKey(keyId, userId, audit);
      if (!rotated) return apiError("not_found", 404);
      return apiOk({ plaintext: rotated.plaintext });
    } catch {
      return apiError("api_key_service_unavailable", 503);
    }
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withObservability(req, { route: "/api/api-keys/[id]" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "api-keys-delete",
      limit: 20,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.studentId ?? session.userId;
    if (!userId) return apiError("unauthorized", 401);
    const actorType = actorTypeForSession(session);
    const { id: keyId } = await params;

    const correlationId = resolveSensitiveAuditCorrelation(
      req.headers.get("x-tecpey-request-id"),
    );
    const requestHash = hashSensitiveAuditRequest({
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      actorType,
      actorId: userId,
      action: "api_key.delete",
      resourceType: "api_key",
      resourceId: keyId,
    });

    try {
      const deleted = await deleteApiKey(keyId, userId, {
        tenantId: PLATFORM.DEFAULT_TENANT_ID,
        actorType,
        actorId: userId,
        correlationId,
        requestHash,
      });
      if (!deleted) return apiError("not_found", 404);
      return apiOk({ deleted: true });
    } catch {
      return apiError("api_key_service_unavailable", 503);
    }
  });
}
