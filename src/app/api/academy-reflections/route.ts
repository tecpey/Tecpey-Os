import { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { withDb, withTx } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { apiError, apiOk, checkBodySize } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
import {
  normalizeLessonId,
  normalizeReflectionMap,
  normalizeReflectionText,
  saveReflectionEntry,
} from "@/lib/academy-reflections";
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
  return withObservability(req, { route: "/api/academy-reflections" }, async () => {
    const limit = await rateLimit(req, { namespace: "academy-reflection-read", limit: 120, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) {
      // A degraded revocation authority returns a guest with no studentId; that
      // outage must not masquerade as a missing account.
      if (session.authorityDegraded) return apiError("reflection_service_not_configured", 503);
      return apiError("complete_account_required", 401);
    }
    // academy_state_documents is student_global (classification registry): keyed
    // by student_id with no tenant column, so reading it by session.studentId
    // alone served the reflections on any tenant's branded host. Resolving the
    // acting tenant confirms the binding, refuses a foreign host, and gates Academy.
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
      // host — is a refusal (403), not a fabricated empty reflection.
      if (tenantContext.reason === "binding_storage_unavailable") return apiError("reflection_service_not_configured", 503);
      return apiError("forbidden", 403);
    }
    const productGate = await requireTenantProduct(tenantContext.tenantId, "academy");
    if (productGate) return productGate;
    const studentId = tenantContext.principalId;

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
        [studentId, locale],
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
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    if (!checkBodySize(req.headers.get("content-length"), 16_384)) return apiError("payload_too_large", 413);

    const limit = await rateLimit(req, { namespace: "academy-reflection-write", limit: 60, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("complete_account_required", 401);
    // The write resolves the acting tenant before it saves anything: it confirms
    // the student's binding, refuses a foreign branded host, and gates Academy.
    // Any not-available outcome fails closed rather than writing the reflection
    // under a tenant the student may not act in.
    const tenantContext = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "student",
      scopes: ["academy:learning-events:write"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    if (!tenantContext.available) return apiError("reflection_service_not_configured", 503);
    const productGate = await requireTenantProduct(tenantContext.tenantId, "academy");
    if (productGate) return productGate;
    const studentId = tenantContext.principalId;

    let body: Record<string, unknown>;
    try {
      const boundedBodyRequest = await readBoundedJsonRequest(req, {
        maxBytes: 16_384,
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
        [`${studentId}:${locale}`],
      );

      const row = await client.query<{
        reflections: unknown;
        reflection_revision: string;
      }>(
        `SELECT reflections, reflection_revision::text
         FROM academy_state_documents
         WHERE student_id = $1::uuid AND locale = $2
         FOR UPDATE`,
        [studentId, locale],
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
        [studentId, locale, JSON.stringify(nextReflections)],
      );

      await client.query(
        `INSERT INTO academy_student_events (student_id, event_type, payload)
         VALUES ($1::uuid, 'learning_reflection_saved', $2::jsonb)`,
        [studentId, JSON.stringify({
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

    scheduleMentorProfileUpdate(studentId, "reflection_updated");
    return apiOk({
      reflection: result.value.reflection,
      revision: result.value.revision,
      collectionRevision: result.value.collectionRevision,
      updatedAt: result.value.updatedAt,
    }, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}
