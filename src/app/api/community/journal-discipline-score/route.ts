import { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import { loadJournalDisciplineScore } from "@/lib/community-journal-discipline-score-authority";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";

export const dynamic = "force-dynamic";

function noStore<T>(response: NextResponse<T>): NextResponse<T> {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export async function GET(req: NextRequest) {
  return withObservability(
    req,
    { route: "/api/community/journal-discipline-score GET" },
    async () => {
      const url = new URL(req.url);
      if ([...url.searchParams.keys()].length > 0) {
        return noStore(apiError("invalid_journal_discipline_score_query", 400));
      }

      const session = await getCanonicalSession(req, { strictRevocation: true });
      if (!session.studentId) {
        return noStore(apiError("academy_profile_required", 401));
      }

      const limited = await rateLimit(req, {
        namespace: "community-journal-discipline-score-read",
        identity: session.studentId,
        limit: 60,
        windowMs: 60_000,
      });
      if (!limited.ok) return noStore(apiError("rate_limited", 429));

      const context = await resolveTenantPrincipalContext({
        session,
        requiredPrincipalType: "student",
        scopes: ["community:reputation:read"],
        requestId: resolveSensitiveAuditCorrelation(
          req.headers.get("x-tecpey-request-id"),
        ),
      });
      if (!context.available) {
        return noStore(apiError("journal_discipline_score_unavailable", 503));
      }

      const loaded = await loadJournalDisciplineScore(context);
      if (!loaded.available) {
        return noStore(apiError("journal_discipline_score_unavailable", 503));
      }
      return noStore(apiOk({ score: loaded.score }));
    },
  );
}
