// GET /api/auth/devices — fail-closed known-device registry.

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { listKnownDevicesAuthority } from "@/lib/security/session-authority";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/devices" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, {
      namespace: "auth-devices",
      limit: 30,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    try {
      const devices = await listKnownDevicesAuthority(userId);
      return apiOk({
        devices: devices.map((device) => ({
          id: device.id,
          deviceName: device.deviceName ?? "Unknown Device",
          firstSeenAt: device.firstSeenAt,
          lastSeenAt: device.lastSeenAt,
        })),
      });
    } catch {
      return apiError("device_registry_unavailable", 503);
    }
  });
}
