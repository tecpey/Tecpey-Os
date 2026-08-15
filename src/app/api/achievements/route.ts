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
import {
  listOwnedAcademyCredentialHistory,
  listOwnedAcademyCredentials,
} from "@/lib/academy-credential-authority";

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
        return apiOk({ authenticated: true, degraded: true, achievements: fallbackAchievementSnapshot(locale), credentials: [] });
      }
      return apiOk({ authenticated: false, achievements: fallbackAchievementSnapshot(locale), credentials: [] });
    }
    const tenantContext = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "student",
      scopes: ["academy:learning-events:read"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    // The student has a session but no available tenant context. Only an outage
    // makes an empty answer a lie: a binding that could not be read reports
    // degraded, while an ordinary authorization outcome — no binding, a revoked
    // one, a workspace mismatch, or a foreign branded host — is not an outage,
    // so it reports an honest empty rather than a false service alert.
    if (!tenantContext.available) {
      if (tenantContext.reason === "binding_storage_unavailable") {
        recordDegradedRead(ROUTE, "tenant_context_unavailable");
        return apiOk({ authenticated: true, degraded: true, achievements: fallbackAchievementSnapshot(locale), credentials: [] });
      }
      return apiOk({ authenticated: false, achievements: fallbackAchievementSnapshot(locale), credentials: [] });
    }
    const productGate = await requireTenantProduct(tenantContext.tenantId, "academy");
    if (productGate) return productGate;
    try {
      const result = await withDb(async (client) => ({
        achievements: await getAchievementSnapshot(client, tenantContext.principalId),
        credentials: await listOwnedAcademyCredentials(client, {
          tenantId: tenantContext.tenantId,
          workspaceId: tenantContext.workspaceId,
          studentId: tenantContext.principalId,
        }),
        credentialHistory: await listOwnedAcademyCredentialHistory(client, {
          tenantId: tenantContext.tenantId,
          workspaceId: tenantContext.workspaceId,
          studentId: tenantContext.principalId,
        }),
      }));
      if (!result.enabled) {
        recordDegradedRead(ROUTE, "storage_unavailable");
        return apiOk({ authenticated: true, degraded: true, achievements: fallbackAchievementSnapshot(locale), credentials: [] });
      }
      return apiOk({
        authenticated: true,
        degraded: false,
        achievements: result.value.achievements,
        credentials: result.value.credentials,
        credentialHistory: result.value.credentialHistory,
      });
    } catch (error) {
      recordDegradedRead(ROUTE, "read_failed", error);
      return apiOk({ authenticated: true, degraded: true, achievements: fallbackAchievementSnapshot(locale), credentials: [] });
    }
  });
}
