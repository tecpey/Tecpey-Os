import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { apiError, apiOk, Validate } from "@/lib/api-validation";
import { verifyAdminBootstrapToken } from "@/lib/admin-passkey-service";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { hashAdminPassword, validateAdminPassword } from "@/lib/security/admin-password-totp";
import { buildOtpAuthUri, encryptTotpSecret, generateTotpSecret } from "@/lib/security/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/auth/totp/bootstrap/setup" }, async () => {
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    const limit = await rateLimit(req, { namespace: "admin-totp-bootstrap-setup", limit: 5, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    if (!verifyAdminBootstrapToken(req)) return apiError("admin_bootstrap_unauthorized", 401);

    const bounded = await readBoundedJsonRequest(req, { maxBytes: 16_384 });
    if (!bounded.ok) return apiError(bounded.error, bounded.status);
    const body = await bounded.request.json().catch(() => ({}));
    const email = Validate.email(body.email);
    const displayName = Validate.text(body.displayName, 2, 120);
    if (!email) return apiError("invalid_email", 400);
    if (!displayName) return apiError("invalid_display_name", 400);
    const password = validateAdminPassword(body.password, email);
    if (!password) return apiError("admin_password_policy_failed", 400);

    const secret = generateTotpSecret();
    const encryptedSecret = encryptTotpSecret(secret);
    const passwordHash = hashAdminPassword(password);
    try {
      const result = await withTx(async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('tecpey_admin_bootstrap'))`);
        const authority = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM admin_users WHERE status IN ('active', 'suspended', 'disabled')`,
        );
        if ((authority.rows[0]?.count ?? 0) > 0) throw new Error("admin_bootstrap_closed");

        const pending = await client.query<{ id: string; email: string }>(
          `SELECT id::text, email FROM admin_users WHERE status = 'invited' ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
        );
        let adminId: string = randomUUID();
        if (pending.rows[0]) {
          if (pending.rows[0].email.toLowerCase() !== email) throw new Error("admin_bootstrap_pending_for_another_identity");
          adminId = pending.rows[0].id;
          await client.query(`UPDATE admin_users SET display_name = $1, updated_at = NOW() WHERE id = $2::uuid`, [displayName, adminId]);
        } else {
          await client.query(
            `INSERT INTO admin_users (id, email, display_name, status) VALUES ($1::uuid, $2, $3, 'invited')`,
            [adminId, email, displayName],
          );
        }
        await client.query(
          `INSERT INTO admin_password_totp_credentials (
             admin_id, password_hash, encrypted_totp_secret, recovery_code_hashes,
             last_accepted_step, failed_attempts, locked_until, enrolled_at, revoked_at, updated_at
           ) VALUES ($1::uuid, $2, $3, '[]'::jsonb, NULL, 0, NULL, NULL, NULL, NOW())
           ON CONFLICT (admin_id) DO UPDATE SET
             password_hash = EXCLUDED.password_hash,
             encrypted_totp_secret = EXCLUDED.encrypted_totp_secret,
             recovery_code_hashes = '[]'::jsonb,
             last_accepted_step = NULL, failed_attempts = 0, locked_until = NULL,
             enrolled_at = NULL, revoked_at = NULL, updated_at = NOW()`,
          [adminId, passwordHash, encryptedSecret],
        );
        return { adminId };
      });
      if (!result.enabled) return apiError("admin_service_unavailable", 503);
      return apiOk({
        adminId: result.value.adminId,
        manualKey: secret,
        otpauthUri: buildOtpAuthUri({ secret, accountName: email, issuer: "TecPey Admin" }),
      }, 200, { "Cache-Control": "no-store, max-age=0" });
    } catch (error) {
      const code = error instanceof Error ? error.message : "admin_bootstrap_failed";
      if (code === "admin_bootstrap_closed" || code === "admin_bootstrap_pending_for_another_identity") return apiError(code, 409);
      return apiError("admin_bootstrap_failed", 500);
    }
  });
}
