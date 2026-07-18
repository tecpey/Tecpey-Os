import { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { withDb, withTx } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { apiError, apiOk, checkBodySize } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { cleanText } from "@/lib/student-cartax";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
import {
  XP_TABLE,
  applyAcademyProgressAction,
  createDefaultAcademyProgressState,
  normalizeAcademyProgressState,
  type AcademyProgressAction,
} from "@/lib/academy-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_XP_REWARDS = new Set<number>(Object.values(XP_TABLE));

function parseLocale(value: unknown): "fa" | "en" {
  return value === "en" ? "en" : "fa";
}

function parseScore(value: unknown): number | null {
  const score = Math.round(Number(value));
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}

function parseAction(value: unknown): AcademyProgressAction | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  if (raw.type === "award_xp") {
    const amount = Math.round(Number(raw.amount));
    return ALLOWED_XP_REWARDS.has(amount) ? { type: "award_xp", amount } : null;
  }

  if (raw.type === "lesson_complete") {
    const lessonId = cleanText(raw.lessonId, 160);
    const score = parseScore(raw.score);
    const termNumber = Math.round(Number(raw.termNumber));
    const completedAt = Number(raw.completedAt);
    if (!lessonId || score === null || termNumber < 1 || termNumber > 7) return null;
    return {
      type: "lesson_complete",
      lessonId,
      score,
      termNumber,
      completedAt: Number.isFinite(completedAt) ? completedAt : Date.now(),
    };
  }

  if (raw.type === "module_score") {
    const moduleId = cleanText(raw.moduleId, 160);
    const score = parseScore(raw.score);
    if (!moduleId || score === null) return null;
    return { type: "module_score", moduleId, score };
  }

  if (raw.type === "pass_term") {
    const termNumber = Math.round(Number(raw.termNumber));
    if (termNumber < 1 || termNumber > 7) return null;
    return { type: "pass_term", termNumber };
  }

  if (raw.type === "award_badge") {
    const badgeCode = cleanText(raw.badgeCode, 120);
    if (!badgeCode) return null;
    return { type: "award_badge", badgeCode };
  }

  return null;
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
  return withObservability(req, { route: "/api/academy-state" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    if (!checkBodySize(req.headers.get("content-length"), 24_000)) return apiError("payload_too_large", 413);

    const limit = await rateLimit(req, { namespace: "academy-state-write", limit: 90, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("complete_account_required", 401);

    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return apiError("invalid_json", 400);
    }

    const locale = parseLocale(body.locale);
    const action = parseAction(body.action);
    if (!action) return apiError("invalid_action", 400);

    const result = await withTx(async (client) => {
      const existing = await client.query<{ progress: unknown; revision: string }>(
        `SELECT progress, revision::text
         FROM academy_state_documents
         WHERE student_id = $1::uuid AND locale = $2
         FOR UPDATE`,
        [session.studentId, locale],
      );

      const previous = existing.rows[0]
        ? normalizeAcademyProgressState(existing.rows[0].progress)
        : createDefaultAcademyProgressState();
      const next = applyAcademyProgressAction(previous, action);

      const saved = await client.query<{ revision: string; updated_at: string }>(
        `INSERT INTO academy_state_documents
           (student_id, locale, schema_version, revision, progress, created_at, updated_at)
         VALUES ($1::uuid, $2, 1, 1, $3::jsonb, NOW(), NOW())
         ON CONFLICT (student_id, locale) DO UPDATE SET
           progress = EXCLUDED.progress,
           revision = academy_state_documents.revision + 1,
           schema_version = 1,
           updated_at = NOW()
         RETURNING revision::text, updated_at`,
        [session.studentId, locale, JSON.stringify(next)],
      );

      await client.query(
        `INSERT INTO academy_student_events (student_id, event_type, payload)
         VALUES ($1::uuid, 'academy_state_mutated', $2::jsonb)`,
        [session.studentId, JSON.stringify({ locale, action, ip: getClientIp(req) })],
      );

      return {
        state: next,
        revision: Number(saved.rows[0]?.revision ?? 1),
        updatedAt: saved.rows[0]?.updated_at ?? new Date().toISOString(),
      };
    });

    if (!result.enabled) return apiError("progress_service_not_configured", 503);
    scheduleMentorProfileUpdate(session.studentId, "academy_progress_updated");
    return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}
