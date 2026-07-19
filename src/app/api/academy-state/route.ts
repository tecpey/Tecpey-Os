import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { withDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { apiError, apiOk } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import {
  createDefaultAcademyProgressState,
  normalizeAcademyProgressState,
} from "@/lib/academy-progress";

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

    const result = await withDb(async (client) => {
      const row = await client.query<{ progress: unknown; revision: string; updated_at: string }>(
        `SELECT progress, revision::text, updated_at
         FROM academy_state_documents
         WHERE student_id = $1::uuid AND locale = $2
         LIMIT 1`,
        [session.studentId, locale],
      );
      const found = row.rows[0];
      return {
        state: found ? normalizeAcademyProgressState(found.progress) : createDefaultAcademyProgressState(),
        revision: found ? Number(found.revision) : 0,
        updatedAt: found?.updated_at ?? null,
      };
    });

    if (!result.enabled) return apiError("progress_service_not_configured", 503);
    return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-state" }, async () =>
    apiError("academy_state_is_read_only", 405, {
      allowed: ["GET"],
      message: "Academy progress can only be issued by server-verified learning events.",
    }),
  );
}
