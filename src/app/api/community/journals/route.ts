import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import {
  listCommunityJournalFeed,
  parseCommunityJournalCursor,
} from "@/lib/community-journal-authority";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/community/journals GET";
const NO_STORE = { "Cache-Control": "private, no-store" };

function parseLimit(value: string | null): number | null {
  if (!value) return 20;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : null;
}

export async function GET(request: NextRequest) {
  return withObservability(request, { route: ROUTE }, async () => {
    const session = await getCanonicalSession(request, { strictRevocation: true });
    if (!session.studentId) {
      return apiError("academy_profile_required", 401, undefined, NO_STORE);
    }

    const limited = await rateLimit(request, {
      namespace: "community-journal-feed",
      identity: session.studentId,
      limit: 60,
      windowMs: 60_000,
    });
    if (!limited.ok) return apiError("rate_limited", 429, undefined, NO_STORE);

    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    if (!limit) return apiError("invalid_limit", 400, undefined, NO_STORE);

    const parsedCursor = parseCommunityJournalCursor(
      request.nextUrl.searchParams.get("cursor"),
    );
    if (!parsedCursor.ok) {
      return apiError("invalid_community_journal_cursor", 400, undefined, NO_STORE);
    }

    const context = await resolveTenantPrincipalContext({
      session,
      requiredPrincipalType: "student",
      scopes: ["community:journal:read"],
      requestId: resolveSensitiveAuditCorrelation(
        request.headers.get("x-tecpey-request-id"),
      ),
    });
    if (!context.available) {
      return apiError("community_journal_unavailable", 503, undefined, NO_STORE);
    }

    const feed = await listCommunityJournalFeed({
      context,
      cursor: parsedCursor.cursor,
      limit,
    });
    if (!feed.available) {
      return apiError("community_journal_unavailable", 503, undefined, NO_STORE);
    }

    return apiOk(feed.page, 200, NO_STORE);
  });
}
