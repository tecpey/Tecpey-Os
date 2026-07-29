// GET    /api/auth/withdraw/[id]  — fetch owned withdrawal detail
// DELETE /api/auth/withdraw/[id]  — cancel and transactionally release a reservation

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import {
  hashApiCommand,
  parseApiIdempotencyKey,
} from "@/lib/security/api-command-idempotency";
import { cancelWithdrawalIdempotently } from "@/lib/security/withdrawal-cancel-authority";
import { readWithdrawal } from "@/lib/security/withdrawal-read-authority";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withObservability(req, { route: "/api/auth/withdraw/[id] GET" }, async () => {
    const rlimit = await rateLimit(req, {
      namespace: "withdraw-detail",
      limit: 30,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const read = await readWithdrawal(id, userId);
    if (!read.ok) return apiError(read.reason, 503);
    if (!read.withdrawal) return apiError("withdrawal_not_found", 404);

    return apiOk({ withdrawal: read.withdrawal });
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withObservability(req, { route: "/api/auth/withdraw/[id] DELETE" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, {
      namespace: "withdraw-cancel",
      limit: 10,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const idempotencyKey = parseApiIdempotencyKey(
      req.headers.get("Idempotency-Key"),
    );
    if (!idempotencyKey) return apiError("idempotency_key_required", 400);

    const result = await cancelWithdrawalIdempotently({
      withdrawalId: id,
      userId,
      idempotencyKey,
      requestHash: hashApiCommand({ withdrawalId: id }),
    });
    if (!result.ok) return apiError(result.reason, result.code);

    return apiOk({
      cancelled: true,
      replayed: result.replayed,
      withdrawal: result.withdrawal,
    });
  });
}
