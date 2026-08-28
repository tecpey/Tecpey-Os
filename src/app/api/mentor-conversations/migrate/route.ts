import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { inspectMentorUserText } from "@/lib/ai/mentor-trust-boundary";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
  writeSensitiveMutationAuditTx,
} from "@/lib/security/sensitive-mutation-audit";
import { cleanText } from "@/lib/student-cartax";
import { apiOk, apiError } from "@/lib/api-validation";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { ensureMentorThreadTx } from "@/lib/mentor-threads";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { requireTenantProduct } from "@/lib/security/tenant-product-entitlement";

export const dynamic = "force-dynamic";

type ValidatedMessage = { role: "user" | "assistant"; content: string; ts: Date };

export async function POST(req: NextRequest) {
  if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);

  const session = await getCanonicalSession(req, { strictRevocation: true });
  if (!session.studentId) return apiError("academy_profile_required", 401);

  const limit = await rateLimit(req, {
    namespace: "mentor-conversations-migrate",
    identity: session.studentId,
    limit: 3,
    windowMs: 60 * 60_000,
  });
  if (!limit.ok) return apiError("rate_limited", 429);

  const tenantContext = await resolveTenantPrincipalContext({
    session,
    request: req,
    requiredPrincipalType: "student",
    scopes: ["academy:learning-events:write"],
    requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
  });
  if (!tenantContext.available) {
    return apiError(
      tenantContext.reason === "binding_storage_unavailable"
        ? "mentor_migration_unavailable"
        : "forbidden",
      tenantContext.reason === "binding_storage_unavailable" ? 503 : 403,
    );
  }
  const productGate = await requireTenantProduct(tenantContext.tenantId, "mentor");
  if (productGate) return productGate;
  const studentId = tenantContext.principalId;

  let body: unknown;
  try {
    const boundedBodyRequest = await readBoundedJsonRequest(req, {
      maxBytes: 262_144,
    });
    if (!boundedBodyRequest.ok) {
      return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
    }
    req = boundedBodyRequest.request;
    body = await req.json();
  } catch {
    return apiError("invalid_body", 400);
  }

  const rawMessages = (body as { messages?: unknown[] })?.messages;
  const attemptedCount = Array.isArray(rawMessages) ? Math.min(rawMessages.length, 50) : 0;
  const validRoles = new Set(["user", "assistant"]);
  const now = Date.now();
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
  const messages: ValidatedMessage[] = [];

  for (const item of Array.isArray(rawMessages) ? rawMessages.slice(0, 50) : []) {
    const message = item as Record<string, unknown>;
    const role = String(message.role ?? "");
    if (!validRoles.has(role)) continue;
    const content = cleanText(message.content, 2000);
    if (!content) continue;
    const inspection = inspectMentorUserText(content);
    if (inspection.blocked || inspection.injectionSignals.length > 0) continue;
    const at = Number(message.at ?? 0);
    if (!at || at > now + 60_000 || at < oneYearAgo) continue;
    messages.push({
      role: role as ValidatedMessage["role"],
      content: inspection.normalized,
      ts: new Date(at),
    });
  }

  const correlationId = resolveSensitiveAuditCorrelation(
    req.headers.get("x-tecpey-request-id"),
  );
  const requestHash = hashSensitiveAuditRequest({
    studentId,
    messages: messages.map((message) => ({
      role: message.role,
      contentHash: hashSensitiveAuditRequest(message.content),
      at: message.ts.toISOString(),
    })),
  });

  try {
    const result = await withTx(async (client) => {
      const thread = messages.length > 0
        ? await ensureMentorThreadTx(client, {
            studentId,
            locale: "fa",
            titleHint: "گفت‌وگوی پیشین",
          })
        : null;
      if (messages.length > 0 && !thread) throw new Error("mentor_thread_create_failed");
      let imported = 0;
      for (const { role, content, ts } of messages) {
        const inserted = await client.query(
          `INSERT INTO mentor_conversations
             (student_id, thread_id, role, content, locale, created_at)
           VALUES ($1::uuid, $2::uuid, $3, $4, 'fa', $5)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [studentId, thread!.thread.id, role, content, ts],
        );
        imported += inserted.rowCount ?? 0;
      }

      const userCount = messages.filter((message) => message.role === "user").length;
      const assistantCount = messages.length - userCount;
      await writeSensitiveMutationAuditTx(client, {
        tenantId: tenantContext.tenantId,
        actorType: "student",
        actorId: studentId,
        action: "mentor_conversations.migrate",
        resourceType: "mentor_conversations",
        resourceId: studentId,
        outcome: messages.length === 0 ? "no_op" : "success",
        correlationId,
        requestHash,
        metadata: {
          attemptedCount,
          acceptedCount: messages.length,
          importedCount: imported,
          userCount,
          assistantCount,
          rejectedCount: Math.max(0, attemptedCount - messages.length),
        },
      });
      return { imported };
    });

    if (!result.enabled) return apiError("mentor_storage_unavailable", 503);
    return apiOk({ imported: result.value.imported });
  } catch {
    return apiError("mentor_migration_unavailable", 503);
  }
}
