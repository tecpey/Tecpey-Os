import { NextRequest } from "next/server";
import { POST as academyAuthPost } from "@/app/api/academy-auth/route";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const nextReq = new NextRequest(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ ...body, mode: "login" }),
  });
  return academyAuthPost(nextReq);
}
