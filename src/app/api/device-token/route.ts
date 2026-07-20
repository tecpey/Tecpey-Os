import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { PLATFORM } from "@/lib/platform-config";
import { rateLimit } from "@/lib/rate-limit";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
  writeSensitiveMutationAuditTx,
} from "@/lib/security/sensitive-mutation-audit";
import { cleanText } from "@/lib/student-cartax";
import { apiOk, apiError } from "@/lib/api-validation";

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

  const session = await getCanonicalSession(req, { strictRevocation: true });
  if (!session.studentId) return apiError("complete_account_required", 401);
  const studentId = session.studentId;

  const limit = await rateLimit(req, {
    namespace: "device-token-register",
    identity: studentId,
    limit: 20,
    windowMs: 60_000,
  });
  if (!limit.ok) return apiError("rate_limited", 429);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const platform = cleanText(body.platform, 20);
    const token = cleanText(body.token, 1000);
    const locale = cleanText(body.locale || "fa", 10);
    if (!["web", "android", "ios"].includes(platform) || token.length < 10) {
      return apiError("invalid_token", 400);
    }

    const tokenHash = hashSensitiveAuditRequest(token);
    const correlationId = resolveSensitiveAuditCorrelation(
      req.headers.get("x-tecpey-request-id"),
    );
    const requestHash = hashSensitiveAuditRequest({
      studentId,
      platform,
      locale,
      tokenHash,
    });

    const result = await withTx(async (client) => {
      const upserted = await client.query<{ id: string }>(
        `INSERT INTO device_tokens
           (student_id, platform, channel, token, locale)
         VALUES ($1::uuid, $2, 'push', $3, $4)
         ON CONFLICT (student_id, platform, token) DO UPDATE SET
           enabled = TRUE,
           last_seen_at = NOW(),
           locale = EXCLUDED.locale
         RETURNING id`,
        [studentId, platform, token, locale],
      );
      const deviceTokenId = upserted.rows[0]?.id;
      if (!deviceTokenId) throw new Error("device_token_upsert_failed");

      await writeSensitiveMutationAuditTx(client, {
        tenantId: PLATFORM.DEFAULT_TENANT_ID,
        actorType: "student",
        actorId: studentId,
        action: "device_token.register",
        resourceType: "device_token",
        resourceId: tokenHash,
        outcome: "success",
        correlationId,
        requestHash,
        metadata: {
          platform,
          locale,
          tokenHash,
          deviceTokenId,
        },
      });
      return true;
    });

    if (!result.enabled) return apiError("device_service_not_configured", 503);
    return apiOk({});
  } catch {
    return apiError("device_registration_unavailable", 503);
  }
}
