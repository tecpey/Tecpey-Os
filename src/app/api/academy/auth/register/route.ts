import { NextRequest } from "next/server";
import { POST as academyAuthPost } from "@/app/api/academy-auth/route";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { apiError } from "@/lib/api-validation";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return apiError("forbidden", 403);
  const boundedBodyRequest = await readBoundedJsonRequest(req, {
    maxBytes: 8_192,
    allowEmptyObject: true,
  });
  if (!boundedBodyRequest.ok) {
    return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
  }
  req = boundedBodyRequest.request;
  const body = await req.json().catch(() => ({}));
  const nextReq = new NextRequest(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ ...body, mode: "signup" }),
  });
  return academyAuthPost(nextReq);
}
