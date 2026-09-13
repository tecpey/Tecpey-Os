import { NextRequest, NextResponse } from "next/server";

import { apiError } from "@/lib/api-validation";
import { resolveNewsThumbnailRedirectTarget } from "@/lib/news-thumbnail-authority";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_CONTROL = "public, max-age=900, s-maxage=21600, stale-while-revalidate=86400";

export async function GET(request: NextRequest) {
  return withObservability(request, { route: "/api/crypto-news/thumbnail" }, async () => {
    const limited = await rateLimit(request, {
      namespace: "crypto-news-thumbnail",
      limit: 600,
      windowMs: 60_000,
    });
    if (!limited.ok) return apiError("rate_limited", 429);

    const article = request.nextUrl.searchParams.get("article")?.trim() ?? "";
    if (!article || article.length > 2_048) return apiError("news_thumbnail_article_invalid", 400);

    const target = await resolveNewsThumbnailRedirectTarget(article);
    if (!target) {
      const response = new NextResponse(null, { status: 404 });
      response.headers.set("Cache-Control", "public, max-age=300, s-maxage=1800");
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
      return response;
    }

    const response = NextResponse.redirect(target, 307);
    response.headers.set("Cache-Control", CACHE_CONTROL);
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  });
}
