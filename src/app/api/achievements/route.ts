import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { fallbackAchievementSnapshot, getAchievementSnapshot } from "@/lib/phase5-achievement-engine";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { recordDegradedRead } from "@/lib/degraded-read";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { requireTenantProduct } from "@/lib/security/tenant-product-entitlement";

const ROUTE = "/api/achievements";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: ROUTE }, async () => {
    const limit = await rateLimit(req, { namespace: "academy-achievements-read", limit: 90, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const locale = cleanText(new URL(req.url).searchParams.get("locale") || "fa", 10) === "en" ? "en" : "fa";
    // student_achievements is student_global (classification registry): keyed by
    // student_id with no tenant column, so a student bound to two tenants saw the
    // same badges under either. The read now resolves the acting tenant and
    // confirms the student's binding to it, with strict revocation, before
    // reading — the same shape academy-certificates uses, including how it keeps
    // an outage from masquerading as "no achievements".
    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) {
      // A genuinely empty answer is only a lie when the authority was
      // unreachable. A visitor with no cookie, an expired or revoked one, or an
      // account-only session all really have nothing to show; only a degraded
      // authority reports an outage instead.
      if (session.authorityDegraded) {
        recordDegradedRead(ROUTE, "session_authority_unavailable");
        return apiOk({ authenticated: true, degraded: true, achievements: fallbackAchievementSnapshot(locale) });
      }
      return apiOk({ authenticated: false, achievements: fallbackAchievementSnapshot(locale) });
    }
    const tenantContext = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "student",
      scopes: ["academy:learning-events:read"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    // The student has a session but their binding could not be resolved — the
    // directory or the binding store is unavailable, or they are bound only to
    // another tenant. Reporting an outage beats reporting an empty shelf.
    if (!tenantContext.available) {
      recordDegradedRead(ROUTE, "tenant_context_unavailable");
      return apiOk({ authenticated: true, degraded: true, achievements: fallbackAchievementSnapshot(locale) });
    }
    const productGate = await requireTenantProduct(tenantContext.tenantId, "academy");
    if (productGate) return productGate;
    try {
      const result = await withDb((client) => getAchievementSnapshot(client, tenantContext.principalId));
      if (!result.enabled) {
        recordDegradedRead(ROUTE, "storage_unavailable");
        return apiOk({ authenticated: true, degraded: true, achievements: fallbackAchievementSnapshot(locale) });
      }
      return apiOk({ authenticated: true, degraded: false, achievements: result.value || [] });
    } catch (error) {
      recordDegradedRead(ROUTE, "read_failed", error);
      return apiOk({ authenticated: true, degraded: true, achievements: fallbackAchievementSnapshot(locale) });
    }
  });
}
