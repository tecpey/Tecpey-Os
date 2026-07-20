import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getCanonicalSession } from "@/lib/auth-session";
import {
  getCurrentPublicProfile,
  getPublicProfile,
  setPublicVisibilityForStudent,
} from "@/lib/community-career";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/community/profile" }, async () => {
    const limit = await rateLimit(req, {
      namespace: "community-profile-read",
      limit: 120,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);
    const id = new URL(req.url).searchParams.get("id");
    const profile = id ? await getPublicProfile(id) : await getCurrentPublicProfile(req);
    return apiOk({ authenticated: Boolean(profile), profile });
  });
}

export async function PATCH(req: NextRequest) {
  return withObservability(req, { route: "/api/community/profile" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("academy_profile_required", 401);
    const limit = await rateLimit(req, {
      namespace: "community-profile-write",
      identity: session.studentId,
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);
    const boundedBodyRequest = await readBoundedJsonRequest(req, {
      maxBytes: 2_048,
      allowEmptyObject: true,
    });
    if (!boundedBodyRequest.ok) {
      return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
    }
    req = boundedBodyRequest.request;
    const body = await req.json().catch(() => ({}));
    const visibility = body.visibility === "private" ? "private" : "public";
    const updated = await setPublicVisibilityForStudent(
      session.studentId,
      visibility,
    );
    if (updated === "unavailable") {
      return apiError("profile_storage_unavailable", 503);
    }
    if (updated === "not_found") return apiError("profile_not_found", 404);
    return apiOk({ visibility });
  });
}
