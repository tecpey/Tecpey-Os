import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getProfessionalChallenges } from "@/lib/community-career";

export async function GET(req: NextRequest) {
  const limit = await rateLimit(req, { namespace: "professional-challenges-read", limit: 90, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const challenges = await getProfessionalChallenges(req);
  return NextResponse.json({ ok: true, challenges });
}
