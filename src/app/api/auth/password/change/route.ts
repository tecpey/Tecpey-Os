import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { withDb, withTx } from "@/lib/db";
import {
  hashPassword,
  verifyPassword,
  isPasswordReused,
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
  registerSession,
  revokeSessionStrict,
} from "@/lib/security/session-store";
import {
  issueRefreshToken,
  setRefreshCookie,
  revokeAllRefreshTokensForUser,
  ACCESS_COOKIE_TTL_S,
} from "@/lib/security/refresh-tokens";
import { shouldUseSecureCookie, COOKIES } from "@/lib/platform-config";

export const dynamic = "force-dynamic";

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

    const passwordResult = await withDb(async (db) => {
      const result = await db.query<{ password_hash: string }>(
        `SELECT password_hash
           FROM academy_auth_accounts
          WHERE id = $1`,
        [userId],
      );
      const row = result.rows[0];
      if (!row) return { ok: false as const, reason: "user_not_found" };
      if (!verifyPassword(currentPassword, row.password_hash)) {
        return { ok: false as const, reason: "invalid_credentials" };
      }
      return { ok: true as const, currentHash: row.password_hash };
    });
    if (!passwordResult.enabled) return apiError("db_unavailable", 503);
    if (!passwordResult.value.ok) {
      return apiError(passwordResult.value.reason, 401);
    }
    const currentHash = passwordResult.value.currentHash;

    const reused = await isPasswordReused(userId, newPassword, 5);
    if (reused) return apiError("password_previously_used", 400);

    const newHash = hashPassword(newPassword);
    const updateResult = await withTx(async (client) => {
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
    });
    if (!updateResult.enabled) return apiError("db_unavailable", 503);

    const accessRevocation = await revokeSessionStrict(
      verifiedCurrent.jti,
      userId,
    );
    const refreshRevoked = await revokeAllRefreshTokensForUser(userId);
    if (!accessRevocation.ok || !refreshRevoked) {
      return apiError("credential_rotation_unavailable", 503, {
        accessReason: accessRevocation.ok ? null : accessRevocation.reason,
        refreshRevoked,
      });
    }

    const ip = getClientIp(req);
    const deviceInfo = (req.headers.get("user-agent") ?? "").slice(0, 500);
    const accessToken = await signUnifiedSession({
      accountId: session.academyAccountId ?? null,
      studentId: session.studentId ?? null,
      email: session.email ?? "",
      displayName: session.displayName ?? "",
      username: session.username ?? "",
    });
    const jti = extractJtiFromToken(accessToken);
    const exp = extractExpFromToken(accessToken);
    if (!jti || !exp) return apiError("session_issue_failed", 503);

    const refreshToken = await issueRefreshToken({
      userId,
      familyId: crypto.randomUUID(),
      deviceInfo,
      ip,
    });
    if (!refreshToken) return apiError("refresh_session_unavailable", 503);

    const registered = await registerSession({
      jti,
      userId,
      deviceInfo,
      ip,
      expiresAt: new Date(exp * 1000),
    });
    if (!registered) {
      await revokeAllRefreshTokensForUser(userId);
      return apiError("session_registry_unavailable", 503);
    }

    trackAuthEvent("password_changed");
    writeAudit({
      actorId: userId,
      action: "password_changed",
      ip,
      userAgent: deviceInfo,
      metadata: { strengthScore: strength.score, sessionsRotated: true },
    });

    const response = apiOk({ changed: true });
    response.cookies.set(COOKIES.SESSION, accessToken, {
      path: "/",
      httpOnly: true,
      secure: shouldUseSecureCookie(),
      sameSite: "lax",
      maxAge: ACCESS_COOKIE_TTL_S,
    });
    setRefreshCookie(response, refreshToken);
    return response;
  });
}
