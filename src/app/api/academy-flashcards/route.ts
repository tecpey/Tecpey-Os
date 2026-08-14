import { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { withDb, withTx } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { apiError, apiOk, checkBodySize } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
import { normalizeDeck } from "@/lib/spaced-repetition";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { requireTenantProduct } from "@/lib/security/tenant-product-entitlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLocale(value: unknown): "fa" | "en" {
  return value === "en" ? "en" : "fa";
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-flashcards" }, async () => {
    const limit = await rateLimit(req, { namespace: "academy-flashcards-read", limit: 120, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) {
      // A degraded revocation authority returns a guest with no studentId; that
      // outage must not masquerade as a missing account.
      if (session.authorityDegraded) return apiError("flashcard_service_not_configured", 503);
      return apiError("complete_account_required", 401);
    }
    // academy_state_documents is student_global (classification registry): keyed
    // by student_id with no tenant column, so reading it by session.studentId
    // alone served the deck on any tenant's branded host. Resolving the acting
    // tenant confirms the binding, refuses a foreign host, and gates Academy.
    const tenantContext = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "student",
      scopes: ["academy:learning-events:read"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    if (!tenantContext.available) {
      // A binding-storage outage is a service failure (503); an ordinary
      // authorization outcome — unbound, revoked, workspace mismatch, foreign
      // host — is a refusal (403), not a fabricated empty deck.
      if (tenantContext.reason === "binding_storage_unavailable") return apiError("flashcard_service_not_configured", 503);
      return apiError("forbidden", 403);
    }
    const productGate = await requireTenantProduct(tenantContext.tenantId, "academy");
    if (productGate) return productGate;
    const studentId = tenantContext.principalId;
    const locale = parseLocale(new URL(req.url).searchParams.get("locale"));

    const result = await withDb(async (client) => {
      const row = await client.query<{ flashcards: unknown; flashcard_revision: string; memory_updated_at: string | null }>(
        `SELECT flashcards, flashcard_revision::text, memory_updated_at
         FROM academy_state_documents
         WHERE student_id = $1::uuid AND locale = $2
         LIMIT 1`,
        [studentId, locale],
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
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    if (!checkBodySize(req.headers.get("content-length"), 512_000)) return apiError("payload_too_large", 413);

    const limit = await rateLimit(req, { namespace: "academy-flashcards-write", limit: 90, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("complete_account_required", 401);
    // The write resolves the acting tenant before it saves anything: it confirms
    // the student's binding, refuses a foreign branded host, and gates Academy.
    // Any not-available outcome fails closed rather than writing the deck under a
    // tenant the student may not act in.
    const tenantContext = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "student",
      scopes: ["academy:learning-events:write"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    if (!tenantContext.available) return apiError("flashcard_service_not_configured", 503);
    const productGate = await requireTenantProduct(tenantContext.tenantId, "academy");
    if (productGate) return productGate;
    const studentId = tenantContext.principalId;

    let body: Record<string, unknown>;
    try {
      const boundedBodyRequest = await readBoundedJsonRequest(req, {
        maxBytes: 512_000,
      });
      if (!boundedBodyRequest.ok) {
        return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
      }
      req = boundedBodyRequest.request;
      body = await req.json() as Record<string, unknown>;
    } catch {
      return apiError("invalid_json", 400);
    }

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
        [studentId, locale],
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
        [studentId, locale, JSON.stringify(cards)],
      );

      await client.query(
        `INSERT INTO academy_student_events (student_id, event_type, payload)
         VALUES ($1::uuid, 'flashcard_deck_saved', $2::jsonb)`,
        [studentId, JSON.stringify({ locale, cardCount: cards.length, ip: getClientIp(req) })],
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

    scheduleMentorProfileUpdate(studentId, "flashcards_updated");
    return apiOk({
      cards: result.value.cards,
      revision: result.value.revision,
      updatedAt: result.value.updatedAt,
    }, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}
