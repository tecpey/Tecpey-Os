import { NextRequest } from "next/server";
import { apiError, apiOk, apiRateLimited, Validate } from "@/lib/api-validation";
import { authorizeAdminRequest } from "@/lib/admin-control-plane";
import {
  isAiAutomationWorkflowId,
  type AiAutomationDecision,
  type AiAutomationReviewKind,
} from "@/lib/ai/automation-catalog";
import {
  aiAutomationEvidenceHash,
  enqueueAiAutomationRun,
  loadAiAutomationSnapshot,
  recordAiAutomationReview,
  updateAiAutomationPolicy,
} from "@/lib/ai/automation-store";
import { isAiDataClass } from "@/lib/ai/control-plane-catalog";
import type { AdminAiMutationContext } from "@/lib/ai/control-plane-store";
import { normalizeMentorText } from "@/lib/ai/mentor-trust-boundary";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mutationContext(
  request: NextRequest,
  authorization: Awaited<ReturnType<typeof authorizeAdminRequest>> & { ok: true },
): AdminAiMutationContext {
  return {
    tenantId: authorization.principal.tenantId,
    workspaceId: authorization.principal.workspaceId,
    actorAdminId: authorization.principal.adminId,
    sessionId: authorization.principal.sessionId,
    effectiveRoles: authorization.principal.roles,
    requestId: request.headers.get("x-tecpey-request-id"),
    sourceIp: getClientIp(request),
    userAgent: (request.headers.get("user-agent") ?? "").slice(0, 500),
  };
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

export async function GET(request: NextRequest) {
  return withObservability(
    request,
    { route: "/api/command-center/ai-automation GET" },
    async () => {
      const limited = await rateLimit(request, {
        namespace: "command-center-ai-automation-read",
        limit: 60,
        windowMs: 60_000,
      });
      if (!limited.ok) return apiRateLimited(limited.retryAfterSeconds);
      const authorization = await authorizeAdminRequest(
        request,
        "ai.automation.review",
      );
      if (!authorization.ok) {
        return apiError(authorization.error, authorization.status);
      }
      const snapshot = await loadAiAutomationSnapshot({
        tenantId: authorization.principal.tenantId,
        workspaceId: authorization.principal.workspaceId,
      });
      if (!snapshot) return apiError("ai_automation_unavailable", 503);
      return apiOk(
        { snapshot },
        200,
        { "Cache-Control": "private, no-store", Vary: "Cookie" },
      );
    },
  );
}

export async function PUT(request: NextRequest) {
  return withObservability(
    request,
    { route: "/api/command-center/ai-automation PUT" },
    async () => {
      if (!(await verifyCsrfOrigin(request))) return apiError("forbidden", 403);
      const limited = await rateLimit(request, {
        namespace: "command-center-ai-automation-policy",
        limit: 15,
        windowMs: 60_000,
      });
      if (!limited.ok) return apiRateLimited(limited.retryAfterSeconds);
      const authorization = await authorizeAdminRequest(
        request,
        "ai.automation.manage",
        { stepUpWithinSeconds: 300 },
      );
      if (!authorization.ok) {
        return apiError(authorization.error, authorization.status);
      }
      const bounded = await readBoundedJsonRequest(request, { maxBytes: 8_192 });
      if (!bounded.ok) return apiError(bounded.error, bounded.status);
      const body = bounded.value as Record<string, unknown>;
      const intervalMinutes =
        body.intervalMinutes === null
          ? null
          : integer(body.intervalMinutes, 5, 10_080);
      const maxConcurrency = integer(body.maxConcurrency, 1, 20);
      const expectedRevision = integer(body.expectedRevision, 0, Number.MAX_SAFE_INTEGER);
      if (
        body.action !== "update_policy" ||
        !isAiAutomationWorkflowId(body.workflowId) ||
        typeof body.enabled !== "boolean" ||
        (body.intervalMinutes !== null && intervalMinutes === null) ||
        maxConcurrency === null ||
        expectedRevision === null
      ) {
        return apiError("invalid_ai_automation_policy", 400);
      }
      const result = await updateAiAutomationPolicy({
        context: mutationContext(request, authorization),
        workflowId: body.workflowId,
        enabled: body.enabled,
        intervalMinutes,
        maxConcurrency,
        expectedRevision,
      });
      if (!result.ok) {
        if (result.reason === "revision_conflict") {
          return apiError("ai_automation_policy_revision_conflict", 409);
        }
        if (result.reason === "agents_not_ready") {
          return apiError("ai_automation_agents_not_ready", 422, {
            missingAgents: result.missingAgents ?? [],
          });
        }
        if (result.reason === "human_reviewer_gap") {
          return apiError("ai_automation_human_reviewer_gap", 422, {
            missingGate: result.missingGate ?? null,
          });
        }
        return apiError("ai_automation_policy_unavailable", 503);
      }
      return apiOk(
        { policy: result.policy },
        200,
        { "Cache-Control": "private, no-store", Vary: "Cookie" },
      );
    },
  );
}

export async function POST(request: NextRequest) {
  return withObservability(
    request,
    { route: "/api/command-center/ai-automation POST" },
    async () => {
      if (!(await verifyCsrfOrigin(request))) return apiError("forbidden", 403);
      const limited = await rateLimit(request, {
        namespace: "command-center-ai-automation-mutation",
        limit: 30,
        windowMs: 60_000,
      });
      if (!limited.ok) return apiRateLimited(limited.retryAfterSeconds);
      const bounded = await readBoundedJsonRequest(request, { maxBytes: 16_384 });
      if (!bounded.ok) return apiError(bounded.error, bounded.status);
      const body = bounded.value as Record<string, unknown>;

      if (body.action === "enqueue_run") {
        const authorization = await authorizeAdminRequest(
          request,
          "ai.automation.manage",
          { stepUpWithinSeconds: 300 },
        );
        if (!authorization.ok) {
          return apiError(authorization.error, authorization.status);
        }
        const context = mutationContext(request, authorization);
        const resourceType = String(body.resourceType ?? "").trim();
        const resourceId =
          body.resourceId === null || body.resourceId === undefined || body.resourceId === ""
            ? null
            : String(body.resourceId).trim();
        const inputText = normalizeMentorText(body.inputText, 4_000);
        const idempotencyKey = String(body.idempotencyKey ?? "").trim();
        if (
          !isAiAutomationWorkflowId(body.workflowId) ||
          !isAiDataClass(body.dataClass) ||
          resourceType.length < 2 ||
          resourceType.length > 80 ||
          (resourceId !== null && (resourceId.length < 1 || resourceId.length > 200)) ||
          inputText.length < 8 ||
          idempotencyKey.length < 8 ||
          idempotencyKey.length > 200
        ) {
          return apiError("invalid_ai_automation_run", 400);
        }
        const result = await enqueueAiAutomationRun({
          tenantId: context.tenantId,
          workspaceId: context.workspaceId,
          workflowId: body.workflowId,
          triggerType: "manual",
          dataClass: body.dataClass,
          resourceType,
          resourceId,
          inputText,
          idempotencyKey,
          requestedBy: context.actorAdminId,
          context,
        });
        if (!result.ok) {
          const status = result.reason === "policy_disabled" ? 409 :
            result.reason === "unavailable" ? 503 : 422;
          return apiError(`ai_automation_${result.reason}`, status);
        }
        return apiOk(
          { run: result.run, deduplicated: result.deduplicated },
          result.deduplicated ? 200 : 201,
          { "Cache-Control": "private, no-store", Vary: "Cookie" },
        );
      }

      if (body.action === "record_review") {
        const authorization = await authorizeAdminRequest(
          request,
          "ai.automation.review",
          { stepUpWithinSeconds: 300 },
        );
        if (!authorization.ok) {
          return apiError(authorization.error, authorization.status);
        }
        const context = mutationContext(request, authorization);
        const runId = Validate.uuid(body.runId);
        const reviewKind: AiAutomationReviewKind | null =
          body.reviewKind === "manager" || body.reviewKind === "c_level"
            ? body.reviewKind
            : null;
        const decision: AiAutomationDecision | null =
          body.decision === "approve" ||
          body.decision === "reject" ||
          body.decision === "abstain"
            ? body.decision
            : null;
        const summary = normalizeMentorText(body.summary, 2_000);
        if (!runId || !reviewKind || !decision || summary.length < 8) {
          return apiError("invalid_ai_automation_review", 400);
        }
        const evidenceHash = aiAutomationEvidenceHash(
          JSON.stringify({
            runId,
            reviewerAdminId: context.actorAdminId,
            reviewKind,
            decision,
            summary,
          }),
        );
        const result = await recordAiAutomationReview({
          tenantId: context.tenantId,
          workspaceId: context.workspaceId,
          runId,
          reviewKind,
          decision,
          summary,
          evidenceHash,
          reviewerAdminId: context.actorAdminId,
          reviewerRoles: context.effectiveRoles,
          context,
        });
        if (!result.ok) {
          const status = result.reason === "not_found" ? 404 :
            result.reason === "unavailable" ? 503 :
              result.reason === "reviewer_forbidden" ? 403 : 409;
          return apiError(`ai_automation_review_${result.reason}`, status);
        }
        return apiOk(
          { run: result.run },
          200,
          { "Cache-Control": "private, no-store", Vary: "Cookie" },
        );
      }

      return apiError("invalid_ai_automation_action", 400);
    },
  );
}
