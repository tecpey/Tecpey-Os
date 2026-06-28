import { NextRequest, NextResponse } from "next/server";
import { POST as academyAuthPost } from "@/app/api/academy-auth/route";
import { verifyCsrfOrigin } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const nextReq = new NextRequest(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ ...body, mode: "signup" }),
  });
  return academyAuthPost(nextReq);
}
