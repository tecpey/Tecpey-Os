// PATCH /api/auth/devices/[id]  — rename a known device transactionally.
// DELETE /api/auth/devices/[id] — remove a device and revoke its bound authority.

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import {
  removeKnownDeviceAuthority,
  renameKnownDeviceAuthority,
} from "@/lib/security/session-authority";
import { PLATFORM } from "@/lib/platform-config";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
} from "@/lib/security/sensitive-mutation-audit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withObservability(req, { route: "/api/auth/devices/[id] PATCH" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, {
      namespace: "auth-devices-patch",
      limit: 20,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const boundedBodyRequest = await readBoundedJsonRequest(req, {
      maxBytes: 2_048,
      allowEmptyObject: true,
    });
    if (!boundedBodyRequest.ok) {
      return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
    }
    req = boundedBodyRequest.request;
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : null;
    if (!name) return apiError("name_required", 400);

    const correlationId = resolveSensitiveAuditCorrelation(
      req.headers.get("x-tecpey-request-id"),
    );
    try {
      const result = await renameKnownDeviceAuthority({
        userId,
        deviceId: id,
        name,
        audit: {
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          actorType: "user",
          actorId: userId,
          correlationId,
          requestHash: hashSensitiveAuditRequest({
            tenantId: PLATFORM.DEFAULT_TENANT_ID,
            action: "device.rename",
            userId,
            deviceId: id,
            name,
          }),
        },
      });
      if (!result.ok) return apiError("device_not_found", 404);
      return apiOk({ renamed: true });
    } catch {
      return apiError("device_registry_unavailable", 503);
    }
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withObservability(req, { route: "/api/auth/devices/[id] DELETE" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, {
      namespace: "auth-devices-delete",
      limit: 10,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const correlationId = resolveSensitiveAuditCorrelation(
      req.headers.get("x-tecpey-request-id"),
    );
    try {
      const result = await removeKnownDeviceAuthority({
        userId,
        deviceId: id,
        audit: {
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          actorType: "user",
          actorId: userId,
          correlationId,
          requestHash: hashSensitiveAuditRequest({
            tenantId: PLATFORM.DEFAULT_TENANT_ID,
            action: "device.remove",
            userId,
            deviceId: id,
          }),
        },
      });
      if (!result.ok) return apiError("device_not_found", 404);
      return apiOk({
        removed: true,
        revokedCount: result.revokedCount,
        revocationPending: result.revocationPending,
      });
    } catch {
      return apiError("device_registry_unavailable", 503);
    }
  });
}
