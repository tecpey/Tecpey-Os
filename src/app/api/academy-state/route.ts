import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { withTx } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { apiError, apiOk } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { refreshAcademyProgressProjection } from "@/lib/academy-progress-projection";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { requireTenantProduct } from "@/lib/security/tenant-product-entitlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLocale(value: unknown): "fa" | "en" {
  return value === "en" ? "en" : "fa";
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-state" }, async () => {
    const limit = await rateLimit(req, {
      namespace: "academy-state-read",
      limit: 120,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) {
      // A degraded revocation authority returns a guest with no studentId; that
      // outage must not masquerade as a missing account.
      if (session.authorityDegraded) return apiError("progress_service_not_configured", 503);
      return apiError("complete_account_required", 401);
    }
    // The progress projection reads academy_term_progress, which is tenant-scoped
    // (multi-tenant #20): resolving the acting tenant confirms the student's
    // binding, refuses a foreign branded host, gates Academy, and scopes the
    // term-progress read to this tenant instead of every tenant the student is
    // bound to.
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
      // host — is a refusal (403).
      if (tenantContext.reason === "binding_storage_unavailable") return apiError("progress_service_not_configured", 503);
      return apiError("forbidden", 403);
    }
    const productGate = await requireTenantProduct(tenantContext.tenantId, "academy");
    if (productGate) return productGate;
    const locale = parseLocale(new URL(req.url).searchParams.get("locale"));

    const result = await withTx((client) =>
      refreshAcademyProgressProjection(client, tenantContext.principalId, locale),
    );
    if (!result.enabled) return apiError("progress_service_not_configured", 503);
    return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-state" }, async () =>
    apiError(
      "academy_state_read_only",
      405,
      { authority: "server_projection_v2" },
      { Allow: "GET", "Cache-Control": "no-store, max-age=0" },
    ),
  );
}
