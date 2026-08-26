import { NextRequest } from "next/server";
import { apiError, apiOk, apiRateLimited, Validate } from "@/lib/api-validation";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import {
  claimPhoneOtpVerification,
  completePhoneOtpVerification,
  verifyClaimedPhoneOtpCode,
} from "@/lib/security/phone-otp-authority";

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

    const claim = await claimPhoneOtpVerification(challengeId);
    if (claim.status !== "claimed") {
      const map: Record<string, [string, number]> = {
        expired: ["otp_challenge_expired", 410],
        attempts_exhausted: ["otp_attempts_exhausted", 429],
        unavailable: ["phone_otp_authority_unavailable", 503],
      };
      const [error, status] = map[claim.status] ?? ["invalid_otp_challenge", 409];
      return apiError(error, status);
    }

    const verified = verifyClaimedPhoneOtpCode({
      challengeId,
      phoneFingerprint: claim.phoneFingerprint,
      purpose: claim.purpose,
      code,
      otpCodeDigest: claim.otpCodeDigest,
    });
    const completion = await completePhoneOtpVerification({
      challengeId,
      verified,
      failureReason: verified ? undefined : "invalid_code",
    });
    if (completion === "unavailable") return apiError("phone_otp_authority_unavailable", 503);
    if (!verified) return apiError("invalid_otp_code", 401);
    if (completion !== "verified") return apiError("invalid_otp_challenge", 409);

    return apiOk({ verified: true, challengeId, purpose: claim.purpose });
  });
}
