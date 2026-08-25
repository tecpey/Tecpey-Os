import { NextRequest } from "next/server";
import { apiError, apiOk, apiRateLimited, Validate } from "@/lib/api-validation";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { providerMobileFromE164 } from "@/lib/security/phone-identity";
import {
  claimPhoneOtpVerification,
  completePhoneOtpVerification,
} from "@/lib/security/phone-otp-authority";
import { checkLimooVerificationCode } from "@/lib/security/limoo-sms";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return withObservability(request, { route: "/api/auth/phone-otp/verify" }, async () => {
    if (!await verifyCsrfOrigin(request)) return apiError("forbidden", 403);
    const bounded = await readBoundedJsonRequest<{ challengeId?: unknown; code?: unknown }>(request, {
      maxBytes: 2_048,
    });
    if (!bounded.ok) return apiError(bounded.error, bounded.status);
    const challengeId = Validate.uuid(bounded.value.challengeId);
    const code = String(bounded.value.code ?? "").trim();
    if (!challengeId) return apiError("invalid_otp_challenge", 400);
    if (!/^\d{4,8}$/.test(code)) return apiError("invalid_otp_code", 400);

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

    const provider = await checkLimooVerificationCode(
      providerMobileFromE164(claim.phoneE164),
      code,
    );
    const retryableProviderFailure = !provider.ok && ["disabled", "timeout", "network_error"].includes(provider.reason);
    const completion = await completePhoneOtpVerification({
      challengeId,
      verified: provider.ok,
      retryableProviderFailure,
      failureReason: provider.ok ? undefined : provider.reason,
    });
    if (completion === "unavailable") return apiError("phone_otp_authority_unavailable", 503);
    if (!provider.ok) {
      const providerError = provider.reason === "disabled"
        ? "limoo_sms_not_configured"
        : retryableProviderFailure
          ? "otp_verification_unavailable"
          : "invalid_otp_code";
      return apiError(providerError, retryableProviderFailure ? 503 : 401);
    }
    if (completion !== "verified") return apiError("invalid_otp_challenge", 409);

    return apiOk({ verified: true, challengeId, purpose: claim.purpose });
  });
}
