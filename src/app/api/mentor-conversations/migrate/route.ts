import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { withDb } from "@/lib/db";
import { cleanText } from "@/lib/student-cartax";
import { apiOk, apiError } from "@/lib/api-validation";

export const dynamic = "force-dynamic";

// POST /api/mentor-conversations/migrate
// One-shot endpoint: imports chat history that was stored in localStorage (pre-Phase 8)
// into the server-side mentor_conversations table.
//
// The widget calls this at most once per student (guarded by a localStorage migration flag).
// Rate-limited to 3 requests per hour per student to prevent abuse.
//
// Body: { messages: { role: "user"|"assistant", content: string, at: number }[] }
// Response: { ok: true, imported: N }
//
// Security:
//   - session.studentId mandatory
//   - role validated against allowlist; content sanitized and length-capped
//   - timestamps: client-provided `at` (milliseconds) validated as a reasonable date range
//   - No duplicate-detection: the widget's migration flag (localStorage) prevents re-calls
export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return apiError("forbidden", 403);
  const limit = await rateLimit(req, { namespace: "mentor-conversations-migrate", limit: 3, windowMs: 60 * 60_000 });
  if (!limit.ok) return apiError("rate_limited", 429);

  const session = await getCanonicalSession(req);
  if (!session.studentId) return apiError("academy_profile_required", 401);
  const studentId = session.studentId;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("invalid_body", 400);
  }

  const rawMessages = (body as { messages?: unknown[] })?.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return apiOk({ imported: 0 });
  }

  // Validate and sanitize each message from localStorage.
  const validRoles = new Set(["user", "assistant"]);
  const now = Date.now();
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

  type ValidatedMessage = { role: string; content: string; ts: Date };
  const messages: ValidatedMessage[] = [];

  for (const item of rawMessages.slice(0, 50)) {
    const m = item as Record<string, unknown>;
    if (!validRoles.has(String(m.role ?? ""))) continue;
    const content = cleanText(m.content, 2000);
    if (!content) continue;
    const at = Number(m.at ?? 0);
    // Reject timestamps that are clearly invalid (future or more than 1 year old).
    if (!at || at > now + 60_000 || at < oneYearAgo) continue;
    messages.push({ role: String(m.role), content, ts: new Date(at) });
  }

  if (messages.length === 0) {
    return apiOk({ imported: 0 });
  }

  const result = await withDb(async (client) => {
    let imported = 0;
    for (const { role, content, ts } of messages) {
      await client.query(
        `INSERT INTO mentor_conversations (student_id, role, content, locale, created_at)
         VALUES ($1::uuid, $2, $3, 'fa', $4)
         ON CONFLICT DO NOTHING`,
        [studentId, role, content, ts],
      );
      imported++;
    }
    return { imported };
  });

  if (!result.enabled) {
    return apiOk({ imported: 0, storage: "unavailable" });
  }

  return apiOk({ imported: result.value?.imported ?? 0 });
}
