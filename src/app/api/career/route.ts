import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getCareerSnapshot } from "@/lib/community-career";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/career" }, async () => {
    const limit = await rateLimit(req, { namespace: "career-snapshot-read", limit: 90, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const career = await getCareerSnapshot(req);
    if (!career) return apiOk({ authenticated: false, career: null });
    return apiOk({ authenticated: true, career });
  });
}
