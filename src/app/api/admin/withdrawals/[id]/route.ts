// GET  /api/admin/withdrawals/[id]  — fetch any withdrawal (admin view includes full compliance result)
// POST /api/admin/withdrawals/[id]  — approve | reject | block | flag_review

import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getCanonicalSession } from "@/lib/auth-session";
import { isAdminConfigured, adminNotConfiguredResponse } from "@/lib/admin-auth";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
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

const VALID_ACTIONS = new Set<AdminWithdrawalAction>(["approve", "reject", "block", "flag_review"]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withObservability(req, { route: "/api/admin/withdrawals/[id] GET" }, async () => {
    const rlimit = await rateLimit(req, { namespace: "admin-withdrawals-detail", limit: 60, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    if (!isAdminConfigured()) return adminNotConfiguredResponse();
    const session = await getCanonicalSession(req);
    if (!session.isAdmin) return apiError("unauthorized", 401);

    const withdrawal = await fetchWithdrawal(id);
    if (!withdrawal) return apiError("withdrawal_not_found", 404);

    return apiOk({ withdrawal });
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withObservability(req, { route: "/api/admin/withdrawals/[id] POST" }, async () => {
    const rlimit = await rateLimit(req, { namespace: "admin-withdrawals-action", limit: 30, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    if (!isAdminConfigured()) return adminNotConfiguredResponse();

    const session = await getCanonicalSession(req);
    const adminId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!session.isAdmin || !adminId) return apiError("unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    const action = body.action as AdminWithdrawalAction;
    const notes = typeof body.notes === "string" ? body.notes.slice(0, 1000) : undefined;

    if (!VALID_ACTIONS.has(action)) {
      return apiError("invalid_action", 400, {
        allowed: [...VALID_ACTIONS],
      });
    }

    // Fetch for notification data before acting
    const withdrawal = await fetchWithdrawal(id);
    if (!withdrawal) return apiError("withdrawal_not_found", 404);

    const result = await adminActOnWithdrawal({
      withdrawalId: id,
      adminId,
      action,
      notes,
      metadata: { ip: getClientIp(req) },
    });

    if (!result.ok) return apiError(result.reason ?? "action_failed", 400);

    // Notify user of admin decision
    if (action === "approve") {
      notifyWithdrawalApproved(withdrawal.userId, {
        withdrawalId: id, asset: withdrawal.asset, amount: withdrawal.amount,
      });
    } else if (action === "reject") {
      notifyWithdrawalRejected(withdrawal.userId, {
        withdrawalId: id, asset: withdrawal.asset, amount: withdrawal.amount, reason: notes,
      });
    } else if (action === "block") {
      notifyWithdrawalBlocked(withdrawal.userId, {
        withdrawalId: id, asset: withdrawal.asset, amount: withdrawal.amount, reason: "admin_blocked",
      });
    }

    return apiOk({ actioned: true, action, withdrawalId: id });
  });
}
