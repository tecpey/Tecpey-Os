// POST /api/auth/withdraw  — create a server-authoritative withdrawal request
// GET  /api/auth/withdraw  — list the current user's withdrawal history

import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { deviceFingerprint } from "@/lib/security/webauthn";
import { listUserWithdrawals } from "@/lib/security/withdrawal-service";
import { createAuthoritativeWithdrawal } from "@/lib/security/withdrawal-admission-service";

export const dynamic = "force-dynamic";

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
    if (
      Object.prototype.hasOwnProperty.call(body, "amountUsd") ||
      Object.prototype.hasOwnProperty.call(body, "twoFaVerified")
    ) {
      return apiError("client_security_facts_forbidden", 400);
    }

    const idempotencyKey = req.headers.get("idempotency-key")?.trim() ?? "";
    if (!idempotencyKey) return apiError("idempotency_key_required", 400);
    if (
      typeof body.idempotencyKey === "string" &&
      body.idempotencyKey.trim() !== idempotencyKey
    ) {
      return apiError("idempotency_key_mismatch", 400);
    }

    const authorizationId =
      typeof body.authorizationId === "string" ? body.authorizationId.trim() : "";
    if (!authorizationId) {
      return apiError("withdrawal_authorization_required", 403);
    }

    const ip = getClientIp(req);
    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500);
    const fingerprint = deviceFingerprint(userAgent, ip);

    const result = await createAuthoritativeWithdrawal({
      userId,
      asset: typeof body.asset === "string" ? body.asset : "",
      amount: typeof body.amount === "string" ? body.amount : "",
      destinationAddress:
        typeof body.destinationAddress === "string" ? body.destinationAddress : "",
      destinationTag:
        typeof body.destinationTag === "string" ? body.destinationTag : null,
      network: typeof body.network === "string" ? body.network : "",
      idempotencyKey,
      authorizationId,
      deviceFingerprint: fingerprint,
      ip,
      userAgent,
    });

    if (!result.ok) {
      return apiError(result.reason, result.code, {
        withdrawalId: result.withdrawalId ?? null,
      });
    }

    return apiOk(
      {
        withdrawal: result.withdrawal,
        replayed: result.replayed,
      },
      result.httpStatus,
    );
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
