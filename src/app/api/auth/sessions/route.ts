import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { withTx } from "@/lib/db";
import { PLATFORM } from "@/lib/platform-config";
import {
  listActiveSessionsStrict,
  revokeAllSessionsWithClient,
  type RevokedSessionEvidence,
} from "@/lib/security/session-store";
import {
  revokeAllRefreshTokensForUserWithClient,
  clearRefreshCookie,
} from "@/lib/security/refresh-tokens";
import { revokeMultiple } from "@/lib/security/jti-store";
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

type BulkRevocationCommand = {
  revokedAccessSessions: number;
  accessEvidence: RevokedSessionEvidence[];
  revokedRefreshTokens: number;
};

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/sessions" }, async () => {
    const limit = await rateLimit(req, {
      namespace: "auth-sessions",
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

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

export async function DELETE(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/sessions" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "auth-revoke-all",
      limit: 5,
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

    const currentSessionEvidenceHash = hashSensitiveAuditRequest({ jti: currentJti });
    const correlationId = resolveSensitiveAuditCorrelation(
      req.headers.get("x-tecpey-request-id"),
    );
    const requestHash = hashSensitiveAuditRequest({
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      actorType,
      actorId: userId,
      action: "session.revoke_others",
      currentSessionEvidenceHash,
      accessScope: "all_other_access_sessions",
      refreshScope: "all_user_tokens",
    });

    let transaction;
    try {
      transaction = await withTx<BulkRevocationCommand>(async (client) => {
        const access = await revokeAllSessionsWithClient(client, userId, currentJti);
        const revokedRefreshTokens =
          await revokeAllRefreshTokensForUserWithClient(client, userId);

        await writeSensitiveMutationAuditTx(client, {
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          actorType,
          actorId: userId,
          action: "session.revoke_others",
          resourceType: "session_authority",
          resourceId: userId,
          outcome: "success",
          correlationId,
          requestHash,
          metadata: {
            policyVersion: "session-revocation-v1",
            accessScope: "all_other_access_sessions",
            currentAccessRetained: true,
            refreshScope: "all_user_tokens",
            currentSessionEvidenceHash,
          },
        });

        return {
          revokedAccessSessions: access.revokedCount,
          accessEvidence: access.sessions,
          revokedRefreshTokens,
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

    const redisProjected =
      transaction.value.accessEvidence.length === 0 ||
      await revokeMultiple(transaction.value.accessEvidence);
    if (!redisProjected) {
      const response = apiError("session_revocation_cache_unavailable", 503, {
        changed: true,
        revokedAccessSessions: transaction.value.revokedAccessSessions,
        currentAccessRetained: true,
        refreshAuthorityRevoked: true,
        reauthenticationRequired: false,
      });
      clearRefreshCookie(response);
      return response;
    }

    const response = apiOk({
      revokedCount: transaction.value.revokedAccessSessions,
      currentAccessRetained: true,
      refreshRevoked: true,
      refreshRevokedCount: transaction.value.revokedRefreshTokens,
      atomic: true,
    });
    clearRefreshCookie(response);
    return response;
  });
}
