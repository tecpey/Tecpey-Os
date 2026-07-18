import { NextRequest } from "next/server";
import { authorizeAdminRequest } from "@/lib/admin-control-plane";
import { apiOk, apiError } from "@/lib/api-validation";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  fetchWithdrawal,
  adminActOnWithdrawal,
  AdminWithdrawalAction,
} from "@/lib/security/withdrawal-service";
import {
  notifyWithdrawalApproved,
  notifyWithdrawalRejected,
  notifyWithdrawalBlocked,
} from "@/lib/security/security-notifications";

export const dynamic = "force-dynamic";

const VALID_ACTIONS = new Set<AdminWithdrawalAction>([
  "approve",
  "reject",
  "block",
  "flag_review",
]);

const ACTION_PERMISSION: Record<AdminWithdrawalAction, string> = {
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

    const body = await req.json().catch(() => ({}));
    const action = body.action as AdminWithdrawalAction;
    if (!VALID_ACTIONS.has(action)) {
      return apiError("invalid_action", 400, {
        allowed: [...VALID_ACTIONS],
      });
    }

    const authorization = await authorizeAdminRequest(
      req,
      ACTION_PERMISSION[action],
      { stepUpWithinSeconds: 300 },
    );
    if (!authorization.ok) return apiError(authorization.error, authorization.status);

    const notes = typeof body.notes === "string"
      ? body.notes.trim().slice(0, 1000)
      : undefined;
    if (action !== "approve" && (!notes || notes.length < 3)) {
      return apiError("review_notes_required", 400);
    }

    const withdrawal = await fetchWithdrawal(id);
    if (!withdrawal) return apiError("withdrawal_not_found", 404);

    const ip = getClientIp(req);
    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500);
    const result = await adminActOnWithdrawal({
      withdrawalId: id,
      adminId: authorization.principal.adminId,
      action,
      notes,
      metadata: {
        ip,
        userAgent,
        sessionId: authorization.principal.sessionId,
        roles: authorization.principal.roles,
      },
    });

    if (!result.ok) return apiError(result.reason ?? "action_failed", 409);

    if (action === "approve") {
      notifyWithdrawalApproved(withdrawal.userId, {
        withdrawalId: id,
        asset: withdrawal.asset,
        amount: withdrawal.amount,
      });
    } else if (action === "reject") {
      notifyWithdrawalRejected(withdrawal.userId, {
        withdrawalId: id,
        asset: withdrawal.asset,
        amount: withdrawal.amount,
        reason: notes,
      });
    } else if (action === "block") {
      notifyWithdrawalBlocked(withdrawal.userId, {
        withdrawalId: id,
        asset: withdrawal.asset,
        amount: withdrawal.amount,
        reason: notes ?? "admin_blocked",
      });
    }

    return apiOk({ actioned: true, action, withdrawalId: id }, 200, {
      "Cache-Control": "no-store, max-age=0",
    });
  });
}
