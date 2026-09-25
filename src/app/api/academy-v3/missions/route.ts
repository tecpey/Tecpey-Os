import { NextRequest, NextResponse } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiError, apiOk } from "@/lib/api-validation";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import {
  issueAcademyV3MissionAttemptTx,
  submitAcademyV3MissionDecisionTx,
} from "@/lib/academy-v3-mission-evidence-authority";
import { rateLimit } from "@/lib/rate-limit";
import { withObservability } from "@/lib/observe";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { requireTenantProduct } from "@/lib/security/tenant-product-entitlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/academy-v3/missions";
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,119}$/;
const MISSION_ID = /^[A-Z0-9][A-Z0-9._-]{2,119}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHOICE_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;

function noStore<T>(response: NextResponse<T>): NextResponse<T> {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

function exactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: ROUTE }, async () => {
    if (!await verifyCsrfOrigin(req)) return noStore(apiError("forbidden", 403));
    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return noStore(apiError("complete_account_required", 401));
    const limit = await rateLimit(req, { namespace: "academy-v3-mission-write", identity: session.studentId, limit: 30, windowMs: 60_000 });
    if (!limit.ok) return noStore(apiError("rate_limited", 429));
    const tenantContext = await resolveTenantPrincipalContext({
      session, request: req, requiredPrincipalType: "student", scopes: ["academy:missions:write"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    if (!tenantContext.available) return noStore(apiError("academy_v3_unavailable", 503));
    const productGate = await requireTenantProduct(tenantContext.tenantId, "academy");
    if (productGate) return noStore(productGate);
    if ([...new URL(req.url).searchParams.keys()].length) return noStore(apiError("unsupported_query_parameter", 400));

    const bounded = await readBoundedJsonRequest<Record<string, unknown>>(req, { maxBytes: 2_048 });
    if (!bounded.ok) return noStore(apiError(bounded.error, bounded.status));
    const body = bounded.value;
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.action !== "string") {
      return noStore(apiError("invalid_academy_v3_mission_command", 400));
    }
    const idempotencyKey = req.headers.get("Idempotency-Key")?.trim() ?? "";
    if (!IDEMPOTENCY_KEY.test(idempotencyKey)) return noStore(apiError("idempotency_key_required", 400));

    try {
      if (body.action === "issue") {
        if (!exactKeys(body, ["action","locale","missionId"]) || (body.locale !== "fa" && body.locale !== "en") ||
            typeof body.missionId !== "string" || !MISSION_ID.test(body.missionId)) {
          return noStore(apiError("invalid_academy_v3_mission_issue", 400));
        }
        const result = await withTx((client) => issueAcademyV3MissionAttemptTx(client, {
          tenantId: tenantContext.tenantId, workspaceId: tenantContext.workspaceId,
          studentId: tenantContext.principalId, missionId: body.missionId as string,
          locale: body.locale as "fa" | "en", idempotencyKey,
        }));
        if (!result.enabled) return noStore(apiError("academy_v3_service_not_configured", 503));
        return noStore(apiOk({ attempt: result.value }, result.value.replayed ? 200 : 201));
      }
      if (body.action === "decide") {
        if (!exactKeys(body, ["action","attemptId","choiceId"]) || typeof body.attemptId !== "string" ||
            !UUID.test(body.attemptId) || typeof body.choiceId !== "string" || !CHOICE_ID.test(body.choiceId)) {
          return noStore(apiError("invalid_academy_v3_mission_decision", 400));
        }
        const result = await withTx((client) => submitAcademyV3MissionDecisionTx(client, {
          tenantId: tenantContext.tenantId, workspaceId: tenantContext.workspaceId,
          studentId: tenantContext.principalId, attemptId: body.attemptId as string,
          choiceId: body.choiceId as string, idempotencyKey,
        }));
        if (!result.enabled) return noStore(apiError("academy_v3_service_not_configured", 503));
        return noStore(apiOk({ decision: result.value }, result.value.replayed ? 200 : 201));
      }
      return noStore(apiError("invalid_academy_v3_mission_command", 400));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "academy_v3_attempt_not_found") return noStore(apiError(code, 404));
      if (code.endsWith("_replay_mismatch")) return noStore(apiError(code, 409));
      if (code === "academy_v3_mission_unknown" || code === "academy_v3_choice_unknown" || code === "academy_v3_mission_attempt_stale") {
        return noStore(apiError(code, 409));
      }
      if (code.startsWith("academy_v3_")) return noStore(apiError(code, 400));
      return noStore(apiError("academy_v3_unavailable", 503));
    }
  });
}
