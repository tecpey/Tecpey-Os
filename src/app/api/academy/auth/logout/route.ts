import { DELETE as academyAuthDelete } from "@/app/api/academy-auth/route";
import { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { apiError } from "@/lib/api-validation";

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return apiError("forbidden", 403);
  return academyAuthDelete(req);
}
