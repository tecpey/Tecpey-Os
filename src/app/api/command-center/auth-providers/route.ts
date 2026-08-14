import { NextRequest } from "next/server";
import { apiError, apiOk, checkBodySize, Validate } from "@/lib/api-validation";
import { authorizeAdminRequest } from "@/lib/admin-control-plane";
import {
  evaluateAuthProviderUpdate,
  isAuthProviderId,
  resolveAuthProviderControlSnapshot,
} from "@/lib/admin-auth-provider-control-plane";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/auth-providers" }, async () => {
    const limit = await rateLimit(req, {
      namespace: "command-center-auth-providers-read",
      limit: 60,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const authorization = await authorizeAdminRequest(req, "admin.roles.read");
    if (!authorization.ok) return apiError(authorization.error, authorization.status);

    return apiOk(
      {
        configured: true,
        tenantId: authorization.principal.tenantId,
        workspaceId: authorization.principal.workspaceId,
        snapshot: resolveAuthProviderControlSnapshot(),
      },
      200,
      { "Cache-Control": "no-store, max-age=0" },
    );
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/auth-providers" }, async () => {
    const limit = await rateLimit(req, {
      namespace: "command-center-auth-providers-write",
      limit: 20,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);
    if (!checkBodySize(req.headers.get("content-length"), 8_192)) {
      return apiError("body_too_large", 413);
    }

    const authorization = await authorizeAdminRequest(req, "admin.roles.manage", {
      stepUpWithinSeconds: 300,
    });
    if (!authorization.ok) return apiError(authorization.error, authorization.status);

    const body = await req.json().catch(() => null);
    const providerId = isAuthProviderId((body as { providerId?: unknown } | null)?.providerId)
      ? (body as { providerId: ReturnType<typeof String> }).providerId
      : null;
    const requestedState = Validate.oneOf(
      (body as { requestedState?: unknown } | null)?.requestedState,
      ["enabled", "disabled"] as const,
    );

    if (!providerId || !requestedState) {
      return apiError("invalid_auth_provider_control_request", 400);
    }

    const decision = evaluateAuthProviderUpdate({ providerId, requestedState });
    if (!decision.ok) {
      return apiError(decision.error, decision.httpStatus, {
        providerId: decision.providerId,
        requestedState: decision.requestedState,
        missingGateIds: decision.missingGateIds,
      });
    }

    return apiOk({ decision }, 202, { "Cache-Control": "no-store, max-age=0" });
  });
}
