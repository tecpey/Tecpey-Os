import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { setApiKeyActive, deleteApiKey, rotateApiKey } from "@/lib/security/api-keys";
import { writeAudit } from "@/lib/security/audit-log";

export const dynamic = "force-dynamic";

// PATCH /api/api-keys/[id] — update API key (enable/disable/rotate)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withObservability(req, { route: "/api/api-keys/[id]" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rl = await rateLimit(req, { namespace: "api-keys-update", limit: 20, windowMs: 60_000 });
    if (!rl.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    const userId = session.academyAccountId ?? session.studentId ?? session.userId;
    if (!userId) return apiError("unauthorized", 401);

    const { id: keyId } = await params;

    let body: unknown;
    try { body = await req.json(); } catch { return apiError("invalid_input", 400); }

    const { action } = body as Record<string, unknown>;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
    const ua = req.headers.get("user-agent") ?? undefined;

    if (action === "disable") {
      const ok = await setApiKeyActive(keyId, userId, false);
      if (!ok) return apiError("not_found", 404);
      writeAudit({ actorId: userId, action: "api_key_disabled", resourceType: "api_key", resourceId: keyId, ip, userAgent: ua });
      return apiOk({ updated: true });

    } else if (action === "enable") {
      const ok = await setApiKeyActive(keyId, userId, true);
      if (!ok) return apiError("not_found", 404);
      return apiOk({ updated: true });

    } else if (action === "rotate") {
      const result = await rotateApiKey(keyId, userId);
      if (!result) return apiError("not_found", 404);
      writeAudit({ actorId: userId, action: "api_key_rotated", resourceType: "api_key", resourceId: keyId, ip, userAgent: ua });
      // Return new plaintext — client must store it
      return apiOk({ plaintext: result.plaintext });

    } else {
      return apiError("invalid_action", 400);
    }
  });
}

// DELETE /api/api-keys/[id] — delete an API key permanently
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withObservability(req, { route: "/api/api-keys/[id]" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rl = await rateLimit(req, { namespace: "api-keys-delete", limit: 20, windowMs: 60_000 });
    if (!rl.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    const userId = session.academyAccountId ?? session.studentId ?? session.userId;
    if (!userId) return apiError("unauthorized", 401);

    const { id: keyId } = await params;
    const deleted = await deleteApiKey(keyId, userId);
    if (!deleted) return apiError("not_found", 404);

    writeAudit({
      actorId: userId,
      action: "api_key_deleted",
      resourceType: "api_key",
      resourceId: keyId,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return apiOk({ deleted: true });
  });
}
