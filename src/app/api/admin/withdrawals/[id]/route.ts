import { NextRequest } from "next/server";
import { authorizeAdminRequest } from "@/lib/admin-control-plane";
import { apiOk, apiError } from "@/lib/api-validation";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import {
  hashApiCommand,
  parseApiIdempotencyKey,
} from "@/lib/security/api-command-idempotency";
import { readWithdrawal } from "@/lib/security/withdrawal-read-authority";
import {
  adminActOnAuthoritativeWithdrawal,
  type AuthoritativeAdminWithdrawalAction,
} from "@/lib/security/withdrawal-admin-authority";
import {
  fingerprintWithdrawalReviewReason,
  fingerprintWithdrawalRoleSet,
  fingerprintWithdrawalSession,
} from "@/lib/security/withdrawal-evidence";
import {
  notifyWithdrawalApproved,
  notifyWithdrawalRejected,
  notifyWithdrawalBlocked,
} from "@/lib/security/security-notifications";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

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

const ADMIN_STEP_UP_SECONDS = 300;

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

    const read = await readWithdrawal(id);
    if (!read.ok) return apiError(read.reason, 503);
    if (!read.withdrawal) return apiError("withdrawal_not_found", 404);

    return apiOk({ withdrawal: read.withdrawal }, 200, {
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

    const boundedBodyRequest = await readBoundedJsonRequest(req, {
      maxBytes: 4_096,
      allowEmptyObject: true,
    });
    if (!boundedBodyRequest.ok) {
      return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
    }
    req = boundedBodyRequest.request;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
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

    const permission = ACTION_PERMISSION[action];
    const authorization = await authorizeAdminRequest(
      req,
      permission,
      { stepUpWithinSeconds: ADMIN_STEP_UP_SECONDS },
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
    const result = await adminActOnAuthoritativeWithdrawal({
      withdrawalId: id,
      adminId: authorization.principal.adminId,
      action,
      notes,
      idempotencyKey,
      requestHash,
      authorizationEvidence: {
        permission,
        stepUpWithinSeconds: ADMIN_STEP_UP_SECONDS,
        roleSetFingerprint: fingerprintWithdrawalRoleSet(
          authorization.principal.roles,
        ),
        sessionEvidenceFingerprint: fingerprintWithdrawalSession(
          authorization.principal.sessionId,
        ),
        reviewReasonFingerprint: notes
          ? fingerprintWithdrawalReviewReason(notes)
          : null,
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
        withdrawalId: result.withdrawalId,
        state: result.state,
      },
      200,
      { "Cache-Control": "no-store, max-age=0" },
    );
  });
}
