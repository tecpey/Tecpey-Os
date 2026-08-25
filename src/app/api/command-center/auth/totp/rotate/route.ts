import { createHash } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { apiError, apiOk } from "@/lib/api-validation";
import {
  loadAdminPrincipal,
  type AdminPrincipal,
  writeAdminAuditEvent,
} from "@/lib/admin-control-plane";
import {
  createAdminControlSession,
  setAdminControlSessionCookie,
} from "@/lib/admin-passkey-service";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { withObservability } from "@/lib/observe";
import { shouldUseSecureCookie } from "@/lib/platform-config";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { verifyAdminPassword } from "@/lib/security/admin-password-totp";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import {
  buildOtpAuthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  findBackupCode,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  openAdminTotpRotationChallenge,
  sealAdminTotpRotationChallenge,
  verifyTotpStep,
} from "@/lib/security/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROTATION_COOKIE = "tecpey_admin_totp_rotation";
const ROTATION_COOKIE_PATH = "/api/command-center/auth/totp/rotate";
const ROTATION_TTL_SECONDS = 10 * 60;

type CredentialRow = {
  password_hash: string;
  encrypted_totp_secret: string;
  recovery_code_hashes: unknown;
  last_accepted_step: string | null;
  locked_until: Date | null;
  credential_updated_at: string;
};

type CurrentFactorResult =
  | {
      ok: true;
      method: "totp" | "recovery_code";
      acceptedStep: number | null;
      remainingHashes: string[];
    }
  | { ok: false };

function noStoreHeaders(): Record<string, string> {
  return { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
}

function setRotationCookie(response: NextResponse, document: string): void {
  response.cookies.set(ROTATION_COOKIE, document, {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "strict",
    path: ROTATION_COOKIE_PATH,
    maxAge: ROTATION_TTL_SECONDS,
  });
}

function clearRotationCookie(response: NextResponse): void {
  response.cookies.set(ROTATION_COOKIE, "", {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "strict",
    path: ROTATION_COOKIE_PATH,
    maxAge: 0,
  });
}

function normalizeHashes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && /^[0-9a-f]{64}$/.test(item),
  );
}

function normalizeFactorCode(value: string): string {
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  return value
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[\s-]+/g, "")
    .toUpperCase();
}

function credentialVersion(row: Pick<
  CredentialRow,
  | "password_hash"
  | "encrypted_totp_secret"
  | "credential_updated_at"
  | "last_accepted_step"
  | "recovery_code_hashes"
>): string {
  return createHash("sha256")
    .update(row.password_hash)
    .update("\n")
    .update(row.encrypted_totp_secret)
    .update("\n")
    .update(row.credential_updated_at)
    .update("\n")
    .update(row.last_accepted_step ?? "none")
    .update("\n")
    .update(JSON.stringify(normalizeHashes(row.recovery_code_hashes)))
    .digest("hex");
}

function currentFactor(row: CredentialRow, code: string): CurrentFactorResult {
  const remainingHashes = normalizeHashes(row.recovery_code_hashes);
  if (/^\d{6}$/.test(code)) {
    const acceptedStep = verifyTotpStep(decryptTotpSecret(row.encrypted_totp_secret), code);
    if (
      acceptedStep === null
      || (row.last_accepted_step !== null && acceptedStep <= Number(row.last_accepted_step))
    ) {
      return { ok: false };
    }
    return { ok: true, method: "totp", acceptedStep, remainingHashes };
  }

  const index = findBackupCode(code, remainingHashes);
  if (index < 0) return { ok: false };
  return {
    ok: true,
    method: "recovery_code",
    acceptedStep: null,
    remainingHashes: remainingHashes.filter((_, current) => current !== index),
  };
}

