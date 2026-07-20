import { readJsonBody } from "@/lib/security/request-body";
import { NextRequest } from "next/server";
import { POST as academyAuthPost } from "@/app/api/academy-auth/route";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { apiError } from "@/lib/api-validation";

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return apiError("forbidden", 403);
  const bodyResult = await readJsonBody(req, {
    maxBytes: 8_192,
    allowEmptyObject: true,
  });
  if (!bodyResult.ok) return apiError(bodyResult.error, bodyResult.status);
  const body = bodyResult.value;
  const nextReq = new NextRequest(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ ...body, mode: "login" }),
  });
  return academyAuthPost(nextReq);
}
