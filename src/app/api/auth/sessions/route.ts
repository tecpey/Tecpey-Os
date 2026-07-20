import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { listActiveSessionsStrict } from "@/lib/security/session-store";
import { revokeAllUserSessions } from "@/lib/security/session-authority";
import { buildSessionAuditContext } from "@/lib/security/session-route-context";
import {
  extractJtiFromToken,
  UNIFIED_SESSION_COOKIE,
} from "@/lib/unified-session";

export const dynamic = "force-dynamic";

// GET /api/auth/sessions — list the current user's active sessions
export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/sessions" }, async () => {
    const rl = await rateLimit(req, {
      namespace: "auth-sessions",
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.studentId ?? session.userId;
    if (!userId) return apiError("unauthorized", 401);

    const result = await listActiveSessionsStrict(userId);
    if (!result.ok) {
      return apiError("session_registry_unavailable", 503, {
        reason: result.reason,
      });
    }
    return apiOk({ sessions: result.sessions });
  });
}

// DELETE /api/auth/sessions — retain the current short-lived access token while
// atomically revoking every other access session and all refresh authority.
export async function DELETE(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/sessions" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rl = await rateLimit(req, {
      namespace: "auth-revoke-all",
      limit: 5,
      windowMs: 60_000,
    });
    if (!rl.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.studentId ?? session.userId;
    if (!userId) return apiError("unauthorized", 401);

    const currentToken = req.cookies.get(UNIFIED_SESSION_COOKIE)?.value ?? "";
    const currentJti = extractJtiFromToken(currentToken);
    if (!currentJti) return apiError("invalid_session", 401);

    const actorType = session.isAdmin
      ? "admin" as const
      : session.userId
        ? "user" as const
        : "student" as const;
    const result = await revokeAllUserSessions({
      userId,
      exceptSessionId: currentJti,
      audit: buildSessionAuditContext({
        req,
        userId,
        actorType,
        action: "session.revoke_all",
        evidence: { currentSessionId: currentJti },
      }),
    });
    if (!result.ok) {
      return apiError("session_revocation_unavailable", 503, {
        reason: result.reason,
      });
    }

    return apiOk({
      revokedCount: result.revokedCount,
      currentAccessRetained: true,
      refreshRevoked: true,
      denyCachePending: result.denyCachePending,
    });
  });
}
