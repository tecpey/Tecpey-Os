import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { revokeExactSession } from "@/lib/security/session-authority";
import { buildSessionAuditContext } from "@/lib/security/session-route-context";

export const dynamic = "force-dynamic";

// DELETE /api/auth/sessions/[id] — atomically revoke a specific access session
// and the refresh family durably bound to that session.
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

    const actorType = session.isAdmin
      ? "admin" as const
      : session.userId
        ? "user" as const
        : "student" as const;
    const result = await revokeExactSession({
      sessionId,
      userId,
      audit: buildSessionAuditContext({
        req,
        userId,
        actorType,
        action: "session.revoke",
        evidence: { sessionId },
      }),
    });
    if (!result.ok) {
      if (result.reason === "session_not_found") return apiError("not_found", 404);
      return apiError("session_revocation_unavailable", 503, {
        reason: result.reason,
      });
    }

    return apiOk({
      revoked: true,
      revokedCount: result.revokedCount,
      refreshRevoked: true,
      refreshScope: "bound_family",
      denyCachePending: result.denyCachePending,
    });
  });
}
