import { NextRequest, NextResponse } from "next/server";

import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { resolveNewsThumbnailRedirectTarget } from "@/services/news/thumbnail-authority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEDIA_CACHE_CONTROL = "public, max-age=900, s-maxage=21600, stale-while-revalidate=86400";
const MISS_CACHE_CONTROL = "public, max-age=300, s-maxage=1800";

function empty(status: number, cacheControl: string): NextResponse {
  const response = new NextResponse(null, { status });
  response.headers.set("Cache-Control", cacheControl);
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export async function GET(request: NextRequest) {
  return withObservability(request, { route: "/crypto-news/media" }, async () => {
    const limited = await rateLimit(request, {
      namespace: "crypto-news-media",
      limit: 240,
      windowMs: 60_000,
    });
    if (!limited.ok) return empty(429, "private, no-store");

    const article = request.nextUrl.searchParams.get("article")?.trim() ?? "";
    if (!article || article.length > 2_048) return empty(400, "private, no-store");

    const target = await resolveNewsThumbnailRedirectTarget(article);
    if (!target) return empty(404, MISS_CACHE_CONTROL);

    const response = NextResponse.redirect(target, 307);
    response.headers.set("Cache-Control", MEDIA_CACHE_CONTROL);
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  });
}
