import { NextRequest, NextResponse } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiError, apiOk } from "@/lib/api-validation";
import { withDb } from "@/lib/db";
import {
  readAcademyMasterySeasonState,
} from "@/lib/academy-mastery-seasons-authority";
import { rateLimit } from "@/lib/rate-limit";
import { withObservability } from "@/lib/observe";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore<T>(response: NextResponse<T>): NextResponse<T> {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export async function GET(req: NextRequest) {
  return withObservability(
    req,
    { route: "/api/academy-mastery-seasons" },
    async () => {
      const limit = await rateLimit(req, {
        namespace: "academy-mastery-seasons-read",
        limit: 120,
        windowMs: 60_000,
      });
      if (!limit.ok) return apiError("rate_limited", 429);

      const session = await getCanonicalSession(req, { strictRevocation: true });
      if (!session.studentId) return apiError("complete_account_required", 401);
      const tenantContext = await resolveTenantPrincipalContext({
        session,
        requiredPrincipalType: "student",
        scopes: ["academy:mastery-seasons:read"],
        requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
      });
      if (!tenantContext.available) return apiError("mastery_seasons_unavailable", 503);

      const searchParams = new URL(req.url).searchParams;
      if ([...searchParams.keys()].length > 0) {
        return apiError("unsupported_query_parameter", 400);
      }
      // Both locales read through the same pooled client, so they are
      // serialized by pg either way; awaiting in order avoids the pg@9
      // concurrent-query deprecation.
      const result = await withDb(async (client) => {
        const fa = await readAcademyMasterySeasonState(client, tenantContext, tenantContext.principalId, "fa");
        const en = await readAcademyMasterySeasonState(client, tenantContext, tenantContext.principalId, "en");
        return { fa, en };
      });
      if (!result.enabled) return apiError("mastery_seasons_service_not_configured", 503);
      return noStore(apiOk({ states: { fa: result.value.fa, en: result.value.en } }));
    },
  );
}
