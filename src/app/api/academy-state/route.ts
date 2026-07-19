import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { withTx } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { apiError, apiOk } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { refreshAcademyProgressProjection } from "@/lib/academy-progress-projection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLocale(value: unknown): "fa" | "en" {
  return value === "en" ? "en" : "fa";
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-state" }, async () => {
    const limit = await rateLimit(req, { namespace: "academy-state-read", limit: 120, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    if (!session.studentId) return apiError("complete_account_required", 401);
    const locale = parseLocale(new URL(req.url).searchParams.get("locale"));

    const result = await withTx((client) => refreshAcademyProgressProjection(client, session.studentId as string, locale));
    if (!result.enabled) return apiError("progress_service_not_configured", 503);
    return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-state" }, async () => apiError(
    "academy_state_read_only",
    405,
    { authority: "server_projection_v1" },
    { Allow: "GET", "Cache-Control": "no-store, max-age=0" },
  ));
}
