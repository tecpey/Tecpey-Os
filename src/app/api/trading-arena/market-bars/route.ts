import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-response";
import {
  ArenaMarketBarsError,
  getArenaMarketBars,
  parseArenaBarAsset,
  parseArenaBarResolution,
} from "@/lib/arena-market-bars";
import { rateLimit } from "@/lib/rate-limit";
import { withObservability } from "@/lib/observability";

function boundedPositiveInteger(value: string | null, max: number): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : undefined;
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/trading-arena/market-bars" }, async () => {
    const limit = await rateLimit(req, { namespace: "arena-market-bars-read", limit: 120, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const asset = parseArenaBarAsset(req.nextUrl.searchParams.get("asset"));
    const resolution = parseArenaBarResolution(req.nextUrl.searchParams.get("resolution"));
    if (!asset || !resolution) return apiError("invalid_market_bars_request", 400);

    const from = boundedPositiveInteger(req.nextUrl.searchParams.get("from"), 4_102_444_800);
    const to = boundedPositiveInteger(req.nextUrl.searchParams.get("to"), 4_102_444_800);
    const countBack = boundedPositiveInteger(req.nextUrl.searchParams.get("countBack"), 1_000) ?? 300;
    if (from && to && from >= to) return apiError("invalid_market_bars_range", 400);

    try {
      const snapshot = await getArenaMarketBars({ asset, resolution, from, to, countBack });
      const response = apiOk(snapshot);
      response.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=10");
      return response;
    } catch (error) {
      const code = error instanceof ArenaMarketBarsError ? error.message : "arena_market_bars_unavailable";
      return apiError(code, 503);
    }
  });
}
