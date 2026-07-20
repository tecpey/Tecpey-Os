// PATCH /api/auth/devices/[id]  — rename a known device
// DELETE /api/auth/devices/[id] — remove a device from the trusted registry

import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { withDb } from "@/lib/db";
import { writeAudit } from "@/lib/security/audit-log";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withObservability(req, { route: "/api/auth/devices/[id] PATCH" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, { namespace: "auth-devices-patch", limit: 20, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : null;
    if (!name) return apiError("name_required", 400);

    const dbResult = await withDb(async (db) => {
      const res = await db.query(
        `UPDATE known_devices SET device_name = $1 WHERE id = $2 AND user_id = $3 RETURNING id`,
        [name, id, userId],
      );
      return res.rowCount ?? 0;
    });

    if (!dbResult.enabled || dbResult.value === 0) return apiError("device_not_found", 404);

    writeAudit({
      actorId: userId,
      action: "admin_action",
      ip: getClientIp(req),
      metadata: { event: "device_renamed", deviceId: id, newName: name },
    });

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

    const rlimit = await rateLimit(req, { namespace: "auth-devices-delete", limit: 10, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const dbResult = await withDb(async (db) => {
      const res = await db.query(
        `DELETE FROM known_devices WHERE id = $1 AND user_id = $2 RETURNING id`,
        [id, userId],
      );
      return res.rowCount ?? 0;
    });

    if (!dbResult.enabled || dbResult.value === 0) return apiError("device_not_found", 404);

    writeAudit({
      actorId: userId,
      action: "admin_action",
      ip: getClientIp(req),
      metadata: { event: "device_removed", deviceId: id },
    });

    return apiOk({ removed: true });
  });
}
