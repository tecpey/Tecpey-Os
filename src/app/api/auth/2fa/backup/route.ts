// POST /api/auth/2fa/backup — consume a one-time backup code.
//
// Consumption uses SELECT ... FOR UPDATE so concurrent reuse cannot succeed.
// The hash removal and mandatory append-only evidence commit atomically.

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { PLATFORM } from "@/lib/platform-config";
import { consumeTwoFactorBackupCode } from "@/lib/security/two-factor-authority";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
} from "@/lib/security/sensitive-mutation-audit";
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

    const actorType = session.isAdmin
      ? "admin" as const
      : session.userId
        ? "user" as const
        : "student" as const;
    const correlationId = resolveSensitiveAuditCorrelation(
      req.headers.get("x-tecpey-request-id"),
    );
    const requestHash = hashSensitiveAuditRequest({
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      actorType,
      actorId: userId,
      action: "credential.2fa.backup.consume",
    });

    try {
      const result = await consumeTwoFactorBackupCode({
        userId,
        code,
        audit: {
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          actorType,
          actorId: userId,
          correlationId,
          requestHash,
        },
      });
      if (result.ok) {
        return apiOk({
          verified: true,
          remainingCodes: result.remainingCodes ?? 0,
        });
      }

      switch (result.status) {
        case "not_enabled":
          return apiError("2fa_not_enabled", 404);
        case "invalid_code":
          return apiError("invalid_backup_code", 401);
        default:
          return apiError("2fa_service_unavailable", 503);
      }
    } catch {
      return apiError("2fa_service_unavailable", 503);
    }
  });
}