async function recordReauthenticationDenial(input: {
  client: PoolClient;
  principal: AdminPrincipal;
  ip: string | null;
  userAgent: string;
  locked: boolean;
}): Promise<{ ok: false; locked: boolean }> {
  let locked = input.locked;
  if (!locked) {
    const updated = await input.client.query<{ locked_until: Date | null }>(
      `UPDATE admin_password_totp_credentials
          SET failed_attempts = CASE
                WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1
                ELSE failed_attempts + 1
              END,
              locked_until = CASE
                WHEN CASE
                       WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1
                       ELSE failed_attempts + 1
                     END >= 5
                  THEN NOW() + INTERVAL '15 minutes'
                ELSE NULL
              END,
              updated_at = NOW()
        WHERE admin_id = $1::uuid
        RETURNING locked_until`,
      [input.principal.adminId],
    );
    locked = Boolean(updated.rows[0]?.locked_until);
  }

  await writeAdminAuditEvent(input.client, {
    actorAdminId: input.principal.adminId,
    sessionId: input.principal.sessionId,
    effectiveRoles: input.principal.roles,
    action: "admin.totp.rotation_reauthentication_denied",
    resourceType: "admin_password_totp_credential",
    resourceId: input.principal.adminId,
    sourceIp: input.ip,
    userAgent: input.userAgent,
    outcome: "denied",
    errorCode: locked ? "admin_login_locked" : "admin_totp_rotation_reauthentication_failed",
  });
  return { ok: false, locked };
}

async function beginRotation(
  req: NextRequest,
  principal: AdminPrincipal,
  password: string,
  code: string,
) {
  const ip = getClientIp(req);
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500);
  const newSecret = generateTotpSecret();

  try {
    const result = await withTx(async (client) => {
      const query = await client.query<CredentialRow>(
        `SELECT c.password_hash, c.encrypted_totp_secret, c.recovery_code_hashes,
                c.last_accepted_step::text, c.locked_until,
                c.updated_at::text AS credential_updated_at
           FROM admin_users u
           JOIN admin_password_totp_credentials c ON c.admin_id = u.id
           JOIN admin_sessions s
             ON s.admin_id = u.id
            AND s.id = $3::uuid
            AND s.jti = $4
          WHERE u.id = $1::uuid
            AND u.permission_version = $2
            AND u.status = 'active'
            AND c.enrolled_at IS NOT NULL
            AND c.revoked_at IS NULL
            AND s.permission_version = u.permission_version
            AND s.revoked_at IS NULL
            AND s.idle_expires_at > NOW()
            AND s.absolute_expires_at > NOW()
          FOR UPDATE OF u, c, s`,
        [
          principal.adminId,
          principal.permissionVersion,
          principal.sessionId,
          principal.jti,
        ],
      );
      const credential = query.rows[0];
      if (!credential) throw new Error("admin_totp_rotation_identity_not_found");

      const currentlyLocked = Boolean(
        credential.locked_until && new Date(credential.locked_until).getTime() > Date.now(),
      );
      const passwordValid = verifyAdminPassword(password, credential.password_hash);
      if (currentlyLocked || !passwordValid) {
        return recordReauthenticationDenial({
          client,
          principal,
          ip,
          userAgent,
          locked: currentlyLocked,
        });
      }

      const factor = currentFactor(credential, code);
      if (!factor.ok) {
        return recordReauthenticationDenial({
          client,
          principal,
          ip,
          userAgent,
          locked: false,
        });
      }

      const updated = await client.query<CredentialRow>(
        `UPDATE admin_password_totp_credentials
            SET last_accepted_step = COALESCE($2, last_accepted_step),
                recovery_code_hashes = $3::jsonb,
                failed_attempts = 0,
                locked_until = NULL,
                last_used_at = NOW(),
                updated_at = NOW()
          WHERE admin_id = $1::uuid
          RETURNING password_hash, encrypted_totp_secret, recovery_code_hashes,
                    last_accepted_step::text, locked_until,
                    updated_at::text AS credential_updated_at`,
        [
          principal.adminId,
          factor.acceptedStep,
          JSON.stringify(factor.remainingHashes),
        ],
      );
      const updatedCredential = updated.rows[0];
      if (!updatedCredential) throw new Error("admin_totp_rotation_identity_not_found");
      const version = credentialVersion(updatedCredential);

      await writeAdminAuditEvent(client, {
        actorAdminId: principal.adminId,
        sessionId: principal.sessionId,
        effectiveRoles: principal.roles,
        action: "admin.totp.rotation_started",
        resourceType: "admin_password_totp_credential",
        resourceId: principal.adminId,
        sourceIp: ip,
        userAgent,
        afterState: {
          currentFactorMethod: factor.method,
          challengeTtlSeconds: ROTATION_TTL_SECONDS,
        },
      });
      return { ok: true as const, credentialVersion: version };
    });

    if (!result.enabled) return apiError("admin_service_unavailable", 503);
    if (!result.value.ok) {
      const response = apiError(
        result.value.locked ? "admin_login_locked" : "admin_totp_rotation_reauthentication_failed",
        401,
      );
      clearRotationCookie(response);
      return response;
    }

    const challenge = sealAdminTotpRotationChallenge({
      adminId: principal.adminId,
      sessionId: principal.sessionId,
      secret: newSecret,
      credentialVersion: result.value.credentialVersion,
    });
    const response = apiOk({
      manualKey: newSecret,
      otpauthUri: buildOtpAuthUri({
        secret: newSecret,
        accountName: principal.email,
        issuer: "TecPey Admin",
      }),
      expiresAt: challenge.expiresAt,
    }, 200, noStoreHeaders());
    setRotationCookie(response, challenge.document);
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : "admin_totp_rotation_failed";
    if (code === "admin_totp_rotation_identity_not_found") {
      const response = apiError(code, 401);
      clearRotationCookie(response);
      return response;
    }
    const response = apiError("admin_totp_rotation_failed", 500);
    clearRotationCookie(response);
    return response;
  }
}

