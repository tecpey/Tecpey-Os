import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getHallOfFame } from "@/lib/community-career";

export async function GET(req: NextRequest) {
  const limit = await rateLimit(req, { namespace: "community-hall-read", limit: 120, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const learners = await getHallOfFame();
  return NextResponse.json({ ok: true, learners });
}
