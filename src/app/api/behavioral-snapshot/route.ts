import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiError, apiOk } from "@/lib/api-validation";
import { computeBehavioralSnapshot } from "@/lib/behavioral-engine";
import { collectBehavioralInputs } from "@/lib/behavioral-context-server";
import { rateLimit } from "@/lib/rate-limit";
import { withObservability } from "@/lib/observe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLocale(value: string | null): "fa" | "en" {
  return value === "en" ? "en" : "fa";
}

export async function GET(request: NextRequest) {
  return withObservability(request, { route: "/api/behavioral-snapshot" }, async () => {
    const limit = await rateLimit(request, {
      namespace: "behavioral-snapshot-read",
      limit: 60,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(request);
    if (!session.studentId) return apiError("complete_account_required", 401);

    const locale = parseLocale(new URL(request.url).searchParams.get("locale"));
    const inputs = await collectBehavioralInputs(session.studentId, locale);
    if (!inputs) return apiError("behavioral_service_not_configured", 503);

    return apiOk({
      snapshot: computeBehavioralSnapshot(inputs),
      source: "server",
    }, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}
