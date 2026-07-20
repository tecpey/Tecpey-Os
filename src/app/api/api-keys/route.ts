import { readJsonBody } from "@/lib/security/request-body";
import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { createApiKey, listApiKeys } from "@/lib/security/api-keys";
import { writeAudit } from "@/lib/security/audit-log";
import type { ApiKeyPermission } from "@/lib/security/api-keys";

export const dynamic = "force-dynamic";

const VALID_PERMISSIONS: ApiKeyPermission[] = ["read", "trade", "withdraw"];

// GET /api/api-keys — list the current user's API keys
export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/api-keys" }, async () => {
    const rl = await rateLimit(req, { namespace: "api-keys-list", limit: 30, windowMs: 60_000 });
    if (!rl.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    const userId = session.academyAccountId ?? session.studentId ?? session.userId;
    if (!userId) return apiError("unauthorized", 401);

    const keys = await listApiKeys(userId);
    return apiOk({ keys });
  });
}

// POST /api/api-keys — create a new API key
export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/api-keys" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rl = await rateLimit(req, { namespace: "api-keys-create", limit: 10, windowMs: 60_000 });
    if (!rl.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    const userId = session.academyAccountId ?? session.studentId ?? session.userId;
    if (!userId) return apiError("unauthorized", 401);

    const bodyResult = await readJsonBody(req, {
      maxBytes: 8_192,
      allowEmptyObject: true,
    });
    if (!bodyResult.ok) return apiError(bodyResult.error, bodyResult.status);
    const body = bodyResult.value;

    const { name, permissions, ipWhitelist, expiresAt } = body as Record<string, unknown>;

    if (typeof name !== "string" || name.trim().length === 0) {
      return apiError("invalid_input", 400);
    }
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return apiError("invalid_input", 400);
    }
    const validPerms = (permissions as string[]).filter((p) =>
      VALID_PERMISSIONS.includes(p as ApiKeyPermission),
    ) as ApiKeyPermission[];
    if (validPerms.length !== permissions.length) {
      return apiError("invalid_permissions", 400);
    }

    let expiresAtDate: Date | null = null;
    if (typeof expiresAt === "string") {
      expiresAtDate = new Date(expiresAt);
      if (isNaN(expiresAtDate.getTime())) return apiError("invalid_expires_at", 400);
      if (expiresAtDate < new Date()) return apiError("expires_at_in_past", 400);
    }

    let whitelist: string[] | null = null;
    if (Array.isArray(ipWhitelist)) {
      whitelist = (ipWhitelist as unknown[]).filter((ip) => typeof ip === "string") as string[];
    }

    try {
      const { apiKey, plaintext } = await createApiKey({
        userId,
        name: name.trim(),
        permissions: validPerms,
        ipWhitelist: whitelist,
        expiresAt: expiresAtDate,
      });

      writeAudit({
        actorId: userId,
        action: "api_key_created",
        resourceType: "api_key",
        resourceId: apiKey.id,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
        userAgent: req.headers.get("user-agent") ?? undefined,
        metadata: { name: apiKey.name, permissions: validPerms },
      });

      // plaintext is returned once — client must store it
      return apiOk({ apiKey, plaintext }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      if (msg === "api_key_limit_reached") return apiError("api_key_limit_reached", 422);
      return apiError("server_error", 500);
    }
  });
}
