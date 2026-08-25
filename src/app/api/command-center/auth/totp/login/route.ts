import { NextRequest } from "next/server";
import { apiError, apiOk, Validate } from "@/lib/api-validation";
import { createAdminControlSession, setAdminControlSessionCookie } from "@/lib/admin-passkey-service";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { verifyAdminPassword } from "@/lib/security/admin-password-totp";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { decryptTotpSecret, findBackupCode, verifyTotpStep } from "@/lib/security/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DUMMY_PASSWORD_HASH = "scrypt$32768$8$1$MDEyMzQ1Njc4OWFiY2RlZg$H_4riWNWz2_BY1yVto1iNOmtQODzpTFpXXdDVsWH_C0";

function normalizeRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string"))];
}

function normalizeHashes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && /^[0-9a-f]{64}$/.test(item));
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/auth/totp/login" }, async () => {
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    const limit = await rateLimit(req, { namespace: "admin-password-totp-login", limit: 10, windowMs: 10 * 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const bounded = await readBoundedJsonRequest(req, { maxBytes: 8_192 });
    if (!bounded.ok) return apiError(bounded.error, bounded.status);
    const body = await bounded.request.json().catch(() => ({}));
    const email = Validate.email(body.email);
    const password = typeof body.password === "string" && body.password.length <= 1024 ? body.password : null;
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!email || !password || (!/^\d{6}$/.test(code) && !/^[A-Z2-9]{8}$/.test(code))) {
      return apiError("admin_login_failed", 401);
    }
    const ip = getClientIp(req);
    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500);

    const result = await withTx(async (client) => {
      const query = await client.query<{
        id: string; email: string; display_name: string; permission_version: number;
        password_hash: string; encrypted_totp_secret: string; recovery_code_hashes: unknown;
        last_accepted_step: string | null; locked_until: Date | null; roles: unknown;
      }>(
        `SELECT u.id::text, u.email, u.display_name, u.permission_version,
                c.password_hash, c.encrypted_totp_secret, c.recovery_code_hashes,
                c.last_accepted_step::text, c.locked_until,
                COALESCE((
                  SELECT jsonb_agg(DISTINCT ur.role_id)
                    FROM admin_user_roles ur
                   WHERE ur.admin_id = u.id AND ur.revoked_at IS NULL
                ), '[]'::jsonb) AS roles
           FROM admin_users u
           JOIN admin_password_totp_credentials c ON c.admin_id = u.id
          WHERE u.email = $1 AND u.status = 'active' AND c.enrolled_at IS NOT NULL AND c.revoked_at IS NULL
          FOR UPDATE OF u, c`,
        [email],
      );
      const admin = query.rows[0];
      if (!admin) {
        verifyAdminPassword(password, DUMMY_PASSWORD_HASH);
        return { ok: false as const, locked: false };
      }
      if (admin.locked_until && new Date(admin.locked_until).getTime() > Date.now()) {
        verifyAdminPassword(password, admin.password_hash);
        return { ok: false as const, locked: true };
      }
      if (!verifyAdminPassword(password, admin.password_hash)) {
        await client.query(
          `UPDATE admin_password_totp_credentials
              SET failed_attempts = failed_attempts + 1,
                  locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END,
                  updated_at = NOW()
            WHERE admin_id = $1::uuid`,
          [admin.id],
        );
        return { ok: false as const, locked: false };
      }

      let method = "totp";
      let acceptedStep: number | null = null;
      let remainingHashes = normalizeHashes(admin.recovery_code_hashes);
      if (/^\d{6}$/.test(code)) {
        acceptedStep = verifyTotpStep(decryptTotpSecret(admin.encrypted_totp_secret), code);
        if (acceptedStep === null || (admin.last_accepted_step !== null && acceptedStep <= Number(admin.last_accepted_step))) {
          acceptedStep = null;
        }
      } else {
        const index = findBackupCode(code, remainingHashes);
        if (index >= 0) {
          remainingHashes = remainingHashes.filter((_, current) => current !== index);
          method = "recovery_code";
        }
      }
      if ((method === "totp" && acceptedStep === null) || (method === "recovery_code" && remainingHashes.length === normalizeHashes(admin.recovery_code_hashes).length)) {
        await client.query(
          `UPDATE admin_password_totp_credentials
              SET failed_attempts = failed_attempts + 1,
                  locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END,
                  updated_at = NOW()
            WHERE admin_id = $1::uuid`,
          [admin.id],
        );
        return { ok: false as const, locked: false };
      }

      await client.query(
        `UPDATE admin_password_totp_credentials
            SET last_accepted_step = COALESCE($2, last_accepted_step),
                recovery_code_hashes = $3::jsonb, failed_attempts = 0,
                locked_until = NULL, last_used_at = NOW(), updated_at = NOW()
          WHERE admin_id = $1::uuid`,
        [admin.id, acceptedStep, JSON.stringify(remainingHashes)],
      );
      await client.query(`UPDATE admin_users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1::uuid`, [admin.id]);
      const roles = normalizeRoles(admin.roles);
      const session = await createAdminControlSession(client, {
        adminId: admin.id, permissionVersion: admin.permission_version, roles,
        authenticationMethods: ["password", method], ip, userAgent,
        auditAction: "admin.login.password_totp",
      });
      return { ok: true as const, admin, roles, session };
    });

    if (!result.enabled) return apiError("admin_service_unavailable", 503);
    if (!result.value.ok) return apiError(result.value.locked ? "admin_login_locked" : "admin_login_failed", 401);
    const response = apiOk({
      authenticated: true,
      admin: {
        id: result.value.admin.id, email: result.value.admin.email,
        displayName: result.value.admin.display_name, roles: result.value.roles,
      },
    });
    setAdminControlSessionCookie(response, result.value.session);
    return response;
  });
}
