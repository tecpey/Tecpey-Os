import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getCareerSnapshot } from "@/lib/community-career";

export async function GET(req: NextRequest) {
  const limit = await rateLimit(req, { namespace: "career-snapshot-read", limit: 90, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const career = await getCareerSnapshot(req);
  if (!career) return NextResponse.json({ ok: true, authenticated: false, career: null });
  return NextResponse.json({ ok: true, authenticated: true, career });
}
