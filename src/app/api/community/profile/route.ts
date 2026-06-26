import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentPublicProfile, getPublicProfile, setCurrentPublicVisibility } from "@/lib/community-career";

export async function GET(req: NextRequest) {
  const limit = await rateLimit(req, { namespace: "community-profile-read", limit: 120, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const id = new URL(req.url).searchParams.get("id");
  const profile = id ? await getPublicProfile(id) : await getCurrentPublicProfile(req);
  return NextResponse.json({ ok: true, authenticated: Boolean(profile), profile });
}

export async function PATCH(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const limit = await rateLimit(req, { namespace: "community-profile-write", limit: 30, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const visibility = body.visibility === "private" ? "private" : "public";
  const updated = await setCurrentPublicVisibility(req, visibility);
  if (!updated) return NextResponse.json({ ok: false, error: "academy_profile_required" }, { status: 401 });
  return NextResponse.json({ ok: true, visibility });
}
