import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { withTx } from "@/lib/db";
import { PLATFORM } from "@/lib/platform-config";
import { revokeExactSessionWithClient } from "@/lib/security/session-revocation-authority";
import { revokeAllRefreshTokensForUserWithClient, clearRefreshCookie } from "@/lib/security/refresh-tokens";
import { revokeJti } from "@/lib/security/jti-store";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
  writeSensitiveMutationAuditTx,
} from "@/lib/security/sensitive-mutation-audit";
import {
  extractJtiFromToken,
  UNIFIED_SESSION_COOKIE,
} from "@/lib/unified-session";

export const dynamic = "force-dynamic";

type ExactRevocationCommand =
  | {
      ok: true;
      target: { jti: string; expiresAt: number };
      refreshRevokedCount: number;
      currentAccessRevoked: boolean;
    }
  | { ok: false; reason: "session_not_found" };

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
    const actorType = session.userId ? "user" as const : "student" as const;

    const currentToken = req.cookies.get(UNIFIED_SESSION_COOKIE)?.value ?? "";
    const currentJti = extractJtiFromToken(currentToken);
    if (!currentJti) return apiError("invalid_session", 401);

    const { id: sessionId } = await params;
    if (!sessionId || sessionId.length > 200) {
      return apiError("invalid_input", 400);
    }

    const targetSessionEvidenceHash = hashSensitiveAuditRequest({ sessionId });
    const currentSessionEvidenceHash = hashSensitiveAuditRequest({ jti: currentJti });
    const correlationId = resolveSensitiveAuditCorrelation(
      req.headers.get("x-tecpey-request-id"),
    );
    const requestHash = hashSensitiveAuditRequest({
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      actorType,
      actorId: userId,
      action: "session.revoke_one",
      targetSessionEvidenceHash,
      currentSessionEvidenceHash,
      refreshScope: "all_user_tokens",
    });

    let transaction;
    try {
      transaction = await withTx<ExactRevocationCommand>(async (client) => {
        const target = await revokeExactSessionWithClient(client, sessionId, userId);
        if (!target) return { ok: false, reason: "session_not_found" };

        const refreshRevokedCount =
          await revokeAllRefreshTokensForUserWithClient(client, userId);
        const currentAccessRevoked = sessionId === currentJti;

        await writeSensitiveMutationAuditTx(client, {
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          actorType,
          actorId: userId,
          action: "session.revoke_one",
          resourceType: "access_session",
          resourceId: targetSessionEvidenceHash,
          outcome: "success",
          correlationId,
          requestHash,
          metadata: {
            policyVersion: "session-revocation-v1",
            targetAccessRevoked: true,
            currentAccessRevoked,
            refreshScope: "all_user_tokens",
            currentSessionEvidenceHash,
            targetSessionEvidenceHash,
          },
        });

        return {
          ok: true,
          target,
          refreshRevokedCount,
          currentAccessRevoked,
        };
      });
    } catch {
      return apiError("session_revocation_unavailable", 503, {
        rolledBack: true,
      });
    }

    if (!transaction.enabled) {
      return apiError("session_revocation_unavailable", 503, {
        rolledBack: true,
        reason: "database_unavailable",
      });
    }
    if (!transaction.value.ok) return apiError("not_found", 404);

    const redisProjected = await revokeJti(
      transaction.value.target.jti,
      transaction.value.target.expiresAt,
    );
    if (!redisProjected) {
      const response = apiError("session_revocation_cache_unavailable", 503, {
        changed: true,
        targetAccessRevoked: true,
        currentAccessRevoked: transaction.value.currentAccessRevoked,
        refreshAuthorityRevoked: true,
        reauthenticationRequired: transaction.value.currentAccessRevoked,
      });
      clearRefreshCookie(response);
      if (transaction.value.currentAccessRevoked) {
        response.cookies.delete(UNIFIED_SESSION_COOKIE);
      }
      return response;
    }

    const response = apiOk({
      revoked: true,
      currentAccessRevoked: transaction.value.currentAccessRevoked,
      refreshRevoked: true,
      refreshRevokedCount: transaction.value.refreshRevokedCount,
      refreshScope: "all_user_tokens",
      atomic: true,
    });
    clearRefreshCookie(response);
    if (transaction.value.currentAccessRevoked) {
      response.cookies.delete(UNIFIED_SESSION_COOKIE);
    }
    return response;
  });
}
