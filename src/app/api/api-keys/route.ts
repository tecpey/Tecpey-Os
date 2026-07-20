import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { PLATFORM } from "@/lib/platform-config";
import { createApiKey, listApiKeys } from "@/lib/security/api-keys";
import type { ApiKeyPermission } from "@/lib/security/api-keys";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
} from "@/lib/security/sensitive-mutation-audit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

const VALID_PERMISSIONS: ApiKeyPermission[] = ["read", "trade", "withdraw"];

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/api-keys" }, async () => {
    const limit = await rateLimit(req, {
      namespace: "api-keys-list",
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.studentId ?? session.userId;
    if (!userId) return apiError("unauthorized", 401);

    const keys = await listApiKeys(userId);
    return apiOk({ keys });
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/api-keys" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "api-keys-create",
      limit: 10,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.studentId ?? session.userId;
    if (!userId) return apiError("unauthorized", 401);
    const actorType = session.userId ? "user" as const : "student" as const;

    const boundedBodyRequest = await readBoundedJsonRequest(req, {
      maxBytes: 8_192,
    });
    if (!boundedBodyRequest.ok) {
      return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
    }
    req = boundedBodyRequest.request;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("invalid_input", 400);
    }

    const { name, permissions, ipWhitelist, expiresAt } = body as Record<string, unknown>;
    if (typeof name !== "string" || name.trim().length === 0) {
      return apiError("invalid_input", 400);
    }
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return apiError("invalid_input", 400);
    }

    const validPermissions = (permissions as string[]).filter((permission) =>
      VALID_PERMISSIONS.includes(permission as ApiKeyPermission),
    ) as ApiKeyPermission[];
    if (validPermissions.length !== permissions.length) {
      return apiError("invalid_permissions", 400);
    }

    let expiresAtDate: Date | null = null;
    if (typeof expiresAt === "string") {
      expiresAtDate = new Date(expiresAt);
      if (Number.isNaN(expiresAtDate.getTime())) {
        return apiError("invalid_expires_at", 400);
      }
      if (expiresAtDate < new Date()) return apiError("expires_at_in_past", 400);
    }

    let whitelist: string[] | null = null;
    if (Array.isArray(ipWhitelist)) {
      whitelist = ipWhitelist.filter((ip): ip is string => typeof ip === "string");
    }

    const normalizedName = name.trim();
    const correlationId = resolveSensitiveAuditCorrelation(
      req.headers.get("x-tecpey-request-id"),
    );
    const requestHash = hashSensitiveAuditRequest({
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      actorType,
      actorId: userId,
      action: "api_key.create",
      name: normalizedName,
      permissions: [...validPermissions].sort(),
      ipWhitelist: whitelist ? [...whitelist].sort() : null,
      expiresAt: expiresAtDate?.toISOString() ?? null,
    });

    try {
      const { apiKey, plaintext } = await createApiKey({
        userId,
        name: normalizedName,
        permissions: validPermissions,
        ipWhitelist: whitelist,
        expiresAt: expiresAtDate,
        audit: {
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          actorType,
          actorId: userId,
          correlationId,
          requestHash,
        },
      });

      return apiOk({ apiKey, plaintext }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      if (message === "api_key_limit_reached") {
        return apiError("api_key_limit_reached", 422);
      }
      return apiError("api_key_service_unavailable", 503);
    }
  });
}
