import { NextRequest } from "next/server";
import { POST as academyAuthPost } from "@/app/api/academy-auth/route";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { apiError } from "@/lib/api-validation";

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return apiError("forbidden", 403);
  const body = await req.json().catch(() => ({}));
  const nextReq = new NextRequest(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ ...body, mode: "login" }),
  });
  return academyAuthPost(nextReq);
}
