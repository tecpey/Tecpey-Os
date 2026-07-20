// POST /api/auth/2fa/backup — use a backup code to verify identity.
//
// Backup codes are one-time use. On successful use, the code is removed from
// the stored hashes so it cannot be reused.
//
// Body: { "code": "XXXXXXXX" }
//
// Returns: { verified: true, remainingCodes: N }

import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { withDb } from "@/lib/db";
import { findBackupCode } from "@/lib/security/totp";
import { writeAudit } from "@/lib/security/audit-log";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/2fa/backup" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, {
      namespace: "2fa-backup",
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
    const code = String(body.code ?? "").trim().toUpperCase();

    if (!code || code.length < 6) return apiError("invalid_code_format", 400);

    const r = await withDb(async (db) => {
      const result = await db.query<{ backup_code_hashes: string[]; enabled: boolean }>(
        `SELECT backup_code_hashes, enabled FROM user_2fa WHERE user_id = $1 AND enabled = TRUE`,
        [userId],
      );
      return result.rows[0] ?? null;
    });

    if (!r.enabled || !r.value) return apiError("2fa_not_enabled", 404);

    const hashes = r.value.backup_code_hashes;
    const matchIdx = findBackupCode(code, hashes);

    if (matchIdx === -1) {
      writeAudit({ actorId: userId, action: "2fa_disabled", ip, metadata: { event: "backup_failed" } });
      return apiError("invalid_backup_code", 401);
    }

    // Remove used code
    const newHashes = [...hashes.slice(0, matchIdx), ...hashes.slice(matchIdx + 1)];

    await withDb(async (db) => {
      await db.query(
        `UPDATE user_2fa SET backup_code_hashes = $2, last_used_at = NOW() WHERE user_id = $1`,
        [userId, newHashes],
      );
      return true;
    });

    writeAudit({
      actorId: userId,
      action: "2fa_enabled",
      ip,
      metadata: { event: "backup_code_used", remainingCodes: newHashes.length },
    });

    return apiOk({ verified: true, remainingCodes: newHashes.length });
  });
}
