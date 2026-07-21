import { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import { loadLatestFinalizedOfficialJournalChallenge } from "@/lib/community-journal-challenge-finalization";
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
    { route: "/api/community/challenge-history GET" },
    async () => {
      const searchParams = new URL(req.url).searchParams;
      if ([...searchParams.keys()].length > 0) {
        return noStore(apiError("invalid_community_challenge_history_query", 400));
      }

      const session = await getCanonicalSession(req, { strictRevocation: true });
      if (!session.studentId) {
        return noStore(apiError("academy_profile_required", 401));
      }
      const limited = await rateLimit(req, {
        namespace: "community-journal-challenge-history-read",
        identity: session.studentId,
        limit: 60,
        windowMs: 60_000,
      });
      if (!limited.ok) return noStore(apiError("rate_limited", 429));

      const context = await resolveTenantPrincipalContext({
        session,
        requiredPrincipalType: "student",
        scopes: ["community:challenge:read"],
        requestId: resolveSensitiveAuditCorrelation(
          req.headers.get("x-tecpey-request-id"),
        ),
      });
      if (!context.available) {
        return noStore(apiError("community_challenge_history_unavailable", 503));
      }
      const loaded = await loadLatestFinalizedOfficialJournalChallenge(context);
      if (!loaded.available) {
        return noStore(apiError("community_challenge_history_unavailable", 503));
      }
      return noStore(apiOk({ latestFinalized: loaded.result }));
    },
  );
}