async function finishRotation(
  req: NextRequest,
  principal: AdminPrincipal,
  code: string,
) {
  const document = req.cookies.get(ROTATION_COOKIE)?.value ?? "";
  const challenge = openAdminTotpRotationChallenge(document);
  if (
    !challenge
    || challenge.adminId !== principal.adminId
    || challenge.sessionId !== principal.sessionId
  ) {
    const response = apiError("admin_totp_rotation_challenge_invalid", 401);
    clearRotationCookie(response);
    return response;
  }

  const ip = getClientIp(req);
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500);
  const recoveryCodes = generateBackupCodes();

  try {
    const result = await withTx(async (client) => {
      const query = await client.query<CredentialRow>(
        `SELECT c.password_hash, c.encrypted_totp_secret, c.recovery_code_hashes,
                c.last_accepted_step::text, c.locked_until,
                c.updated_at::text AS credential_updated_at
           FROM admin_users u
           JOIN admin_password_totp_credentials c ON c.admin_id = u.id
           JOIN admin_sessions s
             ON s.admin_id = u.id
            AND s.id = $3::uuid
            AND s.jti = $4
          WHERE u.id = $1::uuid
            AND u.permission_version = $2
            AND u.status = 'active'
            AND c.enrolled_at IS NOT NULL
            AND c.revoked_at IS NULL
            AND s.permission_version = u.permission_version
            AND s.revoked_at IS NULL
            AND s.idle_expires_at > NOW()
            AND s.absolute_expires_at > NOW()
          FOR UPDATE OF u, c, s`,
        [
          principal.adminId,
          principal.permissionVersion,
          principal.sessionId,
          principal.jti,
        ],
      );
      const credential = query.rows[0];
      if (!credential) {
        await writeAdminAuditEvent(client, {
          actorAdminId: principal.adminId,
          sessionId: principal.sessionId,
          effectiveRoles: principal.roles,
          action: "admin.totp.rotation_verification_denied",
          resourceType: "admin_password_totp_credential",
          resourceId: principal.adminId,
          sourceIp: ip,
          userAgent,
          outcome: "denied",
          errorCode: "admin_totp_rotation_identity_not_found",
        });
        return { ok: false as const, error: "admin_totp_rotation_identity_not_found" as const };
      }
      if (credentialVersion(credential) !== challenge.credentialVersion) {
        await writeAdminAuditEvent(client, {
          actorAdminId: principal.adminId,
          sessionId: principal.sessionId,
          effectiveRoles: principal.roles,
          action: "admin.totp.rotation_verification_denied",
          resourceType: "admin_password_totp_credential",
          resourceId: principal.adminId,
          sourceIp: ip,
          userAgent,
          outcome: "denied",
          errorCode: "admin_totp_rotation_stale",
        });
        return { ok: false as const, error: "admin_totp_rotation_stale" as const };
      }

      const acceptedStep = verifyTotpStep(challenge.secret, code);
      if (acceptedStep === null) {
        await writeAdminAuditEvent(client, {
          actorAdminId: principal.adminId,
          sessionId: principal.sessionId,
          effectiveRoles: principal.roles,
          action: "admin.totp.rotation_verification_denied",
          resourceType: "admin_password_totp_credential",
          resourceId: principal.adminId,
          sourceIp: ip,
          userAgent,
          outcome: "denied",
          errorCode: "invalid_totp_code",
        });
        return { ok: false as const, error: "invalid_totp_code" as const };
      }

      await client.query(
        `UPDATE admin_password_totp_credentials
            SET encrypted_totp_secret = $2,
                recovery_code_hashes = $3::jsonb,
                last_accepted_step = $4,
                failed_attempts = 0,
                locked_until = NULL,
                enrolled_at = COALESCE(enrolled_at, NOW()),
                last_used_at = NOW(),
                updated_at = NOW()
          WHERE admin_id = $1::uuid`,
        [
          principal.adminId,
          encryptTotpSecret(challenge.secret),
          JSON.stringify(recoveryCodes.map(hashBackupCode)),
          acceptedStep,
        ],
      );
      await client.query(
        `UPDATE admin_users
            SET mfa_enrolled_at = NOW(), updated_at = NOW()
          WHERE id = $1::uuid`,
        [principal.adminId],
      );

      const revoked = await client.query(
        `UPDATE admin_sessions
            SET revoked_at = NOW(),
                revoked_by = $1::uuid,
                revoked_reason = 'totp_rotation'
          WHERE admin_id = $1::uuid AND revoked_at IS NULL`,
        [principal.adminId],
      );

      await writeAdminAuditEvent(client, {
        actorAdminId: principal.adminId,
        sessionId: principal.sessionId,
        effectiveRoles: principal.roles,
        action: "admin.totp.rotated",
        resourceType: "admin_password_totp_credential",
        resourceId: principal.adminId,
        sourceIp: ip,
        userAgent,
        afterState: {
          recoveryCodeCount: recoveryCodes.length,
          revokedSessionCount: revoked.rowCount ?? 0,
          totpAlgorithm: "SHA1",
          periodSeconds: 30,
          digits: 6,
        },
      });

      const session = await createAdminControlSession(client, {
        adminId: principal.adminId,
        permissionVersion: principal.permissionVersion,
        roles: principal.roles,
        authenticationMethods: ["password", "totp"],
        ip,
        userAgent,
        auditAction: "admin.totp.rotation.completed",
      });
      return { ok: true as const, session };
    });

    if (!result.enabled) return apiError("admin_service_unavailable", 503);
    if (!result.value.ok) {
      const status = result.value.error === "admin_totp_rotation_stale" ? 409 : 401;
      const response = apiError(result.value.error, status);
      if (result.value.error !== "invalid_totp_code") clearRotationCookie(response);
      return response;
    }

    const response = apiOk({
      authenticated: true,
      recoveryCodes,
    }, 200, noStoreHeaders());
    setAdminControlSessionCookie(response, result.value.session);
    clearRotationCookie(response);
    return response;
  } catch {
    return apiError("admin_totp_rotation_failed", 500);
  }
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/auth/totp/rotate" }, async () => {
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    const limit = await rateLimit(req, {
      namespace: "admin-totp-rotation",
      limit: 10,
      windowMs: 15 * 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const principal = await loadAdminPrincipal(req);
    if (principal === "unavailable") return apiError("admin_service_unavailable", 503);
    if (!principal) return apiError("admin_session_required", 401);

    const bounded = await readBoundedJsonRequest(req, { maxBytes: 8_192 });
    if (!bounded.ok) return apiError(bounded.error, bounded.status);
    const body = bounded.value as {
      phase?: unknown;
      password?: unknown;
      currentCode?: unknown;
      code?: unknown;
    };

    if (body.phase === "setup") {
      const password = typeof body.password === "string" && body.password.length <= 1_024
        ? body.password
        : null;
      const currentCode = typeof body.currentCode === "string"
        ? normalizeFactorCode(body.currentCode)
        : "";
      if (!password || (!/^\d{6}$/.test(currentCode) && !/^[A-Z2-9]{8}$/.test(currentCode))) {
        const response = apiError("admin_totp_rotation_request_invalid", 400);
        clearRotationCookie(response);
        return response;
      }
      return beginRotation(req, principal, password, currentCode);
    }

    if (body.phase === "verify") {
      const normalizedCode = typeof body.code === "string"
        ? normalizeFactorCode(body.code)
        : "";
      const code = /^\d{6}$/.test(normalizedCode)
        ? normalizedCode
        : null;
      if (!code) return apiError("invalid_totp_code", 400);
      return finishRotation(req, principal, code);
    }

    return apiError("admin_totp_rotation_request_invalid", 400);
  });
}
