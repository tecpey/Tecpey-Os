import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { requireTenantProduct } from "@/lib/security/tenant-product-entitlement";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/mentor-conversations" }, async () => {
    const limit = await rateLimit(req, { namespace: "mentor-conversations-read", limit: 60, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) {
      // A degraded revocation authority returns a guest session with
      // authorityDegraded:true and no studentId. Reporting that outage as the
      // same storage:"unavailable" this route already uses keeps it from telling
      // a still-valid user their academy profile is gone.
      if (session.authorityDegraded) return apiOk({ conversations: [], nextCursor: null, storage: "unavailable" });
      return apiError("academy_profile_required", 401);
    }
    // mentor_conversations is student_global (classification registry): no tenant
    // column, so reading it by session.studentId alone served the student their
    // chat history on any tenant's branded host. Resolving the acting tenant
    // confirms the student is bound to it and refuses a foreign host, and lets
    // the Mentor product gate run on this read.
    const tenantContext = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "student",
      scopes: ["academy:learning-events:read"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    // Only an outage makes an empty history a lie. A binding that could not be
    // read preserves storage:"unavailable"; an ordinary authorization outcome —
    // unbound, revoked, a workspace mismatch, or a foreign branded host — is not
    // an outage, so it returns the honest graceful empty instead of a false alert.
    if (!tenantContext.available) {
      if (tenantContext.reason === "binding_storage_unavailable") {
        return apiOk({ conversations: [], nextCursor: null, storage: "unavailable" });
      }
      return apiOk({ conversations: [], nextCursor: null });
    }
    const productGate = await requireTenantProduct(tenantContext.tenantId, "mentor");
    if (productGate) return productGate;
    const studentId = tenantContext.principalId;

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
