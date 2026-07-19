// POST /api/auth/withdraw  — create a withdrawal request
// GET  /api/auth/withdraw  — list the current user's withdrawal history

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { listUserWithdrawals } from "@/lib/security/withdrawal-service";

export const dynamic = "force-dynamic";

// Withdrawal admission remains code-disabled until server-owned pricing,
// destination validation, one-time 2FA authorization, durable idempotency,
// balance reservation and fail-closed compliance evidence are all committed.
// Browser-supplied amountUsd/twoFaVerified values are never security authority.
const WITHDRAWAL_ADMISSION_READY = false as const;

// Supported assets/networks are retained for truthful early input feedback only.
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

    const rlimit = await rateLimit(req, {
      namespace: "withdraw-create",
      limit: 5,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const body = await req.json().catch(() => ({}));
    const asset = typeof body.asset === "string" ? body.asset.toUpperCase().trim() : "";
    const amount = typeof body.amount === "string" ? body.amount.trim() : "";
    const destinationAddress =
      typeof body.destinationAddress === "string"
        ? body.destinationAddress.trim()
        : "";
    const network =
      typeof body.network === "string" ? body.network.toLowerCase().trim() : "";

    if (!SUPPORTED_ASSETS.has(asset)) return apiError("unsupported_asset", 400);
    if (!SUPPORTED_NETWORKS.has(network)) return apiError("unsupported_network", 400);
    if (!amount || !/^\d+(\.\d+)?$/.test(amount)) {
      return apiError("invalid_amount", 400);
    }
    if (
      !destinationAddress ||
      destinationAddress.length < 10 ||
      destinationAddress.length > 200
    ) {
      return apiError("invalid_destination_address", 400);
    }

    if (!WITHDRAWAL_ADMISSION_READY) {
      return apiError("withdrawal_admission_unavailable", 503, {
        reason: "server_authority_not_ready",
        required: [
          "authoritative_pricing",
          "destination_validation",
          "one_time_2fa_authorization",
          "durable_idempotency",
          "transactional_balance_reservation",
          "fail_closed_compliance",
        ],
      });
    }

    return apiError("withdrawal_admission_unavailable", 503);
  });
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/withdraw GET" }, async () => {
    const rlimit = await rateLimit(req, {
      namespace: "withdraw-list",
      limit: 30,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const url = new URL(req.url);
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? "20", 10) || 20,
      100,
    );
    const offset = Math.max(
      parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
      0,
    );

    const withdrawals = await listUserWithdrawals(userId, limit, offset);
    return apiOk({ withdrawals, limit, offset });
  });
}
