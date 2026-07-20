import { readJsonBody } from "@/lib/security/request-body";
import { NextRequest } from "next/server";
import { authorizeAdminRequest } from "@/lib/admin-control-plane";
import { apiOk, apiError } from "@/lib/api-validation";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  hashApiCommand,
  parseApiIdempotencyKey,
} from "@/lib/security/api-command-idempotency";
import { fetchWithdrawal } from "@/lib/security/withdrawal-service";
import {
  adminActOnAuthoritativeWithdrawal,
  type AuthoritativeAdminWithdrawalAction,
} from "@/lib/security/withdrawal-admin-authority";
import {
  notifyWithdrawalApproved,
  notifyWithdrawalRejected,
  notifyWithdrawalBlocked,
} from "@/lib/security/security-notifications";

export const dynamic = "force-dynamic";

const VALID_ACTIONS = new Set<AuthoritativeAdminWithdrawalAction>([
  "approve",
  "reject",
  "block",
  "flag_review",
]);

const ACTION_PERMISSION: Record<AuthoritativeAdminWithdrawalAction, string> = {
  approve: "withdrawals.approve",
  reject: "withdrawals.reject",
  block: "withdrawals.hold",
  flag_review: "withdrawals.hold",
};

function validWithdrawalId(value: string): boolean {
  return /^[a-f0-9]{32}(?:-r[1-4])?$/i.test(value);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withObservability(req, { route: "/api/admin/withdrawals/[id] GET" }, async () => {
    const requestLimit = await rateLimit(req, {
      namespace: "admin-withdrawals-detail",
      limit: 60,
      windowMs: 60_000,
    });
    if (!requestLimit.ok) return apiError("rate_limited", 429);
    if (!validWithdrawalId(id)) return apiError("invalid_withdrawal_id", 400);

    const authorization = await authorizeAdminRequest(req, "withdrawals.read");
    if (!authorization.ok) return apiError(authorization.error, authorization.status);

    const withdrawal = await fetchWithdrawal(id);
    if (!withdrawal) return apiError("withdrawal_not_found", 404);

    return apiOk({ withdrawal }, 200, {
      "Cache-Control": "no-store, max-age=0",
    });
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withObservability(req, { route: "/api/admin/withdrawals/[id] POST" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const requestLimit = await rateLimit(req, {
      namespace: "admin-withdrawals-action",
      limit: 30,
      windowMs: 60_000,
    });
    if (!requestLimit.ok) return apiError("rate_limited", 429);
    if (!validWithdrawalId(id)) return apiError("invalid_withdrawal_id", 400);

    const bodyResult = await readJsonBody(req, {
      maxBytes: 8_192,
      allowEmptyObject: true,
    });
    if (!bodyResult.ok) return apiError(bodyResult.error, bodyResult.status);
    const body = bodyResult.value;
    const action = body.action as AuthoritativeAdminWithdrawalAction;
    if (!VALID_ACTIONS.has(action)) {
      return apiError("invalid_action", 400, {
        allowed: [...VALID_ACTIONS],
      });
    }

    const idempotencyKey = parseApiIdempotencyKey(
      req.headers.get("Idempotency-Key"),
      body.idempotencyKey,
    );
    if (!idempotencyKey) return apiError("idempotency_key_required", 400);

    const authorization = await authorizeAdminRequest(
      req,
      ACTION_PERMISSION[action],
      { stepUpWithinSeconds: 300 },
    );
    if (!authorization.ok) return apiError(authorization.error, authorization.status);

    const notes =
      typeof body.notes === "string"
        ? body.notes.trim().slice(0, 1000)
        : undefined;
    if (action !== "approve" && (!notes || notes.length < 3)) {
      return apiError("review_notes_required", 400);
    }

    const requestHash = hashApiCommand({
      withdrawalId: id,
      action,
      notes: notes ?? null,
    });
    const ip = getClientIp(req);
    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500);
    const result = await adminActOnAuthoritativeWithdrawal({
      withdrawalId: id,
      adminId: authorization.principal.adminId,
      action,
      notes,
      idempotencyKey,
      requestHash,
      metadata: {
        ip,
        userAgent,
        sessionId: authorization.principal.sessionId,
        roles: authorization.principal.roles,
      },
    });

    if (!result.ok) return apiError(result.reason, result.code);

    if (!result.replayed) {
      if (action === "approve") {
        notifyWithdrawalApproved(result.userId, {
          withdrawalId: id,
          asset: result.asset,
          amount: result.amount,
        });
      } else if (action === "reject") {
        notifyWithdrawalRejected(result.userId, {
          withdrawalId: id,
          asset: result.asset,
          amount: result.amount,
          reason: notes,
        });
      } else if (action === "block") {
        notifyWithdrawalBlocked(result.userId, {
          withdrawalId: id,
          asset: result.asset,
          amount: result.amount,
          reason: notes ?? "admin_blocked",
        });
      }
    }

    return apiOk(
      {
        actioned: true,
        replayed: result.replayed,
        action,
        withdrawalId: id,
        state: result.state,
      },
      200,
      { "Cache-Control": "no-store, max-age=0" },
    );
  });
}
