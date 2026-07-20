import { readJsonBody } from "@/lib/security/request-body";
import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import {
  createAdminPasskeySession,
  setAdminControlSessionCookie,
  verifyAdminBootstrapToken,
} from "@/lib/admin-passkey-service";
import { writeAdminAuditEvent } from "@/lib/admin-control-plane";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  consumeAdminWebAuthnChallenge,
  verifyAdminWebAuthnRegistration,
} from "@/lib/security/admin-webauthn";
import { extractWebAuthnClientChallenge } from "@/lib/security/webauthn-ceremony";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validAdminId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/auth/bootstrap/verify" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "admin-bootstrap-verify",
      limit: 5,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);
    if (!verifyAdminBootstrapToken(req)) return apiError("admin_bootstrap_unauthorized", 401);

    const bodyResult = await readJsonBody(req, {
      maxBytes: 16_384,
      allowEmptyObject: true,
    });
    if (!bodyResult.ok) return apiError(bodyResult.error, bodyResult.status);
    const body = bodyResult.value;
    if (!validAdminId(body.adminId)) return apiError("invalid_admin_id", 400);
    if (
      typeof body.response?.id !== "string" ||
      typeof body.response?.rawId !== "string" ||
      body.response.id !== body.response.rawId
    ) {
      return apiError("credential_id_mismatch", 400);
    }

    const challenge = extractWebAuthnClientChallenge(
      body.response?.response?.clientDataJSON,
      "webauthn.create",
    );
    const envelope = challenge
      ? await consumeAdminWebAuthnChallenge(challenge, "bootstrap-registration")
      : null;

    if (!challenge || !envelope || envelope.adminId !== body.adminId) {
      return apiError("invalid_admin_webauthn_challenge", 400);
    }

    const verification = verifyAdminWebAuthnRegistration({
      expectedChallenge: challenge,
      response: body.response,
    });
    if (!verification.ok) return apiError(verification.reason, 400);

    const ip = getClientIp(req);
    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500);
    const label = typeof body.deviceLabel === "string" && body.deviceLabel.trim()
      ? body.deviceLabel.trim().slice(0, 100)
      : "Primary admin passkey";

    try {
      const result = await withTx(async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('tecpey_admin_bootstrap'))`);

        const authority = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count
           FROM admin_users
           WHERE status IN ('active', 'suspended', 'disabled')`,
        );
        if ((authority.rows[0]?.count ?? 0) > 0) throw new Error("admin_bootstrap_closed");

        const adminResult = await client.query<{
          id: string;
          email: string;
          display_name: string;
          permission_version: number;
        }>(
          `SELECT id::text, email, display_name, permission_version
           FROM admin_users
           WHERE id = $1::uuid AND status = 'invited'
           FOR UPDATE`,
          [body.adminId],
        );
        const admin = adminResult.rows[0];
        if (!admin) throw new Error("admin_bootstrap_identity_not_found");

        await client.query(
          `INSERT INTO admin_webauthn_credentials (
             admin_id, credential_id, public_key, counter, transports,
             device_type, backed_up, label, created_at
           ) VALUES (
             $1::uuid, $2, $3, $4, $5::jsonb,
             $6, $7, $8, NOW()
           )`,
          [
            admin.id,
            verification.credentialId,
            verification.publicKey,
            verification.counter,
            JSON.stringify(verification.transports),
            verification.deviceType,
            verification.backedUp,
            label,
          ],
        );

        await client.query(
          `UPDATE admin_users
           SET status = 'active', mfa_enrolled_at = NOW(), last_login_at = NOW(), updated_at = NOW()
           WHERE id = $1::uuid`,
          [admin.id],
        );

        await client.query(
          `INSERT INTO admin_user_roles (admin_id, role_id, assigned_by, reason)
           VALUES ($1::uuid, 'super_admin', $1::uuid, 'initial secure bootstrap')`,
          [admin.id],
        );

        await writeAdminAuditEvent(client, {
          actorAdminId: admin.id,
          sessionId: null,
          effectiveRoles: ["super_admin"],
          action: "admin.passkey.registered",
          resourceType: "admin_webauthn_credential",
          resourceId: verification.credentialId,
          sourceIp: ip,
          userAgent,
          reason: "initial secure bootstrap",
          afterState: {
            label,
            aaguid: verification.aaguid,
            transports: verification.transports,
            deviceType: verification.deviceType,
            backedUp: verification.backedUp,
          },
        });

        const session = await createAdminPasskeySession(client, {
          adminId: admin.id,
          permissionVersion: admin.permission_version,
          roles: ["super_admin"],
          authenticationMethods: ["passkey", "bootstrap_token"],
          ip,
          userAgent,
          auditAction: "admin.bootstrap.completed",
        });

        return { admin, session };
      });

      if (!result.enabled) return apiError("admin_service_unavailable", 503);

      const response = apiOk({
        authenticated: true,
        admin: {
          id: result.value.admin.id,
          email: result.value.admin.email,
          displayName: result.value.admin.display_name,
          roles: ["super_admin"],
        },
      }, 200, { "Cache-Control": "no-store, max-age=0" });
      setAdminControlSessionCookie(response, result.value.session);
      return response;
    } catch (error) {
      const code = error instanceof Error ? error.message : "admin_bootstrap_failed";
      if (code === "admin_bootstrap_closed") return apiError(code, 409);
      if (code === "admin_bootstrap_identity_not_found") return apiError(code, 404);
      if (code.includes("duplicate") || code.includes("unique")) {
        return apiError("admin_passkey_already_registered", 409);
      }
      return apiError("admin_bootstrap_failed", 500);
    }
  });
}
