import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/mentor-conversations" }, async () => {
    const limit = await rateLimit(req, { namespace: "mentor-conversations-read", limit: 60, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    if (!session.studentId) return apiError("academy_profile_required", 401);
    const studentId = session.studentId;

    const url = new URL(req.url);
    const rowLimit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit") || DEFAULT_LIMIT)));
    const cursorRaw = url.searchParams.get("cursor") ?? null;
    const cursor = cursorRaw && UUID_RE.test(cursorRaw) ? cursorRaw : null;

    const result = await withDb(async (client) => {
      const rows = await client.query(
        `SELECT mc.id, mc.role, mc.content, mc.locale, mc.created_at
         FROM mentor_conversations mc
         WHERE mc.student_id = $1::uuid
           AND mc.role IN ('user', 'assistant')
           AND (
             $2::uuid IS NULL
             OR (mc.created_at, mc.id::text) < (
               SELECT created_at, id::text
               FROM mentor_conversations
               WHERE id = $2::uuid
                 AND student_id = $1::uuid
             )
           )
         ORDER BY mc.created_at DESC, mc.id DESC
         LIMIT $3`,
        [studentId, cursor, rowLimit + 1],
      );

      const hasMore = rows.rows.length > rowLimit;
      const page = hasMore ? rows.rows.slice(0, rowLimit) : rows.rows;
      const nextCursor: string | null = hasMore ? (page[page.length - 1]?.id ?? null) : null;

      const conversations = page.map((r) => ({
        id: String(r.id),
        role: r.role as "user" | "assistant",
        content: String(r.content),
        locale: String(r.locale),
        createdAt: new Date(r.created_at).toISOString(),
      }));

      return { conversations, nextCursor };
    });

    if (!result.enabled) {
      return apiOk({ conversations: [], nextCursor: null, storage: "unavailable" });
    }

    return apiOk({ conversations: result.value?.conversations ?? [], nextCursor: result.value?.nextCursor ?? null });
  });
}
