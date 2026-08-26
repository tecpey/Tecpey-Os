import { NextRequest } from "next/server";
import { apiError, apiOk, apiRateLimited, Validate } from "@/lib/api-validation";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { verifyPhoneOtpChallenge } from "@/lib/security/phone-otp-authority";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return withObservability(request, { route: "/api/auth/phone-otp/verify" }, async () => {
    if (!await verifyCsrfOrigin(request)) return apiError("forbidden", 403);
    const bounded = await readBoundedJsonRequest(request, {
      maxBytes: 2_048,
    });
    if (!bounded.ok) return apiError(bounded.error, bounded.status);
    const value = bounded.value as { challengeId?: unknown; code?: unknown };
    const challengeId = Validate.uuid(value.challengeId);
    const code = String(value.code ?? "").trim();
    if (!challengeId) return apiError("invalid_otp_challenge", 400);
    if (!/^\d{6}$/.test(code)) return apiError("invalid_otp_code", 400);

    const limit = await rateLimit(request, {
      namespace: "phone-otp-verify",
      identity: challengeId,
      limit: 6,
      windowMs: 10 * 60_000,
    });
    if (!limit.ok) return apiRateLimited(limit.retryAfterSeconds);

    const verification = await verifyPhoneOtpChallenge({ challengeId, code });
    if (verification.status !== "verified") {
      const map: Record<string, [string, number]> = {
        invalid_code: ["invalid_otp_code", 401],
        expired: ["otp_challenge_expired", 410],
        attempts_exhausted: ["otp_attempts_exhausted", 429],
        unavailable: ["phone_otp_authority_unavailable", 503],
      };
      const [error, status] = map[verification.status] ?? ["invalid_otp_challenge", 409];
      return apiError(error, status);
    }

    return apiOk({ verified: true, challengeId, purpose: verification.purpose });
  });
}
