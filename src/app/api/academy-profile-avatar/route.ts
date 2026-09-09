import { NextRequest } from "next/server";
import { apiError, apiOk, apiRateLimited } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { withObservability } from "@/lib/observe";
import { readBoundedBody } from "@/lib/security/bounded-request-body";
import {
  MAX_PROFILE_AVATAR_BYTES,
  storeAcademyProfileAvatar,
} from "@/lib/academy-profile-avatar-storage";

export const dynamic = "force-dynamic";
const MAX_PROFILE_AVATAR_REQUEST_BYTES = MAX_PROFILE_AVATAR_BYTES + 96_000;

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-profile-avatar" }, async () => {
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "academy-profile-avatar-upload",
      limit: 8,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiRateLimited(limit.retryAfterSeconds);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (session.authorityDegraded) return apiError("profile_avatar_service_unavailable", 503);
    if (!session.studentId || !session.isAcademyUser) return apiError("academy_profile_required", 409);

    const contentType = req.headers.get("content-type")?.toLowerCase() || "";
    if (!contentType.startsWith("multipart/form-data;") || !contentType.includes("boundary=")) {
      return apiError("unsupported_media_type", 415);
    }

    const boundedBody = await readBoundedBody(req, {
      maxBytes: MAX_PROFILE_AVATAR_REQUEST_BYTES,
    });
    if (!boundedBody.ok) {
      if (boundedBody.error === "payload_too_large") {
        return apiError("profile_avatar_too_large", 413);
      }
      return apiError(boundedBody.error, boundedBody.status);
    }

    const headers = new Headers(req.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.delete("transfer-encoding");
    const boundedRequest = new NextRequest(req.url, {
      method: req.method,
      headers,
      body: Uint8Array.from(boundedBody.bytes).buffer,
      signal: req.signal,
    });

    try {
      const form = await boundedRequest.formData();
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
