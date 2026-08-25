import { NextRequest } from "next/server";
import { apiError, apiOk, Validate } from "@/lib/api-validation";
import { createAdminControlSession, setAdminControlSessionCookie, verifyAdminBootstrapToken } from "@/lib/admin-passkey-service";
import { writeAdminAuditEvent } from "@/lib/admin-control-plane";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { decryptTotpSecret, generateBackupCodes, hashBackupCode, verifyTotpStep } from "@/lib/security/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/auth/totp/bootstrap/verify" }, async () => {
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    const limit = await rateLimit(req, { namespace: "admin-totp-bootstrap-verify", limit: 8, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    if (!verifyAdminBootstrapToken(req)) return apiError("admin_bootstrap_unauthorized", 401);
    const bounded = await readBoundedJsonRequest(req, { maxBytes: 8_192 });
    if (!bounded.ok) return apiError(bounded.error, bounded.status);
    const body = await bounded.request.json().catch(() => ({}));
    const adminId = Validate.uuid(body.adminId);
    const code = typeof body.code === "string" && /^\d{6}$/.test(body.code) ? body.code : null;
    if (!adminId || !code) return apiError("invalid_totp_code", 400);
    const ip = getClientIp(req);
    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500);
    const recoveryCodes = generateBackupCodes();

    try {
      const result = await withTx(async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('tecpey_admin_bootstrap'))`);
        const authority = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM admin_users WHERE status IN ('active', 'suspended', 'disabled')`,
        );
        if ((authority.rows[0]?.count ?? 0) > 0) throw new Error("admin_bootstrap_closed");
        const rowResult = await client.query<{
          id: string; email: string; display_name: string; permission_version: number;
          encrypted_totp_secret: string; last_accepted_step: string | null;
        }>(
          `SELECT u.id::text, u.email, u.display_name, u.permission_version,
                  c.encrypted_totp_secret, c.last_accepted_step::text
             FROM admin_users u
             JOIN admin_password_totp_credentials c ON c.admin_id = u.id
            WHERE u.id = $1::uuid AND u.status = 'invited' AND c.revoked_at IS NULL
            FOR UPDATE`,
          [adminId],
        );
        const admin = rowResult.rows[0];
        if (!admin) throw new Error("admin_bootstrap_identity_not_found");
        const acceptedStep = verifyTotpStep(decryptTotpSecret(admin.encrypted_totp_secret), code);
        if (acceptedStep === null || (admin.last_accepted_step !== null && acceptedStep <= Number(admin.last_accepted_step))) {
          throw new Error("invalid_totp_code");
        }
        await client.query(
          `UPDATE admin_password_totp_credentials
              SET recovery_code_hashes = $2::jsonb, last_accepted_step = $3,
                  enrolled_at = NOW(), last_used_at = NOW(), updated_at = NOW()
            WHERE admin_id = $1::uuid`,
          [admin.id, JSON.stringify(recoveryCodes.map(hashBackupCode)), acceptedStep],
        );
        await client.query(
          `UPDATE admin_users SET status = 'active', mfa_enrolled_at = NOW(), last_login_at = NOW(), updated_at = NOW() WHERE id = $1::uuid`,
          [admin.id],
        );
        await client.query(
          `INSERT INTO admin_user_roles (admin_id, role_id, assigned_by, reason)
           VALUES ($1::uuid, 'super_admin', $1::uuid, 'initial password and TOTP bootstrap')`,
          [admin.id],
        );
        await writeAdminAuditEvent(client, {
          actorAdminId: admin.id, sessionId: null, effectiveRoles: ["super_admin"],
          action: "admin.totp.registered", resourceType: "admin_password_totp_credential",
          resourceId: admin.id, sourceIp: ip, userAgent, reason: "initial secure bootstrap",
          afterState: { recoveryCodeCount: recoveryCodes.length, totpAlgorithm: "SHA1", periodSeconds: 30, digits: 6 },
        });
        const session = await createAdminControlSession(client, {
          adminId: admin.id, permissionVersion: admin.permission_version, roles: ["super_admin"],
          authenticationMethods: ["password", "totp", "bootstrap_token"], ip, userAgent,
          auditAction: "admin.bootstrap.completed",
        });
        return { admin, session };
      });
      if (!result.enabled) return apiError("admin_service_unavailable", 503);
      const response = apiOk({
        authenticated: true,
        recoveryCodes,
        admin: { id: result.value.admin.id, email: result.value.admin.email, displayName: result.value.admin.display_name, roles: ["super_admin"] },
      }, 200, { "Cache-Control": "no-store, max-age=0" });
      setAdminControlSessionCookie(response, result.value.session);
      return response;
    } catch (error) {
      const code = error instanceof Error ? error.message : "admin_bootstrap_failed";
      if (code === "invalid_totp_code") return apiError(code, 401);
      if (code === "admin_bootstrap_identity_not_found") return apiError(code, 404);
      if (code === "admin_bootstrap_closed") return apiError(code, 409);
      return apiError("admin_bootstrap_failed", 500);
    }
  });
}
