import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { withTx } from "@/lib/db";
import {
  hashPassword,
  verifyPassword,
  isPasswordReusedWithClient,
  recordPasswordHistoryBatchWithClient,
  assessPasswordStrength,
} from "@/lib/security/passwords";
import { writeAudit } from "@/lib/security/audit-log";
import { trackAuthEvent } from "@/lib/security/auth-metrics";
import {
  signUnifiedSession,
  verifyUnifiedSession,
  extractJtiFromToken,
  extractExpFromToken,
} from "@/lib/unified-session";
import {
  registerSessionWithClient,
  revokeAllSessionsWithClient,
  type RevokedSessionEvidence,
} from "@/lib/security/session-store";
import { revokeMultiple } from "@/lib/security/jti-store";
import {
  prepareRefreshToken,
  persistPreparedRefreshTokenWithClient,
  setRefreshCookie,
  clearRefreshCookie,
  revokeAllRefreshTokensForUserWithClient,
  ACCESS_COOKIE_TTL_S,
} from "@/lib/security/refresh-tokens";
import { shouldUseSecureCookie, COOKIES } from "@/lib/platform-config";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

type RotationTransactionResult =
  | {
      ok: true;
      revokedAccessSessions: number;
      revokedAccessEvidence: RevokedSessionEvidence[];
      revokedRefreshTokens: number;
    }
  | {
      ok: false;
      status: 400 | 401;
      error: "user_not_found" | "invalid_credentials" | "password_previously_used";
    };

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/password/change" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "password-change",
      limit: 5,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const currentToken = req.cookies.get(COOKIES.SESSION)?.value;
    const verifiedCurrent = await verifyUnifiedSession(currentToken);
    if (
      !currentToken ||
      !verifiedCurrent?.jti ||
      (verifiedCurrent.accountId ?? verifiedCurrent.studentId) !== userId
    ) {
      return apiError("invalid_session", 401);
    }

    const boundedBodyRequest = await readBoundedJsonRequest(req, {
      maxBytes: 8_192,
    });
    if (!boundedBodyRequest.ok) {
      return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
    }
    req = boundedBodyRequest.request;
    const body = await req.json().catch(() => ({}));
    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : "";
    if (!currentPassword || !newPassword) return apiError("missing_fields", 400);
    if (newPassword.length < 8) return apiError("password_too_short", 400);

    const strength = assessPasswordStrength(newPassword);
    if (strength.score < 4) {
      return apiError("password_too_weak", 400, {
        feedback: strength.feedback,
      });
    }

    const ip = getClientIp(req);
    const deviceInfo = (req.headers.get("user-agent") ?? "").slice(0, 500);
    const newHash = hashPassword(newPassword);

    // Tokens are signed before the transaction, but are not valid until their
    // durable rows are inserted and the transaction commits.
    const accessToken = await signUnifiedSession({
      accountId: session.academyAccountId ?? null,
      studentId: session.studentId ?? null,
      email: session.email ?? "",
      displayName: session.displayName ?? "",
      username: session.username ?? "",
    });
    const accessJti = extractJtiFromToken(accessToken);
    const accessExp = extractExpFromToken(accessToken);
    if (!accessJti || !accessExp) return apiError("session_issue_failed", 503);

    const preparedRefresh = await prepareRefreshToken({
      userId,
      familyId: crypto.randomUUID(),
      deviceInfo,
      ip,
    });
    if (!preparedRefresh) return apiError("refresh_session_unavailable", 503);

    let transaction;
    try {
      transaction = await withTx<RotationTransactionResult>(async (client) => {
        const account = await client.query<{ password_hash: string }>(
          `SELECT password_hash
             FROM academy_auth_accounts
            WHERE id = $1
            FOR UPDATE`,
          [userId],
        );
        const currentHash = account.rows[0]?.password_hash;
        if (!currentHash) {
          return { ok: false, status: 401, error: "user_not_found" };
        }
        if (!verifyPassword(currentPassword, currentHash)) {
          return { ok: false, status: 401, error: "invalid_credentials" };
        }

        const reusedCurrent = verifyPassword(newPassword, currentHash);
        const reusedHistory = await isPasswordReusedWithClient(
          client,
          userId,
          newPassword,
          5,
        );
        if (reusedCurrent || reusedHistory) {
          return {
            ok: false,
            status: 400,
            error: "password_previously_used",
          };
        }

        await client.query(
          `UPDATE academy_auth_accounts
              SET password_hash = $1,
                  updated_at = NOW()
            WHERE id = $2`,
          [newHash, userId],
        );
        await recordPasswordHistoryBatchWithClient(client, userId, [
          currentHash,
          newHash,
        ]);

        const revokedAccess = await revokeAllSessionsWithClient(client, userId);
        const revokedRefreshTokens =
          await revokeAllRefreshTokensForUserWithClient(client, userId);

        const refreshInserted = await persistPreparedRefreshTokenWithClient(
          client,
          preparedRefresh,
        );
        if (!refreshInserted) throw new Error("replacement_refresh_insert_failed");

        const accessInserted = await registerSessionWithClient(client, {
          jti: accessJti,
          userId,
          deviceInfo,
          ip,
          expiresAt: new Date(accessExp * 1000),
        });
        if (!accessInserted) throw new Error("replacement_access_insert_failed");

        return {
          ok: true,
          revokedAccessSessions: revokedAccess.revokedCount,
          revokedAccessEvidence: revokedAccess.sessions,
          revokedRefreshTokens,
        };
      });
    } catch (err) {
      writeAudit({
        actorId: userId,
        action: "password_changed",
        ip,
        userAgent: deviceInfo,
        metadata: {
          outcome: "rolled_back",
          reason: err instanceof Error ? err.message : "transaction_failed",
        },
      });
      return apiError("credential_rotation_unavailable", 503, {
        rolledBack: true,
      });
    }

    if (!transaction.enabled) {
      return apiError("credential_rotation_unavailable", 503, {
        rolledBack: true,
        reason: "database_unavailable",
      });
    }
    if (!transaction.value.ok) {
      return apiError(transaction.value.error, transaction.value.status);
    }

    // PostgreSQL has already revoked every old credential. Redis is only fast
    // deny evidence; if synchronization fails, clear browser credentials and
    // require reauthentication rather than claiming a complete rotation.
    const redisSynchronized = await revokeMultiple(
      transaction.value.revokedAccessEvidence,
    );
    if (
      !redisSynchronized &&
      transaction.value.revokedAccessEvidence.length > 0
    ) {
      const response = apiError("credential_rotation_cache_unavailable", 503, {
        changed: true,
        credentialsRevoked: true,
        reauthenticationRequired: true,
      });
      response.cookies.delete(COOKIES.SESSION);
      clearRefreshCookie(response);
      writeAudit({
        actorId: userId,
        action: "password_changed",
        ip,
        userAgent: deviceInfo,
        metadata: {
          outcome: "durable_success_cache_sync_failed",
          revokedAccessSessions: transaction.value.revokedAccessSessions,
          revokedRefreshTokens: transaction.value.revokedRefreshTokens,
        },
      });
      return response;
    }

    trackAuthEvent("password_changed");
    writeAudit({
      actorId: userId,
      action: "password_changed",
      ip,
      userAgent: deviceInfo,
      metadata: {
        outcome: "success",
        strengthScore: strength.score,
        sessionsRotated: true,
        revokedAccessSessions: transaction.value.revokedAccessSessions,
        revokedRefreshTokens: transaction.value.revokedRefreshTokens,
        refreshScope: "all_user_tokens",
        atomic: true,
      },
    });

    const response = apiOk({
      changed: true,
      sessionsRotated: true,
      revokedAccessSessions: transaction.value.revokedAccessSessions,
      revokedRefreshTokens: transaction.value.revokedRefreshTokens,
      atomic: true,
    });
    response.cookies.set(COOKIES.SESSION, accessToken, {
      path: "/",
      httpOnly: true,
      secure: shouldUseSecureCookie(),
      sameSite: "lax",
      maxAge: ACCESS_COOKIE_TTL_S,
    });
    setRefreshCookie(response, preparedRefresh.token);
    return response;
  });
}
