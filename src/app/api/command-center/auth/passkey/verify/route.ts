import { readJsonBody } from "@/lib/security/request-body";
import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import {
  createAdminPasskeySession,
  setAdminControlSessionCookie,
} from "@/lib/admin-passkey-service";
import { writeAdminAuditEvent } from "@/lib/admin-control-plane";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withDb, withTx } from "@/lib/db";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  consumeAdminWebAuthnChallenge,
  verifyAdminWebAuthnAuthentication,
} from "@/lib/security/admin-webauthn";
import { extractWebAuthnClientChallenge } from "@/lib/security/webauthn-ceremony";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CredentialRow = {
  id: string;
  admin_id: string;
  credential_id: string;
  public_key: Buffer;
  counter: string;
  email: string;
  display_name: string;
  permission_version: number;
  roles: unknown;
};

function normalizeRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string"))];
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/auth/passkey/verify" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "admin-passkey-verify",
      limit: 10,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const bodyResult = await readJsonBody(req, {
      maxBytes: 64_000,
      allowEmptyObject: true,
    });
    if (!bodyResult.ok) return apiError(bodyResult.error, bodyResult.status);
    const body = bodyResult.value;
    const challenge = extractWebAuthnClientChallenge(
      body.response?.response?.clientDataJSON,
      "webauthn.get",
    );
    const envelope = challenge
      ? await consumeAdminWebAuthnChallenge(challenge, "authentication")
      : null;
    const credentialId = typeof body.response?.rawId === "string"
      ? body.response.rawId
      : null;

    if (
      !challenge ||
      !envelope ||
      envelope.adminId !== null ||
      !credentialId ||
      body.response?.id !== credentialId
    ) {
      return apiError("admin_passkey_verification_failed", 401);
    }

    const credentialResult = await withDb(async (client) => {
      const query = await client.query<CredentialRow>(
        `SELECT
           c.id::text,
           c.admin_id::text,
           c.credential_id,
           c.public_key,
           c.counter::text,
           u.email,
           u.display_name,
           u.permission_version,
           COALESCE(
             jsonb_agg(DISTINCT ur.role_id) FILTER (WHERE ur.role_id IS NOT NULL),
             '[]'::jsonb
           ) AS roles
         FROM admin_webauthn_credentials c
         JOIN admin_users u ON u.id = c.admin_id
         LEFT JOIN admin_user_roles ur
           ON ur.admin_id = u.id AND ur.revoked_at IS NULL
         WHERE c.credential_id = $1
           AND c.revoked_at IS NULL
           AND u.status = 'active'
         GROUP BY c.id, u.id
         LIMIT 1`,
        [credentialId],
      );
      return query.rows[0] ?? null;
    });

    if (!credentialResult.enabled) return apiError("admin_service_unavailable", 503);
    const credential = credentialResult.value;
    if (!credential) return apiError("admin_passkey_verification_failed", 401);

    const storedCounter = Number(credential.counter);
    if (!Number.isSafeInteger(storedCounter) || storedCounter < 0) {
      return apiError("admin_credential_state_invalid", 503);
    }

    const verification = verifyAdminWebAuthnAuthentication({
      expectedChallenge: challenge,
      response: body.response,
      publicKey: credential.public_key,
      storedCounter,
    });

    const ip = getClientIp(req);
    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500);
    const roles = normalizeRoles(credential.roles);

    if (!verification.ok) {
      const auditResult = await withTx(async (client) => {
        await writeAdminAuditEvent(client, {
          actorAdminId: credential.admin_id,
          sessionId: null,
          effectiveRoles: roles,
          action: "admin.login.passkey.denied",
          resourceType: "admin_webauthn_credential",
          resourceId: credential.id,
          sourceIp: ip,
          userAgent,
          outcome: "denied",
          errorCode: verification.reason,
        });
        return true;
      });
      if (!auditResult.enabled) return apiError("admin_service_unavailable", 503);
      return apiError("admin_passkey_verification_failed", 401);
    }

    try {
      const result = await withTx(async (client) => {
        const currentAdmin = await client.query<{
          permission_version: number;
          email: string;
          display_name: string;
        }>(
          `SELECT permission_version, email, display_name
           FROM admin_users
           WHERE id = $1::uuid AND status = 'active'
           FOR UPDATE`,
          [credential.admin_id],
        );
        const admin = currentAdmin.rows[0];
        if (!admin) throw new Error("admin_identity_inactive");

        const updatedCredential = await client.query(
          `UPDATE admin_webauthn_credentials
           SET counter = $1, backed_up = $2, last_used_at = NOW()
           WHERE id = $3::uuid
             AND counter = $4
             AND revoked_at IS NULL`,
          [verification.counter, verification.backedUp, credential.id, storedCounter],
        );
        if ((updatedCredential.rowCount ?? 0) !== 1) {
          throw new Error("admin_credential_state_changed");
        }

        await client.query(
          `UPDATE admin_users SET last_login_at = NOW(), updated_at = NOW()
           WHERE id = $1::uuid`,
          [credential.admin_id],
        );

        const session = await createAdminPasskeySession(client, {
          adminId: credential.admin_id,
          permissionVersion: admin.permission_version,
          roles,
          authenticationMethods: ["passkey"],
          ip,
          userAgent,
          auditAction: "admin.login.passkey",
        });

        return { admin, session };
      });

      if (!result.enabled) return apiError("admin_service_unavailable", 503);

      const response = apiOk({
        authenticated: true,
        admin: {
          id: credential.admin_id,
          email: result.value.admin.email,
          displayName: result.value.admin.display_name,
          roles,
        },
      });
      setAdminControlSessionCookie(response, result.value.session);
      return response;
    } catch (error) {
      const code = error instanceof Error ? error.message : "admin_login_failed";
      if (code === "admin_identity_inactive") return apiError(code, 403);
      if (code === "admin_credential_state_changed") {
        return apiError("admin_passkey_verification_failed", 401);
      }
      return apiError("admin_login_failed", 500);
    }
  });
}
