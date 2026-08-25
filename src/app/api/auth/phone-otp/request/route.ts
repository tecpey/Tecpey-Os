import { NextRequest } from "next/server";
import { apiError, apiOk, apiRateLimited } from "@/lib/api-validation";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import {
  maskIranianMobile,
  normalizeIranianMobile,
  phoneFingerprint,
  providerMobileFromE164,
} from "@/lib/security/phone-identity";
import {
  finalizePhoneOtpSend,
  preparePhoneOtpChallenge,
  type PhoneOtpPurpose,
} from "@/lib/security/phone-otp-authority";
import { sendLimooVerificationCode } from "@/lib/security/limoo-sms";

export const dynamic = "force-dynamic";

const PURPOSES = new Set<PhoneOtpPurpose>(["signup", "login", "profile_verify"]);

export async function POST(request: NextRequest) {
  return withObservability(request, { route: "/api/auth/phone-otp/request" }, async () => {
    if (!await verifyCsrfOrigin(request)) return apiError("forbidden", 403);
    const ipLimit = await rateLimit(request, {
      namespace: "phone-otp-request-ip",
      limit: 5,
      windowMs: 15 * 60_000,
    });
    if (!ipLimit.ok) return apiRateLimited(ipLimit.retryAfterSeconds);

    const bounded = await readBoundedJsonRequest<{ phone?: unknown; purpose?: unknown }>(request, {
      maxBytes: 2_048,
    });
    if (!bounded.ok) return apiError(bounded.error, bounded.status);
    const phoneE164 = normalizeIranianMobile(bounded.value.phone);
    if (!phoneE164) return apiError("invalid_iranian_mobile", 400);
    const purpose = String(bounded.value.purpose ?? "signup") as PhoneOtpPurpose;
    if (!PURPOSES.has(purpose)) return apiError("invalid_otp_purpose", 400);

    let fingerprint: string;
    try {
      fingerprint = phoneFingerprint(phoneE164);
    } catch {
      return apiError("phone_otp_service_not_configured", 503);
    }
    const phoneLimit = await rateLimit(request, {
      namespace: "phone-otp-request-phone",
      identity: fingerprint,
      limit: 3,
      windowMs: 15 * 60_000,
    });
    if (!phoneLimit.ok) return apiRateLimited(phoneLimit.retryAfterSeconds);

    let challenge;
    try {
      challenge = await preparePhoneOtpChallenge({ phoneE164, purpose });
    } catch {
      return apiError("phone_otp_service_not_configured", 503);
    }
    if (challenge.status === "unavailable") return apiError("phone_otp_authority_unavailable", 503);

    const provider = await sendLimooVerificationCode(providerMobileFromE164(phoneE164));
    const sendRecorded = await finalizePhoneOtpSend({
      challengeId: challenge.challengeId,
      sent: provider.ok,
      failureReason: provider.ok ? undefined : provider.reason,
    });
    if (!sendRecorded) return apiError("phone_otp_authority_unavailable", 503);
    if (!provider.ok) {
      return apiError(
        provider.reason === "disabled" ? "limoo_sms_not_configured" : "otp_delivery_unavailable",
        503,
      );
    }

    return apiOk({
      challengeId: challenge.challengeId,
      maskedPhone: maskIranianMobile(phoneE164),
      expiresInSeconds: Math.max(0, Math.floor((challenge.expiresAt.getTime() - Date.now()) / 1000)),
      resendAfterSeconds: 60,
    });
  });
}
