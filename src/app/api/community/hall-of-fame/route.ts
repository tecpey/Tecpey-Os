import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getHallOfFame } from "@/lib/community-career";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/community/hall-of-fame" }, async () => {
    const limit = await rateLimit(req, { namespace: "community-hall-read", limit: 120, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const learners = await getHallOfFame();
    return apiOk({ learners });
  });
}
