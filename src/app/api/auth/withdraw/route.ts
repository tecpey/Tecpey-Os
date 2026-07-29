// POST /api/auth/withdraw  — create a server-authoritative withdrawal request
// GET  /api/auth/withdraw  — list the current user's withdrawal history

import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { deviceFingerprint } from "@/lib/security/webauthn";
import {
  canonicalizeWithdrawalCommand,
  inspectWithdrawalAuthorization,
} from "@/lib/security/withdrawal-admission-authority";
import { createAuthoritativeWithdrawal } from "@/lib/security/withdrawal-admission-service";
import { listUserWithdrawalsStrict } from "@/lib/security/withdrawal-read-authority";
import { ensureWithdrawalPriceSnapshot } from "@/lib/security/withdrawal-price-producer";
import { resolveWithdrawalReplay } from "@/lib/security/withdrawal-replay-authority";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/withdraw POST" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const rlimit = await rateLimit(req, {
      namespace: "withdraw-create",
      identity: userId,
      limit: 5,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const boundedBodyRequest = await readBoundedJsonRequest(req, {
      maxBytes: 16_384,
      allowEmptyObject: true,
    });
    if (!boundedBodyRequest.ok) {
      return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
    }
    req = boundedBodyRequest.request;
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

    const canonical = canonicalizeWithdrawalCommand({
      userId,
      asset: typeof body.asset === "string" ? body.asset : "",
      amount: typeof body.amount === "string" ? body.amount : "",
      destinationAddress:
        typeof body.destinationAddress === "string" ? body.destinationAddress : "",
      destinationTag:
        typeof body.destinationTag === "string" ? body.destinationTag : null,
      network: typeof body.network === "string" ? body.network : "",
      idempotencyKey,
    });
    if (!canonical.ok) return apiError(canonical.reason, 400);

    const replay = await resolveWithdrawalReplay({
      userId,
      idempotencyKey,
      requestHash: canonical.requestHash,
    });
    if (replay.status === "unavailable") {
      return apiError("withdrawal_storage_unavailable", 503);
    }
    if (replay.status === "conflict") {
      return apiError("idempotency_conflict", 409);
    }
    if (replay.status === "replay") {
      if (replay.withdrawal.state === "blocked") {
        return apiError("withdrawal_blocked", 403, {
          withdrawalId: replay.withdrawal.id,
          replayed: true,
        });
      }
      return apiOk({ withdrawal: replay.withdrawal, replayed: true });
    }

    const authorizationId =
      typeof body.authorizationId === "string" ? body.authorizationId.trim() : "";
    if (!authorizationId) {
      return apiError("withdrawal_authorization_required", 403);
    }

    const authorization = await inspectWithdrawalAuthorization({
      authorizationId,
      userId,
      requestHash: canonical.requestHash,
    });
    if (authorization === "unavailable") {
      return apiError("authorization_store_unavailable", 503);
    }
    if (authorization === "invalid") {
      return apiError("withdrawal_authorization_invalid", 403);
    }

    // Normal admission owns its own price production. A fresh signed snapshot is
    // reused; otherwise at least two direct-USD providers must reach consensus.
    const priceReady = await ensureWithdrawalPriceSnapshot(canonical.command.asset);
    if (!priceReady) return apiError("price_consensus_unavailable", 503);

    const ip = getClientIp(req);
    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500);
    const fingerprint = deviceFingerprint(userAgent, ip);

    const result = await createAuthoritativeWithdrawal({
      ...canonical.command,
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

    if (result.withdrawal.state === "blocked") {
      return apiError("withdrawal_blocked", 403, {
        withdrawalId: result.withdrawal.id,
        replayed: result.replayed,
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
    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const rlimit = await rateLimit(req, {
      namespace: "withdraw-list",
      identity: userId,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const url = new URL(req.url);
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? "20", 10) || 20,
      100,
    );
    const offset = Math.max(
      parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
      0,
    );

    const result = await listUserWithdrawalsStrict(userId, limit, offset);
    if (!result.ok) return apiError(result.reason, 503);
    return apiOk({ withdrawals: result.withdrawals, limit, offset });
  });
}
