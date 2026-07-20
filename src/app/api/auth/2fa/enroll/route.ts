import { readJsonBody } from "@/lib/security/request-body";
// GET  /api/auth/2fa/enroll — generate TOTP secret + QR code URI + backup codes.
// POST /api/auth/2fa/enroll — verify the first TOTP code and enable 2FA.
//
// Flow:
//   1. GET  → generate secret, encrypt + store (pending), return QR URI + backup codes
//   2. POST → user submits TOTP code, verify, mark enabled = TRUE
//
// Security:
//   - Secret is AES-256-GCM encrypted at rest (TECPEY_2FA_SECRET required)
//   - Backup codes are HMAC-SHA256 hashed (plain returned once only)
//   - 2FA is only confirmed after the first successful verification (prevent ghost enrollments)

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { withDb } from "@/lib/db";
import {
  generateTotpSecret,
  encryptTotpSecret,
  decryptTotpSecret,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
  buildOtpAuthUri,
} from "@/lib/security/totp";
import { writeAudit } from "@/lib/security/audit-log";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// GET: generate enrollment data
export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/2fa/enroll" }, async () => {
    const rlimit = await rateLimit(req, { namespace: "2fa-enroll-get", limit: 10, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    // Check if already enabled
    const existing = await withDb(async (db) => {
      const r = await db.query<{ enabled: boolean }>(
        `SELECT enabled FROM user_2fa WHERE user_id = $1`,
        [userId],
      );
      return r.rows[0] ?? null;
    });
    if (existing.enabled && existing.value?.enabled) {
      return apiError("2fa_already_enabled", 409);
    }

    // Generate new secret
    const rawSecret = generateTotpSecret();
    const encryptedSecret = encryptTotpSecret(rawSecret);
    const backupCodes = generateBackupCodes();
    const backupCodeHashes = backupCodes.map(hashBackupCode);

    // Store (or replace) pending 2FA record with enabled=false
    await withDb(async (db) => {
      await db.query(
        `INSERT INTO user_2fa (user_id, encrypted_secret, backup_code_hashes, enabled)
         VALUES ($1, $2, $3, FALSE)
         ON CONFLICT (user_id) DO UPDATE
           SET encrypted_secret = EXCLUDED.encrypted_secret,
               backup_code_hashes = EXCLUDED.backup_code_hashes,
               enabled = FALSE,
               enabled_at = NULL`,
        [userId, encryptedSecret, backupCodeHashes],
      );
      return true;
    });

    const accountName = session.email ?? session.username ?? userId;
    const otpAuthUri = buildOtpAuthUri({ secret: rawSecret, accountName });

    return apiOk({
      otpAuthUri,
      secret: rawSecret,   // shown once for manual entry
      backupCodes,         // shown once — user must save these
    });
  });
}

// POST: confirm enrollment with first TOTP code
export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/2fa/enroll" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, { namespace: "2fa-enroll-post", limit: 10, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const bodyResult = await readJsonBody(req, {
      maxBytes: 8_192,
      allowEmptyObject: true,
    });
    if (!bodyResult.ok) return apiError(bodyResult.error, bodyResult.status);
    const body = bodyResult.value;
    const code = String(body.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) return apiError("invalid_code_format", 400);

    const ip = getClientIp(req);

    // Load pending secret
    const r = await withDb(async (db) => {
      const result = await db.query<{ encrypted_secret: string; enabled: boolean }>(
        `SELECT encrypted_secret, enabled FROM user_2fa WHERE user_id = $1`,
        [userId],
      );
      return result.rows[0] ?? null;
    });

    if (!r.enabled || !r.value) return apiError("2fa_enrollment_not_started", 404);
    if (r.value.enabled) return apiError("2fa_already_enabled", 409);

    let rawSecret: string;
    try {
      rawSecret = decryptTotpSecret(r.value.encrypted_secret);
    } catch {
      return apiError("2fa_secret_corrupt", 500);
    }

    if (!verifyTotp(rawSecret, code)) {
      writeAudit({ actorId: userId, action: "2fa_enabled", ip, metadata: { success: false } });
      return apiError("invalid_totp_code", 401);
    }

    // Enable 2FA
    await withDb(async (db) => {
      await db.query(
        `UPDATE user_2fa SET enabled = TRUE, enabled_at = NOW(), last_used_at = NOW()
         WHERE user_id = $1`,
        [userId],
      );
      return true;
    });

    writeAudit({ actorId: userId, action: "2fa_enabled", ip, metadata: { success: true } });

    return apiOk({ enabled: true });
  });
}
