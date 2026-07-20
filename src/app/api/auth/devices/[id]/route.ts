// PATCH /api/auth/devices/[id]  — transactionally rename a known device
// DELETE /api/auth/devices/[id] — remove the device and revoke its bound authority

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import {
  renameKnownDevice,
  removeKnownDevice,
} from "@/lib/security/session-authority";
import { buildSessionAuditContext } from "@/lib/security/session-route-context";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

function actorType(session: Awaited<ReturnType<typeof getCanonicalSession>>) {
  if (session.isAdmin) return "admin" as const;
  return session.userId ? "user" as const : "student" as const;
}

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

    const result = await renameKnownDevice({
      id,
      userId,
      name,
      audit: buildSessionAuditContext({
        req,
        userId,
        actorType: actorType(session),
        action: "device.rename",
        evidence: { deviceId: id, name },
      }),
    });
    if (!result.ok) {
      if (result.reason === "device_not_found") return apiError("device_not_found", 404);
      return apiError("device_registry_unavailable", 503);
    }

    return apiOk({ renamed: true });
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

    const result = await removeKnownDevice({
      id,
      userId,
      audit: buildSessionAuditContext({
        req,
        userId,
        actorType: actorType(session),
        action: "device.remove",
        evidence: { deviceId: id },
      }),
    });
    if (!result.ok) {
      if (result.reason === "device_not_found") return apiError("device_not_found", 404);
      return apiError("device_registry_unavailable", 503);
    }

    return apiOk({
      removed: true,
      revokedCount: result.revokedCount,
      denyCachePending: result.denyCachePending,
    });
  });
}
