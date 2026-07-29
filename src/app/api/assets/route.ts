import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { listAssets, getAsset } from "@/lib/trading/market-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/assets" }, async () => {
    const limit = await rateLimit(req, { namespace: "assets-read", limit: 240, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol");

    if (symbol) {
      const asset = await getAsset(symbol);
      if (!asset) return apiError("asset_not_found", 404);
      return apiOk({ asset });
    }

    const assets = await listAssets(true);
    return apiOk({ assets, count: assets.length });
  });
}
