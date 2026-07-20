// POST /api/auth/2fa/disable — disable TOTP 2FA.
//
// Requires current TOTP code or admin override.
// Body: { "code": "123456" } or { "adminOverride": true } (admin only)

import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { withDb } from "@/lib/db";
import { decryptTotpSecret, verifyTotp } from "@/lib/security/totp";
import { writeAudit } from "@/lib/security/audit-log";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/2fa/disable" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, {
      namespace: "2fa-disable",
      limit: 5,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const ip = getClientIp(req);
    const boundedBodyRequest = await readBoundedJsonRequest(req, {
      maxBytes: 4_096,
      allowEmptyObject: true,
    });
    if (!boundedBodyRequest.ok) {
      return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
    }
    req = boundedBodyRequest.request;
    const body = await req.json().catch(() => ({}));
    const code = String(body.code ?? "").trim();
    const adminOverride = Boolean(body.adminOverride);

    // Admin can disable without TOTP code
    if (adminOverride && !session.isAdmin) {
      return apiError("forbidden", 403);
    }

    if (!adminOverride) {
      if (!/^\d{6}$/.test(code)) return apiError("invalid_code_format", 400);

      // Load and verify TOTP
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
        writeAudit({ actorId: userId, action: "2fa_disabled", ip, metadata: { success: false } });
        return apiError("invalid_totp_code", 401);
      }
    }

    // Disable 2FA
    await withDb(async (db) => {
      await db.query(
        `UPDATE user_2fa SET enabled = FALSE, enabled_at = NULL WHERE user_id = $1`,
        [userId],
      );
      return true;
    });

    writeAudit({
      actorId: userId,
      action: "2fa_disabled",
      ip,
      metadata: { success: true, adminOverride },
    });

    return apiOk({ disabled: true });
  });
}
