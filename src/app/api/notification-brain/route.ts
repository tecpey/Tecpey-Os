import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { buildNotificationBrain, createBrainNotification, fallbackNotificationBrain } from "@/lib/phase5-achievement-engine";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { recordDegradedRead } from "@/lib/degraded-read";

const ROUTE = "/api/notification-brain";

function noStore<T>(response: NextResponse<T>): NextResponse<T> {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: ROUTE }, async () => {
    const limit = await rateLimit(req, { namespace: "notification-brain-read", limit: 80, windowMs: 60_000 });
    if (!limit.ok) return noStore(apiError("rate_limited", 429));
    const session = await getCanonicalSession(req, { strictRevocation: true });
    const locale = cleanText(new URL(req.url).searchParams.get("locale") || "fa", 10) === "en" ? "en" : "fa";
    if (!session.studentId) return noStore(apiOk({ authenticated: false, degraded: false, brain: fallbackNotificationBrain(locale) }));
    const tenantContext = await resolveTenantPrincipalContext({
      session,
      requiredPrincipalType: "student",
      scopes: ["academy:notification-brain:read"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    if (!tenantContext.available) {
      recordDegradedRead(ROUTE, "tenant_context_unavailable");
      return noStore(apiOk({ authenticated: true, degraded: true, brain: fallbackNotificationBrain(locale) }));
    }
    try {
      const result = await withDb((client) => buildNotificationBrain(client, tenantContext.principalId, locale, tenantContext.tenantId));
      if (!result.enabled) {
        recordDegradedRead(ROUTE, "storage_unavailable");
        return noStore(apiOk({ authenticated: true, degraded: true, brain: fallbackNotificationBrain(locale) }));
      }
      return noStore(apiOk({ authenticated: true, degraded: false, brain: result.value }));
    } catch (error) {
      recordDegradedRead(ROUTE, "read_failed", error);
      return noStore(apiOk({ authenticated: true, degraded: true, brain: fallbackNotificationBrain(locale) }));
    }
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: ROUTE }, async () => {
    if (!verifyCsrfOrigin(req))
      return noStore(apiError("forbidden", 403));
    const limit = await rateLimit(req, { namespace: "notification-brain-generate", limit: 20, windowMs: 60_000 });
    if (!limit.ok) return noStore(apiError("rate_limited", 429));
    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return noStore(apiError("academy_profile_required", 401));
    const locale = cleanText(new URL(req.url).searchParams.get("locale") || "fa", 10) === "en" ? "en" : "fa";
    const tenantContext = await resolveTenantPrincipalContext({
      session,
      requiredPrincipalType: "student",
      scopes: ["academy:notification-brain:write"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    if (!tenantContext.available) return noStore(apiError("notification_brain_unavailable", 503));
    try {
      const result = await withDb((client) => createBrainNotification(client, tenantContext.principalId, locale, tenantContext.tenantId));
      if (!result.enabled) {
        recordDegradedRead(ROUTE, "storage_unavailable");
        return noStore(apiOk({ degraded: true, brain: fallbackNotificationBrain(locale) }));
      }
      return noStore(apiOk({ degraded: false, brain: result.value }));
    } catch {
      return noStore(apiError("server_error", 500));
    }
  });
}
