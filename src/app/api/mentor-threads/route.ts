import { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import {
  ensureMentorThreadTx,
  isMentorThreadId,
  listMentorThreads,
  mentorThreadTitle,
  updateMentorThreadTx,
} from "@/lib/mentor-threads";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
  writeSensitiveMutationAuditTx,
} from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { requireTenantProduct } from "@/lib/security/tenant-product-entitlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore<T>(response: NextResponse<T>): NextResponse<T> {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

async function mentorActor(
  req: NextRequest,
  scope: "read" | "write",
  session: Awaited<ReturnType<typeof getCanonicalSession>>,
) {
  if (!session.studentId) {
    return { ok: false as const, response: noStore(apiError(session.authorityDegraded ? "mentor_threads_unavailable" : "academy_profile_required", session.authorityDegraded ? 503 : 401)) };
  }
  const context = await resolveTenantPrincipalContext({
    session,
    request: req,
    requiredPrincipalType: "student",
    scopes: [`academy:learning-events:${scope}`],
    requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
  });
  if (!context.available) {
    return { ok: false as const, response: noStore(apiError(
      context.reason === "binding_storage_unavailable" ? "mentor_threads_unavailable" : "forbidden",
      context.reason === "binding_storage_unavailable" ? 503 : 403,
    )) };
  }
  const productGate = await requireTenantProduct(context.tenantId, "mentor");
  if (productGate) return { ok: false as const, response: noStore(productGate) };
  return { ok: true as const, context };
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/mentor-threads GET" }, async () => {
    const limited = await rateLimit(req, {
      namespace: "mentor-threads-read",
      limit: 60,
      windowMs: 60_000,
    });
    if (!limited.ok) return noStore(apiError("rate_limited", 429));
    const session = await getCanonicalSession(req, { strictRevocation: true });
    const authorization = await mentorActor(req, "read", session);
    if (!authorization.ok) return authorization.response;
    const threads = await listMentorThreads({
      studentId: authorization.context.principalId,
      limit: 50,
    });
    if (threads === "unavailable") return noStore(apiError("mentor_threads_unavailable", 503));
    return noStore(apiOk({ threads }));
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/mentor-threads POST" }, async () => {
    if (!await verifyCsrfOrigin(req)) return noStore(apiError("forbidden", 403));
    const limited = await rateLimit(req, {
      namespace: "mentor-threads-create",
      limit: 12,
      windowMs: 60_000,
    });
    if (!limited.ok) return noStore(apiError("rate_limited", 429));
    const session = await getCanonicalSession(req, { strictRevocation: true });
    const authorization = await mentorActor(req, "write", session);
    if (!authorization.ok) return authorization.response;
    const bounded = await readBoundedJsonRequest(req, { maxBytes: 4_096 });
    if (!bounded.ok) return noStore(apiError(bounded.error, bounded.status));
    const body = bounded.value as Record<string, unknown>;
    const locale: "fa" | "en" = body.locale === "en" ? "en" : "fa";
    if (body.title !== undefined && typeof body.title !== "string") {
      return noStore(apiError("invalid_mentor_thread", 400));
    }
    const title = mentorThreadTitle(body.title, locale);
    const correlationId = resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id"));
    const requestHash = hashSensitiveAuditRequest({
      action: "mentor_thread.create",
      studentId: authorization.context.principalId,
      locale,
      titleHash: hashSensitiveAuditRequest(title),
    });
    try {
      const result = await withTx(async (client) => {
        const created = await ensureMentorThreadTx(client, {
          studentId: authorization.context.principalId,
          locale,
          titleHint: title,
        });
        if (!created) throw new Error("mentor_thread_create_failed");
        await writeSensitiveMutationAuditTx(client, {
          tenantId: authorization.context.tenantId,
          actorType: "student",
          actorId: authorization.context.principalId,
          action: "mentor_thread.create",
          resourceType: "mentor_thread",
          resourceId: created.thread.id,
          outcome: "success",
          correlationId,
          requestHash,
          metadata: { locale, titleHash: hashSensitiveAuditRequest(title) },
        });
        return created.thread;
      });
      if (!result.enabled) return noStore(apiError("mentor_threads_unavailable", 503));
      return noStore(apiOk({ thread: result.value }, 201));
    } catch {
      return noStore(apiError("mentor_thread_create_failed", 503));
    }
  });
}

export async function PATCH(req: NextRequest) {
  return withObservability(req, { route: "/api/mentor-threads PATCH" }, async () => {
    if (!await verifyCsrfOrigin(req)) return noStore(apiError("forbidden", 403));
    const limited = await rateLimit(req, {
      namespace: "mentor-threads-update",
      limit: 20,
      windowMs: 60_000,
    });
    if (!limited.ok) return noStore(apiError("rate_limited", 429));
    const session = await getCanonicalSession(req, { strictRevocation: true });
    const authorization = await mentorActor(req, "write", session);
    if (!authorization.ok) return authorization.response;
    const bounded = await readBoundedJsonRequest(req, { maxBytes: 4_096 });
    if (!bounded.ok) return noStore(apiError(bounded.error, bounded.status));
    const body = bounded.value as Record<string, unknown>;
    const threadId = body.threadId;
    if (!isMentorThreadId(threadId)) return noStore(apiError("invalid_mentor_thread", 400));
    const title = body.title === undefined ? undefined : typeof body.title === "string" ? body.title : null;
    const status = body.status === undefined
      ? undefined
      : body.status === "active" || body.status === "archived" ? body.status : null;
    if (title === null || status === null || (title === undefined && status === undefined)) {
      return noStore(apiError("invalid_mentor_thread", 400));
    }
    const locale: "fa" | "en" = body.locale === "en" ? "en" : "fa";
    const normalizedTitle = title === undefined ? undefined : mentorThreadTitle(title, locale);
    const action = status === "archived" ? "mentor_thread.archive" : "mentor_thread.update";
    const correlationId = resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id"));
    const requestHash = hashSensitiveAuditRequest({
      action,
      studentId: authorization.context.principalId,
      threadId,
      status: status ?? null,
      titleHash: normalizedTitle ? hashSensitiveAuditRequest(normalizedTitle) : null,
    });
    try {
      const result = await withTx(async (client) => {
        const updated = await updateMentorThreadTx(client, {
          studentId: authorization.context.principalId,
          threadId,
          title: normalizedTitle,
          status: status ?? undefined,
          locale,
        });
        if (!updated) return null;
        await writeSensitiveMutationAuditTx(client, {
          tenantId: authorization.context.tenantId,
          actorType: "student",
          actorId: authorization.context.principalId,
          action,
          resourceType: "mentor_thread",
          resourceId: updated.id,
          outcome: "success",
          correlationId,
          requestHash,
          metadata: {
            status: updated.status,
            titleHash: hashSensitiveAuditRequest(updated.title),
          },
        });
        return updated;
      });
      if (!result.enabled) return noStore(apiError("mentor_threads_unavailable", 503));
      if (!result.value) return noStore(apiError("mentor_thread_not_found", 404));
      return noStore(apiOk({ thread: result.value }));
    } catch {
      return noStore(apiError("mentor_thread_update_failed", 503));
    }
  });
}
