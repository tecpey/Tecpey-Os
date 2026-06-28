import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { withDb } from "@/lib/db";
import {
  MEMORY_CATEGORIES,
  IMPORTANCE_LEVELS,
  saveMentorMemory,
  type MemoryCategory,
  type ImportanceLevel,
} from "@/lib/mentor-memory";
import { cleanText } from "@/lib/student-cartax";
import { apiOk, apiError } from "@/lib/api-validation";

export const dynamic = "force-dynamic";

// GET /api/mentor-memory
// Returns all structured memories for the authenticated student.
// Supports ?category=<cat> and ?minImportance=<1|5|10|100> filters.
export async function GET(req: NextRequest) {
  const limit = await rateLimit(req, { namespace: "mentor-memory-read", limit: 60, windowMs: 60_000 });
  if (!limit.ok) return apiError("rate_limited", 429);

  const session = await getCanonicalSession(req);
  if (!session.studentId) return apiError("academy_profile_required", 401);
  const studentId = session.studentId;

  const url = new URL(req.url);
  const categoryFilter = url.searchParams.get("category");
  const minImportance = Number(url.searchParams.get("minImportance") || "1");

  const result = await withDb(async (client) => {
    const params: unknown[] = [studentId, minImportance];
    const categoryClause =
      categoryFilter && (MEMORY_CATEGORIES as readonly string[]).includes(categoryFilter)
        ? `AND category = $${params.push(categoryFilter)}`
        : "";

    const rows = await client.query(
      `SELECT id, category, content, importance, created_at, updated_at
       FROM mentor_memories
       WHERE student_id = $1::uuid AND importance >= $2 ${categoryClause}
       ORDER BY importance DESC, created_at DESC
       LIMIT 100`,
      params,
    );
    return rows.rows.map((r) => ({
      id: r.id,
      category: r.category,
      content: r.content,
      importance: Number(r.importance),
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  });

  if (!result.enabled) {
    return apiOk({ memories: [], storage: "unavailable" });
  }

  return apiOk({ memories: result.value ?? [] });
}

// POST /api/mentor-memory
// Save a structured memory for the authenticated student.
// Body: { category, content, importance? }
export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return apiError("forbidden", 403);
  const limit = await rateLimit(req, { namespace: "mentor-memory-write", limit: 20, windowMs: 60_000 });
  if (!limit.ok) return apiError("rate_limited", 429);

  const session = await getCanonicalSession(req);
  if (!session.studentId) return apiError("academy_profile_required", 401);
  const studentId = session.studentId;

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 4_000) return apiError("payload_too_large", 413);
    body = JSON.parse(raw || "{}");
  } catch {
    return apiError("invalid_json", 400);
  }

  const category = cleanText(body.category, 40).toLowerCase();
  if (!(MEMORY_CATEGORIES as readonly string[]).includes(category)) {
    return NextResponse.json(
      { ok: false, error: "invalid_category", valid: MEMORY_CATEGORIES },
      { status: 400 },
    );
  }

  const content = cleanText(body.content, 2000);
  if (content.length < 4) {
    return apiError("content_too_short", 400);
  }

  const rawImportance = Number(body.importance ?? 5);
  const importance: ImportanceLevel = (IMPORTANCE_LEVELS as readonly number[]).includes(rawImportance)
    ? (rawImportance as ImportanceLevel)
    : 5;

  const saved = await saveMentorMemory(studentId, category as MemoryCategory, content, importance);
  if (!saved) {
    return apiError("storage_unavailable", 503);
  }

  return apiOk({ id: saved.id, category, importance });
}

// DELETE /api/mentor-memory?id=<uuid>
// Students may delete their own memory entries.
export async function DELETE(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return apiError("forbidden", 403);
  const limit = await rateLimit(req, { namespace: "mentor-memory-delete", limit: 20, windowMs: 60_000 });
  if (!limit.ok) return apiError("rate_limited", 429);

  const session = await getCanonicalSession(req);
  if (!session.studentId) return apiError("academy_profile_required", 401);
  const studentId = session.studentId;

  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return apiError("invalid_id", 400);
  }

  const result = await withDb(async (client) => {
    const res = await client.query(
      `DELETE FROM mentor_memories WHERE id = $1::uuid AND student_id = $2::uuid RETURNING id`,
      [id, studentId],
    );
    return res.rows.length > 0;
  });

  if (!result.enabled) return apiError("storage_unavailable", 503);
  if (!result.value) return apiError("not_found", 404);

  return apiOk({ deleted: id });
}
