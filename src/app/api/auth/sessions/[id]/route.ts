import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { revokeSession } from "@/lib/security/session-store";
import { writeAudit } from "@/lib/security/audit-log";

export const dynamic = "force-dynamic";

// DELETE /api/auth/sessions/[id] — revoke a specific session by jti
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withObservability(req, { route: "/api/auth/sessions/[id]" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rl = await rateLimit(req, { namespace: "auth-revoke-session", limit: 20, windowMs: 60_000 });
    if (!rl.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.studentId ?? session.userId;
    if (!userId) return apiError("unauthorized", 401);

    const { id: sessionId } = await params;
    if (!sessionId) return apiError("invalid_input", 400);

    const revoked = await revokeSession(sessionId, userId);
    if (!revoked) return apiError("not_found", 404);

    writeAudit({
      actorId: userId,
      action: "session_revoked",
      resourceType: "session",
      resourceId: sessionId,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return apiOk({ revoked: true });
  });
}
