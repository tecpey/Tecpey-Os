import { DELETE as academyAuthDelete } from "@/app/api/academy-auth/route";
import { NextRequest, NextResponse } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  return academyAuthDelete(req);
}
