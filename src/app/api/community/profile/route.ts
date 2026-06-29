import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentPublicProfile, getPublicProfile, setCurrentPublicVisibility } from "@/lib/community-career";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/community/profile" }, async () => {
    const limit = await rateLimit(req, { namespace: "community-profile-read", limit: 120, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const id = new URL(req.url).searchParams.get("id");
    const profile = id ? await getPublicProfile(id) : await getCurrentPublicProfile(req);
    return apiOk({ authenticated: Boolean(profile), profile });
  });
}

export async function PATCH(req: NextRequest) {
  return withObservability(req, { route: "/api/community/profile" }, async () => {
    if (!verifyCsrfOrigin(req))
      return apiError("forbidden", 403);
    const limit = await rateLimit(req, { namespace: "community-profile-write", limit: 30, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const body = await req.json().catch(() => ({}));
    const visibility = body.visibility === "private" ? "private" : "public";
    const updated = await setCurrentPublicVisibility(req, visibility);
    if (!updated) return apiError("academy_profile_required", 401);
    return apiOk({ visibility });
  });
}
