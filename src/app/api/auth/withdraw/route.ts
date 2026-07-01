// POST /api/auth/withdraw  — create a withdrawal request
// GET  /api/auth/withdraw  — list the current user's withdrawal history

import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { deviceFingerprint } from "@/lib/security/webauthn";
import {
  createWithdrawalRequest,
  listUserWithdrawals,
} from "@/lib/security/withdrawal-service";

export const dynamic = "force-dynamic";

// Supported assets (extend as needed; kept minimal for Phase 37)
const SUPPORTED_ASSETS = new Set([
  "BTC", "ETH", "USDT", "USDC", "BNB", "XRP", "SOL",
  "ADA", "DOGE", "TRX", "LTC", "DOT", "LINK", "AVAX", "MATIC",
]);

const SUPPORTED_NETWORKS = new Set([
  "bitcoin", "ethereum", "tron", "bsc", "solana",
  "ripple", "cardano", "polygon", "avalanche", "litecoin",
]);

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/withdraw POST" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, { namespace: "withdraw-create", limit: 5, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const body = await req.json().catch(() => ({}));
    const asset = typeof body.asset === "string" ? body.asset.toUpperCase().trim() : "";
    const amount = typeof body.amount === "string" ? body.amount.trim() : "";
    const destinationAddress = typeof body.destinationAddress === "string" ? body.destinationAddress.trim() : "";
    const network = typeof body.network === "string" ? body.network.toLowerCase().trim() : "";
    const amountUsd = typeof body.amountUsd === "number" ? body.amountUsd : NaN;
    const twoFaVerified = body.twoFaVerified === true;

    // Input validation
    if (!SUPPORTED_ASSETS.has(asset)) return apiError("unsupported_asset", 400);
    if (!SUPPORTED_NETWORKS.has(network)) return apiError("unsupported_network", 400);
    if (!amount || !/^\d+(\.\d+)?$/.test(amount) || parseFloat(amount) <= 0) {
      return apiError("invalid_amount", 400);
    }
    if (!destinationAddress || destinationAddress.length < 10 || destinationAddress.length > 200) {
      return apiError("invalid_destination_address", 400);
    }
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      return apiError("invalid_amount_usd", 400);
    }

    const ip = getClientIp(req);
    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500);
    const fp = deviceFingerprint(userAgent, ip);

    const result = await createWithdrawalRequest({
      userId,
      asset,
      amount,
      amountUsd,
      destinationAddress,
      network,
      deviceFingerprint: fp,
      ip,
      userAgent,
      twoFaVerified,
    });

    if (!result.ok) {
      return apiError(result.reason, result.code);
    }

    return apiOk({ withdrawal: result.withdrawal }, 201);
  });
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/withdraw GET" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, { namespace: "withdraw-list", limit: 30, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 100);
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

    const withdrawals = await listUserWithdrawals(userId, limit, offset);
    return apiOk({ withdrawals, limit, offset });
  });
}
