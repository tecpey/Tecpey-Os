import { NextRequest, NextResponse } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

// UUID v4 pattern — used to validate ?cursor query param.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/mentor-conversations
// Returns the most-recent N conversation turns for the authenticated student.
//
// Query params:
//   ?limit=20     — number of rows (1–50, default 20)
//   ?cursor=<id>  — UUID of the oldest row from the previous page (next-page token)
//
// Response:
//   { ok: true, conversations: ConversationItem[], nextCursor: string | null }
//
// Security:
//   - session.studentId mandatory (401 otherwise)
//   - WHERE student_id = $1 on every query — students can never read each other's data
//   - Only 'user' and 'assistant' roles are returned (system messages are internal)
//   - Prepared statements only; no dynamic SQL construction
//   - Raw DB errors are never forwarded to the client
export async function GET(req: NextRequest) {
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
    // Cursor-based pagination: use the row id to look up its created_at, then filter by
    // (created_at, id) < (cursor_created_at, cursor_id) to avoid OFFSET on large tables.
    // Fetch limit+1 to determine whether a next page exists.
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

  return NextResponse.json({
    ok: true,
    conversations: result.value?.conversations ?? [],
    nextCursor: result.value?.nextCursor ?? null,
  });
}
