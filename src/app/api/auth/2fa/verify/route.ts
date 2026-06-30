// POST /api/auth/2fa/verify — verify a TOTP code for the current session.
//
// Used in two contexts:
//   1. 2FA re-prompt after suspicious activity (risk engine escalation)
//   2. Pre-auth flow verification (after consuming a pre-auth token)
//
// Body:
//   { "code": "123456", "preAuthToken": "..." (optional) }
//
// If preAuthToken is present: consumed + full session issued.
// If no preAuthToken: just verifies the code against the current user's TOTP.

import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { withDb } from "@/lib/db";
import { decryptTotpSecret, verifyTotp, consumePreAuthToken } from "@/lib/security/totp";
import { writeAudit } from "@/lib/security/audit-log";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/2fa/verify" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, {
      namespace: "2fa-verify",
      limit: 10,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const body = await req.json().catch(() => ({}));
    const code = String(body.code ?? "").trim();
    const preAuthToken = String(body.preAuthToken ?? "").trim();

    if (!/^\d{6}$/.test(code)) return apiError("invalid_code_format", 400);

    const ip = getClientIp(req);

    let userId: string | null = null;

    if (preAuthToken) {
      // Pre-auth flow: consume the token to get userId
      userId = await consumePreAuthToken(preAuthToken);
      if (!userId) return apiError("preauth_token_invalid", 401);
    } else {
      // Re-verification flow: user must already be authenticated
      const session = await getCanonicalSession(req);
      userId = session.academyAccountId ?? session.userId ?? session.studentId ?? null;
      if (!userId) return apiError("authentication_required", 401);
    }

    // Load 2FA config
    const r = await withDb(async (db) => {
      const result = await db.query<{ encrypted_secret: string; enabled: boolean }>(
        `SELECT encrypted_secret, enabled FROM user_2fa WHERE user_id = $1 AND enabled = TRUE`,
        [userId],
      );
      return result.rows[0] ?? null;
    });

    if (!r.enabled || !r.value) return apiError("2fa_not_enabled", 404);

    let rawSecret: string;
    try {
      rawSecret = decryptTotpSecret(r.value.encrypted_secret);
    } catch {
      return apiError("2fa_secret_corrupt", 500);
    }

    if (!verifyTotp(rawSecret, code)) {
      writeAudit({ actorId: userId, action: "2fa_enabled", ip, metadata: { event: "verify_failed" } });
      return apiError("invalid_totp_code", 401);
    }

    // Update last used
    void withDb(async (db) => {
      await db.query(
        `UPDATE user_2fa SET last_used_at = NOW() WHERE user_id = $1`,
        [userId],
      );
      return true;
    });

    writeAudit({ actorId: userId, action: "2fa_enabled", ip, metadata: { event: "verify_ok" } });

    return apiOk({ verified: true, userId });
  });
}
