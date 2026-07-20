import { readJsonBody } from "@/lib/security/request-body";
import { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { withDb, withTx } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { apiError, apiOk } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
import { normalizeDeck } from "@/lib/spaced-repetition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLocale(value: unknown): "fa" | "en" {
  return value === "en" ? "en" : "fa";
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-flashcards" }, async () => {
    const limit = await rateLimit(req, { namespace: "academy-flashcards-read", limit: 120, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    if (!session.studentId) return apiError("complete_account_required", 401);
    const locale = parseLocale(new URL(req.url).searchParams.get("locale"));

    const result = await withDb(async (client) => {
      const row = await client.query<{ flashcards: unknown; flashcard_revision: string; memory_updated_at: string | null }>(
        `SELECT flashcards, flashcard_revision::text, memory_updated_at
         FROM academy_state_documents
         WHERE student_id = $1::uuid AND locale = $2
         LIMIT 1`,
        [session.studentId, locale],
      );
      const found = row.rows[0];
      return {
        cards: normalizeDeck(found?.flashcards),
        revision: found ? Number(found.flashcard_revision) : 0,
        updatedAt: found?.memory_updated_at ?? null,
      };
    });

    if (!result.enabled) return apiError("flashcard_service_not_configured", 503);
    return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}

export async function PUT(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-flashcards" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, { namespace: "academy-flashcards-write", limit: 90, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("complete_account_required", 401);

    const bodyResult = await readJsonBody<Record<string, unknown>>(req, {
      maxBytes: 512_000,
      allowEmptyObject: true,
    });
    if (!bodyResult.ok) return apiError(bodyResult.error, bodyResult.status);
    const body = bodyResult.value;

    const locale = parseLocale(body.locale);
    const expectedRevision = Math.max(0, Math.round(Number(body.expectedRevision) || 0));
    if (!Array.isArray(body.cards) || body.cards.length > 2000) {
      return apiError("invalid_flashcards", 400);
    }
    const cards = normalizeDeck(body.cards);

    const result = await withTx(async (client) => {
      const row = await client.query<{ flashcards: unknown; flashcard_revision: string }>(
        `SELECT flashcards, flashcard_revision::text
         FROM academy_state_documents
         WHERE student_id = $1::uuid AND locale = $2
         FOR UPDATE`,
        [session.studentId, locale],
      );

      const current = row.rows[0];
      const currentRevision = current ? Number(current.flashcard_revision) : 0;
      const currentCards = normalizeDeck(current?.flashcards);
      if (currentRevision !== expectedRevision) {
        return { conflict: true as const, cards: currentCards, revision: currentRevision };
      }

      const saved = await client.query<{ flashcard_revision: string; memory_updated_at: string }>(
        `INSERT INTO academy_state_documents
           (student_id, locale, schema_version, revision, progress, flashcards, flashcard_revision, created_at, updated_at, memory_updated_at)
         VALUES ($1::uuid, $2, 1, 1, '{}'::jsonb, $3::jsonb, 1, NOW(), NOW(), NOW())
         ON CONFLICT (student_id, locale) DO UPDATE SET
           flashcards = EXCLUDED.flashcards,
           flashcard_revision = academy_state_documents.flashcard_revision + 1,
           memory_updated_at = NOW(),
           updated_at = NOW()
         RETURNING flashcard_revision::text, memory_updated_at`,
        [session.studentId, locale, JSON.stringify(cards)],
      );

      await client.query(
        `INSERT INTO academy_student_events (student_id, event_type, payload)
         VALUES ($1::uuid, 'flashcard_deck_saved', $2::jsonb)`,
        [session.studentId, JSON.stringify({ locale, cardCount: cards.length, ip: getClientIp(req) })],
      );

      return {
        conflict: false as const,
        cards,
        revision: Number(saved.rows[0]?.flashcard_revision ?? currentRevision + 1),
        updatedAt: saved.rows[0]?.memory_updated_at ?? new Date().toISOString(),
      };
    });

    if (!result.enabled) return apiError("flashcard_service_not_configured", 503);
    if (result.value.conflict) {
      return apiError("revision_conflict", 409, {
        cards: result.value.cards,
        revision: result.value.revision,
      });
    }

    scheduleMentorProfileUpdate(session.studentId, "flashcards_updated");
    return apiOk({
      cards: result.value.cards,
      revision: result.value.revision,
      updatedAt: result.value.updatedAt,
    }, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}
