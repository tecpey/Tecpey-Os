import { GET as academyAuthGet } from "@/app/api/academy-auth/route";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  return academyAuthGet(req);
}
