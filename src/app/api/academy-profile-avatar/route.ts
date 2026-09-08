import { NextRequest } from "next/server";
import { apiError, apiOk, apiRateLimited } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { withObservability } from "@/lib/observe";
import {
  MAX_PROFILE_AVATAR_BYTES,
  storeAcademyProfileAvatar,
} from "@/lib/academy-profile-avatar-storage";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-profile-avatar" }, async () => {
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "academy-profile-avatar-upload",
      limit: 8,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiRateLimited(limit.retryAfterSeconds);

    const declaredLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PROFILE_AVATAR_BYTES + 96_000) {
      return apiError("profile_avatar_too_large", 413);
    }

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (session.authorityDegraded) return apiError("profile_avatar_service_unavailable", 503);
    if (!session.studentId || !session.isAcademyUser) return apiError("academy_profile_required", 409);

    try {
      const form = await req.formData();
      const file = form.get("avatar");
      if (!(file instanceof File)) return apiError("profile_avatar_required", 400);

      const stored = await storeAcademyProfileAvatar({
        studentId: session.studentId,
        file,
      });
      return apiOk({ avatar: stored.url, bytes: stored.bytes, contentType: stored.contentType });
    } catch (error) {
      const code = error instanceof Error ? error.message : "profile_avatar_upload_failed";
      if (code === "profile_avatar_type_not_allowed" || code === "profile_avatar_signature_invalid") {
        return apiError(code, 415);
      }
      if (code === "profile_avatar_size_invalid") return apiError(code, 413);
      if (code === "profile_avatar_storage_not_configured") return apiError(code, 503);
      return apiError("profile_avatar_upload_failed", 500);
    }
  });
}
