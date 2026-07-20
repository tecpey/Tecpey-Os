import { readJsonBody } from "@/lib/security/request-body";
import { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { withDb, withTx } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { apiError, apiOk } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
import {
  normalizeLessonId,
  normalizeReflectionMap,
  normalizeReflectionText,
  saveReflectionEntry,
} from "@/lib/academy-reflections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLocale(value: unknown): "fa" | "en" {
  return value === "en" ? "en" : "fa";
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-reflections" }, async () => {
    const limit = await rateLimit(req, { namespace: "academy-reflection-read", limit: 120, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    if (!session.studentId) return apiError("complete_account_required", 401);

    const url = new URL(req.url);
    const locale = parseLocale(url.searchParams.get("locale"));
    const lessonId = normalizeLessonId(url.searchParams.get("lessonId"));
    if (!lessonId) return apiError("invalid_lesson_id", 400);

    const result = await withDb(async (client) => {
      const row = await client.query<{
        reflections: unknown;
        reflection_revision: string;
        memory_updated_at: string | null;
      }>(
        `SELECT reflections, reflection_revision::text, memory_updated_at
         FROM academy_state_documents
         WHERE student_id = $1::uuid AND locale = $2
         LIMIT 1`,
        [session.studentId, locale],
      );
      const found = row.rows[0];
      const reflections = normalizeReflectionMap(found?.reflections);
      const reflection = reflections[lessonId] ?? null;
      return {
        reflection,
        revision: reflection?.revision ?? 0,
        collectionRevision: found ? Number(found.reflection_revision) : 0,
        updatedAt: found?.memory_updated_at ?? null,
      };
    });

    if (!result.enabled) return apiError("reflection_service_not_configured", 503);
    return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}

export async function PUT(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-reflections" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, { namespace: "academy-reflection-write", limit: 60, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("complete_account_required", 401);

    const bodyResult = await readJsonBody<Record<string, unknown>>(req, {
      maxBytes: 16_384,
      allowEmptyObject: true,
    });
    if (!bodyResult.ok) return apiError(bodyResult.error, bodyResult.status);
    const body = bodyResult.value;

    const locale = parseLocale(body.locale);
    const lessonId = normalizeLessonId(body.lessonId);
    const text = normalizeReflectionText(body.text);
    const expectedRevision = Number(body.expectedRevision);
    if (!lessonId || !text || !Number.isInteger(expectedRevision) || expectedRevision < 0) {
      return apiError("invalid_reflection", 400);
    }

    const result = await withTx(async (client) => {
      // SELECT ... FOR UPDATE cannot lock a row that does not exist yet. The
      // transaction-scoped advisory lock serializes the initial insert and all
      // later JSON-document rewrites for this student/locale, preventing a
      // cross-device first-write race from silently losing one reflection.
      await client.query(
        `SELECT pg_advisory_xact_lock(
           hashtext('academy_reflections'),
           hashtext($1)
         )`,
        [`${session.studentId}:${locale}`],
      );

      const row = await client.query<{
        reflections: unknown;
        reflection_revision: string;
      }>(
        `SELECT reflections, reflection_revision::text
         FROM academy_state_documents
         WHERE student_id = $1::uuid AND locale = $2
         FOR UPDATE`,
        [session.studentId, locale],
      );

      const currentRow = row.rows[0];
      const reflections = normalizeReflectionMap(currentRow?.reflections);
      const currentReflection = reflections[lessonId] ?? null;
      const currentRevision = currentReflection?.revision ?? 0;
      const collectionRevision = currentRow ? Number(currentRow.reflection_revision) : 0;

      if (currentRevision !== expectedRevision) {
        return {
          conflict: true as const,
          reflection: currentReflection,
          revision: currentRevision,
          collectionRevision,
        };
      }

      const reflection = saveReflectionEntry(reflections, lessonId, text);
      const nextReflections = { ...reflections, [lessonId]: reflection };
      const saved = await client.query<{
        reflection_revision: string;
        memory_updated_at: string;
      }>(
        `INSERT INTO academy_state_documents
           (student_id, locale, schema_version, revision, progress, reflections,
            reflection_revision, created_at, updated_at, memory_updated_at)
         VALUES ($1::uuid, $2, 1, 1, '{}'::jsonb, $3::jsonb, 1, NOW(), NOW(), NOW())
         ON CONFLICT (student_id, locale) DO UPDATE SET
           reflections = EXCLUDED.reflections,
           reflection_revision = academy_state_documents.reflection_revision + 1,
           memory_updated_at = NOW(),
           updated_at = NOW()
         RETURNING reflection_revision::text, memory_updated_at`,
        [session.studentId, locale, JSON.stringify(nextReflections)],
      );

      await client.query(
        `INSERT INTO academy_student_events (student_id, event_type, payload)
         VALUES ($1::uuid, 'learning_reflection_saved', $2::jsonb)`,
        [session.studentId, JSON.stringify({
          locale,
          lessonId,
          textLength: reflection.text.length,
          revision: reflection.revision,
          ip: getClientIp(req),
        })],
      );

      return {
        conflict: false as const,
        reflection,
        revision: reflection.revision,
        collectionRevision: Number(saved.rows[0]?.reflection_revision ?? collectionRevision + 1),
        updatedAt: saved.rows[0]?.memory_updated_at ?? new Date().toISOString(),
      };
    });

    if (!result.enabled) return apiError("reflection_service_not_configured", 503);
    if (result.value.conflict) {
      return apiError("revision_conflict", 409, {
        reflection: result.value.reflection,
        revision: result.value.revision,
        collectionRevision: result.value.collectionRevision,
      });
    }

    scheduleMentorProfileUpdate(session.studentId, "reflection_updated");
    return apiOk({
      reflection: result.value.reflection,
      revision: result.value.revision,
      collectionRevision: result.value.collectionRevision,
      updatedAt: result.value.updatedAt,
    }, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}
