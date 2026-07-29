import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { revokeSessionAuthority } from "@/lib/security/session-authority";
import { PLATFORM } from "@/lib/platform-config";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
} from "@/lib/security/sensitive-mutation-audit";

export const dynamic = "force-dynamic";

// DELETE /api/auth/sessions/[id] — revoke the exact owned access session and
// its bound refresh family through one durable authority transaction.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withObservability(req, { route: "/api/auth/sessions/[id]" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "auth-revoke-session",
      limit: 20,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.studentId ?? session.userId;
    if (!userId) return apiError("unauthorized", 401);

    const { id: sessionId } = await params;
    if (!sessionId || sessionId.length > 200) {
      return apiError("invalid_input", 400);
    }

    const correlationId = resolveSensitiveAuditCorrelation(
      req.headers.get("x-tecpey-request-id"),
    );
    let result;
    try {
      result = await revokeSessionAuthority({
        userId,
        sessionJti: sessionId,
        audit: {
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          actorType: "user",
          actorId: userId,
          correlationId,
          requestHash: hashSensitiveAuditRequest({
            tenantId: PLATFORM.DEFAULT_TENANT_ID,
            action: "session.revoke",
            userId,
            targetSessionFingerprintVersion: 1,
          }),
        },
      });
    } catch {
      return apiError("session_revocation_unavailable", 503);
    }

    if (!result.ok) return apiError("not_found", 404);
    return apiOk({
      revoked: true,
      revokedCount: result.revokedCount,
      refreshFamilyRevoked: true,
      revocationPending: result.revocationPending,
    });
  });
}
