import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { listActiveSessionsStrict } from "@/lib/security/session-store";
import { revokeOtherSessionsAuthority } from "@/lib/security/session-authority";
import {
  extractJtiFromToken,
  UNIFIED_SESSION_COOKIE,
} from "@/lib/unified-session";
import { PLATFORM } from "@/lib/platform-config";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
} from "@/lib/security/sensitive-mutation-audit";

export const dynamic = "force-dynamic";

// GET /api/auth/sessions — list the current user's active sessions.
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

// DELETE /api/auth/sessions — revoke every other session while retaining the
// current access session and its bound refresh family.
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

    const correlationId = resolveSensitiveAuditCorrelation(
      req.headers.get("x-tecpey-request-id"),
    );
    let result;
    try {
      result = await revokeOtherSessionsAuthority({
        userId,
        currentSessionJti: currentJti,
        audit: {
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          actorType: "user",
          actorId: userId,
          correlationId,
          requestHash: hashSensitiveAuditRequest({
            tenantId: PLATFORM.DEFAULT_TENANT_ID,
            action: "session.revoke_all",
            userId,
            currentSessionFingerprintVersion: 1,
          }),
        },
      });
    } catch {
      return apiError("session_revocation_unavailable", 503);
    }

    return apiOk({
      revokedCount: result.revokedCount,
      currentAccessRetained: true,
      currentRefreshFamilyRetained: true,
      revocationPending: result.revocationPending,
    });
  });
}
