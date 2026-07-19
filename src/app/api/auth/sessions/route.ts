import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import {
  listActiveSessionsStrict,
  revokeAllSessionsStrict,
} from "@/lib/security/session-store";
import { revokeAllRefreshTokensForUser } from "@/lib/security/refresh-tokens";
import { writeAudit } from "@/lib/security/audit-log";
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

// DELETE /api/auth/sessions — revoke other access sessions and all refresh authority.
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

    // Keep the current access token active for the remainder of its short TTL,
    // but revoke every other access session and all refresh tokens. Until access
    // tokens are bound to a refresh family, retaining one current refresh token
    // cannot be proven safely, so refresh authority is revoked security-first.
    const accessResult = await revokeAllSessionsStrict(userId, currentJti);
    const refreshRevoked = await revokeAllRefreshTokensForUser(userId);

    if (!accessResult.ok || !refreshRevoked) {
      writeAudit({
        actorId: userId,
        action: "logout_all",
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
        userAgent: req.headers.get("user-agent") ?? undefined,
        metadata: {
          outcome: "failed",
          accessReason: accessResult.ok ? null : accessResult.reason,
          revokedCount: accessResult.revokedCount,
          refreshRevoked,
        },
      });
      return apiError("session_revocation_unavailable", 503, {
        accessReason: accessResult.ok ? null : accessResult.reason,
        revokedCount: accessResult.revokedCount,
        refreshRevoked,
      });
    }

    writeAudit({
      actorId: userId,
      action: "logout_all",
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
      metadata: {
        outcome: "success",
        revokedCount: accessResult.revokedCount,
        currentAccessRetained: true,
        refreshScope: "all_user_tokens",
      },
    });

    return apiOk({
      revokedCount: accessResult.revokedCount,
      currentAccessRetained: true,
      refreshRevoked: true,
    });
  });
}
