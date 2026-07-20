// GET  /api/auth/2fa/enroll — generate TOTP secret + QR code URI + backup codes.
// POST /api/auth/2fa/enroll — verify the first TOTP code and enable 2FA.
//
// Security:
//   - Secret is AES-256-GCM encrypted at rest (TECPEY_2FA_SECRET required)
//   - Backup codes are HMAC-SHA256 hashed (plain returned once only)
//   - Pending enrollment and successful enablement are transaction-coupled to
//     mandatory append-only evidence; raw secrets/codes never enter that evidence.

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { PLATFORM } from "@/lib/platform-config";
import {
  generateTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  hashBackupCode,
  buildOtpAuthUri,
} from "@/lib/security/totp";
import {
  enableTwoFactor,
  fingerprintTwoFactorGeneration,
  startTwoFactorEnrollment,
  type TwoFactorAuditContext,
} from "@/lib/security/two-factor-authority";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
} from "@/lib/security/sensitive-mutation-audit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

function actorType(session: Awaited<ReturnType<typeof getCanonicalSession>>) {
  if (session.isAdmin) return "admin" as const;
  return session.userId ? "user" as const : "student" as const;
}

function auditContext(input: {
  req: NextRequest;
  userId: string;
  actorType: TwoFactorAuditContext["actorType"];
  action: string;
  evidence?: Record<string, unknown>;
}): TwoFactorAuditContext {
  return {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    actorType: input.actorType,
    actorId: input.userId,
    correlationId: resolveSensitiveAuditCorrelation(
      input.req.headers.get("x-tecpey-request-id"),
    ),
    requestHash: hashSensitiveAuditRequest({
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      actorType: input.actorType,
      actorId: input.userId,
      action: input.action,
      ...input.evidence,
    }),
  };
}

// GET: generate and persist pending enrollment data.
export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/2fa/enroll" }, async () => {
    const rlimit = await rateLimit(req, {
      namespace: "2fa-enroll-get",
      limit: 10,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const rawSecret = generateTotpSecret();
    const encryptedSecret = encryptTotpSecret(rawSecret);
    const backupCodes = generateBackupCodes();
    const backupCodeHashes = backupCodes.map(hashBackupCode);
    const generationFingerprint = fingerprintTwoFactorGeneration({
      encryptedSecret,
      backupCodeHashes,
    });

    try {
      const result = await startTwoFactorEnrollment({
        userId,
        encryptedSecret,
        backupCodeHashes,
        audit: auditContext({
          req,
          userId,
          actorType: actorType(session),
          action: "credential.2fa.enroll.start",
          evidence: { generationFingerprint, backupCodeCount: backupCodes.length },
        }),
      });
      if (!result.ok && result.status === "already_enabled") {
        return apiError("2fa_already_enabled", 409);
      }

      const accountName = session.email ?? session.username ?? userId;
      const otpAuthUri = buildOtpAuthUri({ secret: rawSecret, accountName });
      return apiOk({
        otpAuthUri,
        secret: rawSecret,
        backupCodes,
      });
    } catch {
      return apiError("2fa_service_unavailable", 503);
    }
  });
}

// POST: confirm enrollment with the first TOTP code.
export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/2fa/enroll" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, {
      namespace: "2fa-enroll-post",
      limit: 10,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

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
    if (!/^\d{6}$/.test(code)) return apiError("invalid_code_format", 400);

    try {
      const result = await enableTwoFactor({
        userId,
        code,
        audit: auditContext({
          req,
          userId,
          actorType: actorType(session),
          action: "credential.2fa.enable",
        }),
      });
      if (result.ok) return apiOk({ enabled: true });

      switch (result.status) {
        case "not_started":
          return apiError("2fa_enrollment_not_started", 404);
        case "already_enabled":
          return apiError("2fa_already_enabled", 409);
        case "invalid_code":
          return apiError("invalid_totp_code", 401);
        case "secret_corrupt":
          return apiError("2fa_secret_corrupt", 500);
        default:
          return apiError("2fa_service_unavailable", 503);
      }
    } catch {
      return apiError("2fa_service_unavailable", 503);
    }
  });
}
