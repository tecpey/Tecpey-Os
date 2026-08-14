import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
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
import { withObservability } from "@/lib/observe";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { requireTenantProduct } from "@/lib/security/tenant-product-entitlement";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/mentor-memory" }, async () => {
    const limit = await rateLimit(req, { namespace: "mentor-memory-read", limit: 60, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) {
      // A degraded revocation authority returns a guest session with
      // authorityDegraded:true and no studentId. Reporting that outage as the
      // same storage:"unavailable" this route already uses keeps it from telling
      // a still-valid user their academy profile is gone.
      if (session.authorityDegraded) return apiOk({ memories: [], storage: "unavailable" });
      return apiError("academy_profile_required", 401);
    }
    // mentor_memories is student_global (classification registry): no tenant
    // column, so reading it by session.studentId alone served the student their
    // mentor memories on any tenant's branded host. Resolving the acting tenant
    // confirms the student is bound to it and refuses a foreign host, and lets
    // the Mentor product gate run on this read.
    const tenantContext = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "student",
      scopes: ["academy:learning-events:read"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    // Only an outage makes an empty list a lie. A binding that could not be read
    // preserves storage:"unavailable"; an ordinary authorization outcome —
    // unbound, revoked, a workspace mismatch, or a foreign branded host — is not
    // an outage, so it returns the honest graceful empty instead of a false alert.
    if (!tenantContext.available) {
      if (tenantContext.reason === "binding_storage_unavailable") {
        return apiOk({ memories: [], storage: "unavailable" });
      }
      return apiOk({ memories: [] });
    }
    const productGate = await requireTenantProduct(tenantContext.tenantId, "mentor");
    if (productGate) return productGate;
    const studentId = tenantContext.principalId;

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
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/mentor-memory" }, async () => {
    if (!await verifyCsrfOrigin(req))
      return apiError("forbidden", 403);
    const limit = await rateLimit(req, { namespace: "mentor-memory-write", limit: 20, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("academy_profile_required", 401);
    // A write must resolve the acting tenant before it stores anything: it
    // confirms the student's binding, refuses a foreign branded host, and gates
    // the Mentor product. Any not-available outcome fails closed with a 503 —
    // the same fail-closed a write takes when its storage is down — rather than
    // writing a memory under a tenant the student may not act in.
    const tenantContext = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "student",
      scopes: ["academy:learning-events:write"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    if (!tenantContext.available) return apiError("mentor_memory_unavailable", 503);
    const productGate = await requireTenantProduct(tenantContext.tenantId, "mentor");
    if (productGate) return productGate;
    const studentId = tenantContext.principalId;

    let body: Record<string, unknown>;
    try {
      const boundedBodyRequest = await readBoundedJsonRequest(req, {
        maxBytes: 16_000,
        allowEmptyObject: true,
      });
      if (!boundedBodyRequest.ok) {
        return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
      }
      req = boundedBodyRequest.request;
      const raw = await req.text();
      if (raw.length > 4_000) return apiError("payload_too_large", 413);
      body = JSON.parse(raw || "{}");
    } catch {
      return apiError("invalid_json", 400);
    }

    const category = cleanText(body.category, 40).toLowerCase();
    if (!(MEMORY_CATEGORIES as readonly string[]).includes(category)) {
      return apiError("invalid_category", 400, { valid: MEMORY_CATEGORIES });
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
  });
}

export async function DELETE(req: NextRequest) {
  return withObservability(req, { route: "/api/mentor-memory" }, async () => {
    if (!await verifyCsrfOrigin(req))
      return apiError("forbidden", 403);
    const limit = await rateLimit(req, { namespace: "mentor-memory-delete", limit: 20, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("academy_profile_required", 401);
    // Same edge as the write: resolve the acting tenant, refuse a foreign host,
    // and gate the Mentor product before deleting. The DELETE already scopes to
    // the student id, so resolving it from the bound principal keeps a request on
    // one tenant's host from deleting a memory read under another.
    const tenantContext = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "student",
      scopes: ["academy:learning-events:write"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    if (!tenantContext.available) return apiError("mentor_memory_unavailable", 503);
    const productGate = await requireTenantProduct(tenantContext.tenantId, "mentor");
    if (productGate) return productGate;
    const studentId = tenantContext.principalId;

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
  });
}
