import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getProfessionalChallenges } from "@/lib/community-career";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/challenges" }, async () => {
    const limit = await rateLimit(req, { namespace: "professional-challenges-read", limit: 90, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const challenges = await getProfessionalChallenges(req);
    return apiOk({ challenges });
  });
}
