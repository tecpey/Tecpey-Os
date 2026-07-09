// POST /api/auth/password/change
// Change the current user's password with history check and strength validation.
//
// Body: { currentPassword, newPassword }
// Requires: authenticated session

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

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/password/change" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, { namespace: "password-change", limit: 5, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const body = await req.json().catch(() => ({}));
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!currentPassword || !newPassword) return apiError("missing_fields", 400);
    if (newPassword.length < 8) return apiError("password_too_short", 400);

    const strength = assessPasswordStrength(newPassword);
    if (strength.score < 4) {
      return apiError("password_too_weak", 400, { feedback: strength.feedback });
    }

    // Verify current password and update
    const dbResult = await withDb(async (db) => {
      const res = await db.query<{ password_hash: string }>(
        `SELECT password_hash FROM academy_auth_accounts WHERE id = $1`,
        [userId],
      );
      const row = res.rows[0];
      if (!row) return { ok: false as const, reason: "user_not_found" };
      if (!verifyPassword(currentPassword, row.password_hash)) {
        return { ok: false as const, reason: "invalid_credentials" };
      }
      return { ok: true as const, currentHash: row.password_hash };
    });

    if (!dbResult.enabled) return apiError("db_unavailable", 503);
    if (!dbResult.value.ok) return apiError(dbResult.value.reason, 401);

    // Check password history (prevent reuse of last 5)
    const reused = await isPasswordReused(userId, newPassword, 5);
    if (reused) return apiError("password_previously_used", 400);

    const newHash = hashPassword(newPassword);

    // Update password and record history atomically
    const updateResult = await withTx(async (client) => {
      await client.query(
        `UPDATE academy_auth_accounts SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [newHash, userId],
      );
      // Record old and new hashes in history, then prune in one batch
      await recordPasswordHistoryBatchWithClient(client, userId, [
        dbResult.value.currentHash!,
        newHash,
      ]);
    });

    if (!updateResult.enabled) return apiError("db_unavailable", 503);

    trackAuthEvent("password_changed");
    writeAudit({
      actorId: userId,
      action: "password_changed",
      ip: getClientIp(req),
      metadata: { strengthScore: strength.score },
    });

    return apiOk({ changed: true });
  });
}
