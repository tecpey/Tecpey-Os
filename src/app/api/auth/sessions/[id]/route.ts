import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { revokeSessionStrict } from "@/lib/security/session-store";
import { revokeAllRefreshTokensForUser } from "@/lib/security/refresh-tokens";
import { writeAudit } from "@/lib/security/audit-log";

export const dynamic = "force-dynamic";

// DELETE /api/auth/sessions/[id] — revoke a specific access session by JTI.
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

    const accessResult = await revokeSessionStrict(sessionId, userId);
    if (!accessResult.ok && accessResult.reason === "session_not_found") {
      return apiError("not_found", 404);
    }

    // Access sessions are not yet bound to one refresh-token family. Revoking
    // only the selected JTI would let that device immediately mint a new access
    // token. Security-first behavior therefore revokes all refresh authority for
    // the principal until family binding is implemented.
    const refreshRevoked = await revokeAllRefreshTokensForUser(userId);

    if (!accessResult.ok || !refreshRevoked) {
      writeAudit({
        actorId: userId,
        action: "session_revoked",
        resourceType: "session",
        resourceId: sessionId,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
        userAgent: req.headers.get("user-agent") ?? undefined,
        metadata: {
          outcome: "failed",
          accessReason: accessResult.ok ? null : accessResult.reason,
          refreshRevoked,
        },
      });
      return apiError("session_revocation_unavailable", 503, {
        accessReason: accessResult.ok ? null : accessResult.reason,
        refreshRevoked,
      });
    }

    writeAudit({
      actorId: userId,
      action: "session_revoked",
      resourceType: "session",
      resourceId: sessionId,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
      metadata: {
        outcome: "success",
        refreshScope: "all_user_tokens",
      },
    });

    return apiOk({
      revoked: true,
      refreshRevoked: true,
      refreshScope: "all_user_tokens",
    });
  });
}
