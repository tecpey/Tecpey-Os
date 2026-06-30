import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { getCanonicalSession } from "@/lib/auth-session";
import { listActiveSessions, revokeAllSessions } from "@/lib/security/session-store";
import { writeAudit } from "@/lib/security/audit-log";
import { extractJtiFromToken } from "@/lib/unified-session";
import { UNIFIED_SESSION_COOKIE } from "@/lib/unified-session";

export const dynamic = "force-dynamic";

// GET /api/auth/sessions — list the current user's active sessions
export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/sessions" }, async () => {
    const rl = await rateLimit(req, { namespace: "auth-sessions", limit: 30, windowMs: 60_000 });
    if (!rl.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    const userId = session.academyAccountId ?? session.studentId ?? session.userId;
    if (!userId) return apiError("unauthorized", 401);

    const sessions = await listActiveSessions(userId);
    return apiOk({ sessions });
  });
}

// DELETE /api/auth/sessions — logout all devices (revoke all sessions)
export async function DELETE(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/sessions" }, async () => {
    const rl = await rateLimit(req, { namespace: "auth-revoke-all", limit: 5, windowMs: 60_000 });
    if (!rl.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    const userId = session.academyAccountId ?? session.studentId ?? session.userId;
    if (!userId) return apiError("unauthorized", 401);

    // Keep the current session active (so the user can still make requests)
    const currentJti = extractJtiFromToken(
      req.cookies.get(UNIFIED_SESSION_COOKIE)?.value ?? "",
    );

    const revokedCount = await revokeAllSessions(userId, currentJti ?? undefined);

    writeAudit({
      actorId: userId,
      action: "logout_all",
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
      metadata: { revokedCount },
    });

    return apiOk({ revokedCount });
  });
}
